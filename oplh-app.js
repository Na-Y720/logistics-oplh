const ACTIVITIES=[
 {key:'picking',label:'オーダーピッキング',wms:'ピッキング',oplh:true},
 {key:'stock_move',label:'在庫移動',wms:'在庫移動',oplh:true},
 {key:'receiving',label:'入庫',wms:'調整入庫',oplh:true},
 {key:'shipping_check',label:'出荷検品',wms:'出荷検品',oplh:true},
 {key:'adjustment_out',label:'調整出庫',wms:'調整出庫',oplh:false}
];
const WMS_MAP=Object.fromEntries(ACTIVITIES.map(x=>[x.wms,x.key]));
const TD_MAP={
 'オーダーピッキング（送り状ピッキング）':'picking',
 '在庫移動':'stock_move',
 '入庫':'receiving',
 '出荷検品（複数ピッキング）':'shipping_check',
 'トータルピッキング（トータル回収作業）':'total_picking',
 '手動梱包':'hand_pack',
 'パスソート':'pass_sort',
 '自動梱包機':'auto_pack'
};
const TIME_ONLY=[
 {key:'total_picking',label:'トータルピッキング'},
 {key:'hand_pack',label:'手動梱包'},
 {key:'pass_sort',label:'パスソート'},
 {key:'auto_pack',label:'自動梱包機'}
];
let wmsRows=[],tdRows=[],workRows=[],imports=[],shipmentSummary=[],analysis=null;
let pickingSort={key:'name',dir:'asc'};

function setImportStatus(msg,type=''){
 const el=$('importStatus');if(!el)return;
 el.textContent=msg||'';el.className='statusline '+type;
}
function activityLabel(key){
 return ACTIVITIES.find(x=>x.key===key)?.label||TIME_ONLY.find(x=>x.key===key)?.label||key;
}
function staffByName(name){
 const n=normName(name);return staff.find(s=>normName(s.name)===n)||null;
}
function resolveStaffId(row){
 if(row.staff_id&&staff.some(s=>s.id===row.staff_id))return row.staff_id;
 return staffByName(row.worker_name)?.id||null;
}
function externalStaffId(name){
 const n=normName(name);return n?'ext:'+n:null;
}
function cleanStaffName(name){
 return String(name??'').normalize('NFKC').replace(/^[0-9]{6}[\s　\u00A0]*/,'').trim();
}
function periodText(){
 const p=planPeriod($('month').value);
 $('periodLabel').textContent=jpDate(p.start)+' ～ '+jpDate(p.end);
 return p;
}
async function readCsvText(file){
 const buf=await file.arrayBuffer();
 let text=new TextDecoder('utf-8').decode(buf);
 const bad=(text.match(/\uFFFD/g)||[]).length;
 if(bad>0)text=new TextDecoder('shift_jis').decode(buf);
 return text.replace(/^\uFEFF/,'');
}
function eachCsvRow(text,cb){
 let row=[],field='',quoted=false,rowNo=0;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(ch==='"'){
   if(quoted&&text[i+1]==='"'){field+='"';i++}
   else quoted=!quoted;
  }else if(!quoted&&ch===','){
   row.push(field);field='';
  }else if(!quoted&&(ch==='\n'||ch==='\r')){
   if(ch==='\r'&&text[i+1]==='\n')i++;
   row.push(field);field='';
   if(row.some(v=>v!==''))cb(row,rowNo++);
   row=[];
  }else field+=ch;
 }
 if(field!==''||row.length){row.push(field);cb(row,rowNo)}
}
function dateOnly(v){
 const m=String(v||'').match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
 return m?m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0'):'';
}
function getIndices(header,names){
 const out={};for(const [k,label] of Object.entries(names)){out[k]=header.indexOf(label);if(out[k]<0)throw new Error('必要列「'+label+'」がありません。')}
 return out;
}
function minmax(current,d){
 if(!d)return current;
 if(!current.min||d<current.min)current.min=d;
 if(!current.max||d>current.max)current.max=d;
 return current;
}
function monthForWorkDate(d){
 const m=String(d||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';
 let y=Number(m[1]),mon=Number(m[2]),day=Number(m[3]);
 if(day>=21){mon++;if(mon===13){y++;mon=1}}
 return y+'-'+String(mon).padStart(2,'0');
}
async function importWms(file){
 setImportStatus('WMS CSVを解析中…');await new Promise(r=>setTimeout(r,20));
 const text=await readCsvText(file),agg=new Map(),range={min:'',max:''},shipmentSets=new Map();let header=null,ix=null,sourceRows=0,usedRows=0;
 eachCsvRow(text,(row,no)=>{
  if(no===0){header=row;ix=getIndices(header,{date:'業務日付',activity:'作業区分',qty:'実績数',slip:'伝票No',code:'作業者コード',name:'作業者名'});return}
  sourceRows++;
  const label=String(row[ix.activity]||'').trim(),key=WMS_MAP[label];if(!key)return;
  const d=dateOnly(row[ix.date]);if(!d)return;minmax(range,d);
  if(label==='ピッキング'){
   const slip=String(row[ix.slip]||'').trim(),ym=monthForWorkDate(d);
   if(slip&&ym){if(!shipmentSets.has(ym))shipmentSets.set(ym,new Set());shipmentSets.get(ym).add(slip)}
  }
  const workerCodeIndex=row.length>=6?row.length-6:ix.code,workerNameIndex=row.length>=5?row.length-5:ix.name;
  const name=String(row[workerNameIndex]||'').trim(),code=String(row[workerCodeIndex]||'').trim(),workerKey=code||normName(name);if(!workerKey)return;
  const k=[d,workerKey,key].join('|'),q=num(String(row[ix.qty]||'').replaceAll(',',''));
  let a=agg.get(k);if(!a){a={work_date:d,worker_key:workerKey,worker_code:code||null,worker_name:name,activity_key:key,activity_label:label,action_count:0,quantity:0};agg.set(k,a)}
  if(q>0){a.action_count++;a.quantity+=q;usedRows++}
 });
 if(!agg.size)throw new Error('対象となるWMS作業データがありません。');
 const batch=await rest('oplh_import_batches','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:user.id,source:'wms',source_filename:file.name,period_start:range.min,period_end:range.max,source_rows:sourceRows,aggregate_rows:agg.size})});
 const batchId=batch?.[0]?.id||null;
 await rest('oplh_wms_daily','owner_id=eq.'+user.id+'&work_date=gte.'+range.min+'&work_date=lte.'+range.max,{method:'DELETE'});
 const rows=[...agg.values()].map(r=>({...r,owner_id:user.id,staff_id:staffByName(r.worker_name)?.id||null,batch_id:batchId,updated_at:new Date().toISOString()}));
 await chunkUpsert('oplh_wms_daily',rows,'owner_id,work_date,worker_key,activity_key');
 const summaries=[];
 for(const [ym,set] of shipmentSets){
  const p=planPeriod(ym);
  if(range.min<=p.start&&range.max>=p.end)summaries.push({owner_id:user.id,month_ym:ym,period_start:p.start,period_end:p.end,shipment_count:set.size,batch_id:batchId,updated_at:new Date().toISOString()});
 }
 if(summaries.length)await chunkUpsert('oplh_wms_monthly_summary',summaries,'owner_id,month_ym',50);
 const shipText=summaries.length?' / 月度出荷件数 '+summaries.map(x=>x.month_ym+'='+x.shipment_count.toLocaleString()+'件').join(', '):' / 完結月度なし（出荷件数集計は更新なし）';
 setImportStatus('WMS取込完了：元データ '+sourceRows.toLocaleString()+'行 / 対象 '+usedRows.toLocaleString()+'行 → 日別集計 '+rows.length.toLocaleString()+'件'+shipText,'good');
}
async function importTd(file){
 setImportStatus('TimeDesigner CSVを解析中…');await new Promise(r=>setTimeout(r,20));
 const text=await readCsvText(file),agg=new Map(),range={min:'',max:''};let ix=null,sourceRows=0,usedRows=0;
 eachCsvRow(text,(row,no)=>{
  if(no===0){ix=getIndices(row,{name:'作業履歴_作業担当者',employee:'作業履歴_作業担当者_従業員番号',start:'作業履歴_作業開始日時',minutes:'作業履歴_作業時間(分)',task:'タスク_タスク名'});return}
  sourceRows++;
  const task=String(row[ix.task]||'').trim(),key=TD_MAP[task];if(!key)return;
  const d=dateOnly(row[ix.start]);if(!d)return;minmax(range,d);
  const name=String(row[ix.name]||'').trim(),employee=String(row[ix.employee]||'').trim(),workerKey=employee||normName(name);if(!workerKey)return;
  const k=[d,workerKey,key].join('|'),mins=Math.max(0,num(row[ix.minutes]));
  let a=agg.get(k);if(!a){a={work_date:d,worker_key:workerKey,employee_no:employee||null,worker_name:name,activity_key:key,activity_label:task,event_count:0,work_minutes:0};agg.set(k,a)}
  a.event_count++;a.work_minutes+=mins;usedRows++;
 });
 if(!agg.size)throw new Error('対象となるTimeDesigner作業データがありません。');
 const batch=await rest('oplh_import_batches','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:user.id,source:'timedesigner',source_filename:file.name,period_start:range.min,period_end:range.max,source_rows:sourceRows,aggregate_rows:agg.size})});
 const batchId=batch?.[0]?.id||null;
 await rest('oplh_timedesigner_daily','owner_id=eq.'+user.id+'&work_date=gte.'+range.min+'&work_date=lte.'+range.max,{method:'DELETE'});
 const rows=[...agg.values()].map(r=>({...r,owner_id:user.id,staff_id:staffByName(r.worker_name)?.id||null,batch_id:batchId,updated_at:new Date().toISOString()}));
 await chunkUpsert('oplh_timedesigner_daily',rows,'owner_id,work_date,worker_key,activity_key');
 setImportStatus('TimeDesigner取込完了：元データ '+sourceRows.toLocaleString()+'行 / 対象 '+usedRows.toLocaleString()+'行 → 日別集計 '+rows.length.toLocaleString()+'件','good');
}
async function handleImport(kind){
 const input=$(kind==='wms'?'wmsFile':'tdFile'),file=input.files?.[0];if(!file)return;
 $('wmsImportBtn').disabled=true;$('tdImportBtn').disabled=true;
 try{if(kind==='wms')await importWms(file);else await importTd(file);await loadData()}
 catch(e){setImportStatus('取込エラー：'+e.message,'bad')}
 finally{$('wmsImportBtn').disabled=false;$('tdImportBtn').disabled=false;input.value=''}
}
async function loadData(){
 const p=periodText(),ym=$('month').value;$('refreshBtn').disabled=true;$('dataState').textContent='読み込み中…';
 try{
  const q='owner_id=eq.'+user.id+'&work_date=gte.'+p.start+'&work_date=lte.'+p.end;
  [staff,wmsRows,tdRows,workRows,imports,shipmentSummary]=await Promise.all([
   restAll('logistics_staff','owner_id=eq.'+user.id+'&select=id,name,employment_type,retirement_date,is_active&order=name.asc'),
   restAll('oplh_wms_daily',q+'&select=*'),
   restAll('oplh_timedesigner_daily',q+'&select=*'),
   restAll('logistics_work_time',q+'&select=staff_id,work_date,picking_minutes,hand_pack_minutes,auto_pack_minutes,pass_sort_minutes,sorting_minutes'),
   rest('oplh_import_batches','owner_id=eq.'+user.id+'&select=*&order=imported_at.desc&limit=12'),
   rest('oplh_wms_monthly_summary','owner_id=eq.'+user.id+'&month_ym=eq.'+ym+'&select=*')
  ]);
  analysis=buildAnalysis();renderAll();
  const ship=num(shipmentSummary?.[0]?.shipment_count);
  $('dataState').textContent='出荷 '+(ship?ship.toLocaleString()+'件':'未集計')+' / WMS '+wmsRows.length.toLocaleString()+'件 / TimeDesigner '+tdRows.length.toLocaleString()+'件 / 時間管理 '+workRows.length.toLocaleString()+'件';
 }catch(e){$('dataState').textContent='読み込みエラー：'+e.message}
 finally{$('refreshBtn').disabled=false}
}
function blankMetric(){return{quantity:0,actions:0,tdMinutes:0,partMinutes:0,minutes:0,source:''}}
function buildAnalysis(){
 const byStaff=new Map(),unmatchedW=new Map(),unmatchedT=new Map();
 const people=new Map(staff.map(s=>[s.id,{...s,name:String(s.name??'').trim()}]));
 const ensure=(sid,name='')=>{
  if(!people.has(sid))people.set(sid,{id:sid,name:cleanStaffName(name)||name||'未登録',employment_type:'未登録'});
  if(!byStaff.has(sid))byStaff.set(sid,{picking:blankMetric(),timeOnly:{}});
  return byStaff.get(sid);
 };
 const tdCovered=new Set(),overallMinutes={picking:0,hand_pack:0,auto_pack:0};
 for(const r of wmsRows){
  if(r.activity_key!=='picking')continue;
  const linked=resolveStaffId(r),sid=linked||externalStaffId(r.worker_name);if(!sid)continue;
  if(!linked){const k=r.worker_code||r.worker_name;unmatchedW.set(k,{name:r.worker_name,code:r.worker_code,qty:(unmatchedW.get(k)?.qty||0)+num(r.quantity)})}
  const m=ensure(sid,r.worker_name).picking;m.quantity+=num(r.quantity);m.actions+=num(r.action_count);
 }
 for(const r of tdRows){
  const linked=resolveStaffId(r),sid=linked||externalStaffId(r.worker_name);if(!sid)continue;
  if(!linked){const k=r.employee_no||r.worker_name;unmatchedT.set(k,{name:r.worker_name,code:r.employee_no,minutes:(unmatchedT.get(k)?.minutes||0)+num(r.work_minutes)})}
  const mins=num(r.work_minutes),key=r.activity_key;
  if(['picking','hand_pack','auto_pack'].includes(key)){
   overallMinutes[key]+=mins;
   if(linked)tdCovered.add(linked+'|'+r.work_date+'|'+key);
  }
  if(key==='picking')ensure(sid,r.worker_name).picking.tdMinutes+=mins;
  if(['total_picking','pass_sort'].includes(key)){const o=ensure(sid,r.worker_name);o.timeOnly[key]=(o.timeOnly[key]||0)+mins}
 }
 for(const r of workRows){
  const sid=r.staff_id;if(!sid)continue;
  const o=ensure(sid,people.get(sid)?.name||'');
  const fields=[['picking','picking_minutes'],['hand_pack','hand_pack_minutes'],['auto_pack','auto_pack_minutes']];
  for(const [key,field] of fields){
   const mins=num(r[field]);if(!mins)continue;
   const covered=tdCovered.has(sid+'|'+r.work_date+'|'+key);
   if(!covered)overallMinutes[key]+=mins;
   if(key==='picking'&&!covered)o.picking.partMinutes+=mins;
  }
  const pass=num(r.pass_sort_minutes);if(pass)o.timeOnly.pass_sort=(o.timeOnly.pass_sort||0)+pass;
 }
 for(const [,o] of byStaff){
  const m=o.picking;m.minutes=m.tdMinutes+m.partMinutes;
  if(m.tdMinutes>0&&m.partMinutes>0)m.source='TimeDesigner＋時間管理';
  else if(m.tdMinutes>0)m.source='TimeDesigner';
  else if(m.partMinutes>0)m.source='時間管理';
 }
 const shipmentCount=num(shipmentSummary?.[0]?.shipment_count);
 const totalMinutes=overallMinutes.picking+overallMinutes.hand_pack+overallMinutes.auto_pack;
 return{
  byStaff,people,unmatchedW:[...unmatchedW.values()],unmatchedT:[...unmatchedT.values()],
  overall:{...overallMinutes,totalMinutes,shipmentCount,oplh:shipmentCount>0&&totalMinutes>0?shipmentCount/(totalMinutes/60):null}
 };
}
function avgPickSeconds(m){return m.quantity>0&&m.minutes>0?m.minutes*60/m.quantity:null}
function avgActionSeconds(m){return m.actions>0&&m.minutes>0?m.minutes*60/m.actions:null}
function renderAll(){renderOverall();renderPicking();renderReferenceTimes();renderUnmatched();renderImports()}
function renderOverall(){
 const o=analysis.overall;
 $('metricShipments').textContent=o.shipmentCount?o.shipmentCount.toLocaleString()+'件':'—';
 $('metricPickingHours').textContent=fmt(o.picking/60,1)+'h';
 $('metricHandPackHours').textContent=fmt(o.hand_pack/60,1)+'h';
 $('metricAutoPackHours').textContent=fmt(o.auto_pack/60,1)+'h';
 $('metricTotalHours').textContent=fmt(o.totalMinutes/60,1)+'h';
 $('metricOplh').textContent=o.oplh!=null?fmt(o.oplh,1):'—';
 $('activityNote').textContent=o.shipmentCount
  ?'OPLH = 出荷件数 ÷（全体ピッキング時間＋手動梱包時間＋自動梱包機時間）。同じ人・同じ日・同じ作業に両方の時間記録がある場合はTimeDesignerを優先し、時間管理側は重複計上しません。'
  :'出荷件数が未集計です。対象月度を丸ごと含むWMS履歴CSVを取り込むと、伝票Noのユニーク数を出荷件数として保存します。';
}
function setPickingSort(key){
 const textKeys=new Set(['name','type','source']);
 if(pickingSort.key===key)pickingSort.dir=pickingSort.dir==='asc'?'desc':'asc';
 else pickingSort={key,dir:textKeys.has(key)?'asc':'desc'};
 renderPicking();
}
function updateSortHeaders(){
 document.querySelectorAll('#pickingTable th[data-sort]').forEach(th=>{
  const active=th.dataset.sort===pickingSort.key;
  th.classList.toggle('sort-active',active);
  th.setAttribute('aria-sort',active?(pickingSort.dir==='asc'?'ascending':'descending'):'none');
  const mark=th.querySelector('.sortmark');
  if(mark)mark.textContent=active?(pickingSort.dir==='asc'?'▲':'▼'):'↕';
 });
}
function renderPicking(){
 let rows=[];
 for(const [sid,o] of analysis.byStaff){
  const s=analysis.people.get(sid)||{id:sid,name:sid,employment_type:'未登録'},m=o.picking;
  if(!m||(m.quantity===0&&m.minutes===0))continue;
  rows.push({s,m,avg:avgPickSeconds(m),avgAction:avgActionSeconds(m)});
 }
 const dir=pickingSort.dir==='desc'?-1:1;
 const cmpText=(a,b)=>String(a??'').localeCompare(String(b??''),'ja');
 const cmpNum=(a,b)=>{
  const av=a==null?null:Number(a),bv=b==null?null:Number(b);
  if(av==null&&bv==null)return 0;
  if(av==null)return 1;
  if(bv==null)return -1;
  return av-bv;
 };
 rows.sort((x,y)=>{
  let c=0;
  if(pickingSort.key==='type')c=cmpText(x.s.employment_type,y.s.employment_type);
  else if(pickingSort.key==='qty')c=cmpNum(x.m.quantity,y.m.quantity);
  else if(pickingSort.key==='actions')c=cmpNum(x.m.actions,y.m.actions);
  else if(pickingSort.key==='minutes')c=cmpNum(x.m.minutes,y.m.minutes);
  else if(pickingSort.key==='avg')c=cmpNum(x.avg,y.avg);
  else if(pickingSort.key==='avgAction')c=cmpNum(x.avgAction,y.avgAction);
  else if(pickingSort.key==='source')c=cmpText(x.m.source||'時間なし',y.m.source||'時間なし');
  else c=cmpText(x.s.name,y.s.name);
  if(c===0)c=cmpText(x.s.name,y.s.name);
  return c*dir;
 });
 updateSortHeaders();
 let totalQty=0,totalActions=0,totalMins=0;
 for(const {m} of rows){totalQty+=m.quantity;totalActions+=m.actions;totalMins+=m.minutes}
 const totalAvg=totalQty>0&&totalMins>0?totalMins*60/totalQty:null;
 const totalAvgAction=totalActions>0&&totalMins>0?totalMins*60/totalActions:null;
 let html='<tr class="total"><td><b>全体</b></td><td>—</td><td class="num"><b>'+fmt(totalQty,0)+'</b></td><td class="num">'+fmt(totalActions,0)+'</td><td class="num"><b>'+fmt(totalMins/60,1)+'h</b></td><td class="num"><b>'+(totalAvg!=null?fmt(totalAvg,1)+'秒':'—')+'</b></td><td class="num"><b>'+(totalAvgAction!=null?fmt(totalAvgAction,1)+'秒':'—')+'</b></td><td>—</td></tr>';
 for(const {s,m,avg,avgAction} of rows)html+='<tr><td><b>'+esc(s.name)+'</b></td><td>'+esc(s.employment_type||'')+'</td><td class="num">'+fmt(m.quantity,0)+'</td><td class="num">'+fmt(m.actions,0)+'</td><td class="num">'+(m.minutes?fmt(m.minutes/60,2)+'h':'—')+'</td><td class="num oplh">'+(avg!=null?fmt(avg,1)+'秒':'—')+'</td><td class="num oplh">'+(avgAction!=null?fmt(avgAction,1)+'秒':'—')+'</td><td>'+esc(m.source||'時間なし')+'</td></tr>';
 if(!rows.length)html+='<tr><td colspan="8" class="muted">この月度のピッキングデータがありません。</td></tr>';
 $('performanceBody').innerHTML=html;
}
function renderReferenceTimes(){
 const keys=[{key:'total_picking',label:'トータルピッキング'},{key:'pass_sort',label:'パスソート'}];
 const totals=Object.fromEntries(keys.map(x=>[x.key,0])),people=Object.fromEntries(keys.map(x=>[x.key,new Set()]));
 for(const [sid,o] of analysis.byStaff)for(const t of keys){const m=num(o.timeOnly[t.key]);if(m){totals[t.key]+=m;people[t.key].add(sid)}}
 $('timeOnlyBody').innerHTML=keys.map(t=>'<tr><td>'+esc(t.label)+'</td><td class="num">'+fmt(totals[t.key]/60,1)+'h</td><td class="num">'+people[t.key].size+'人</td><td class="muted">OPLH分母には含めない</td></tr>').join('');
}
function renderUnmatched(){
 const all=[...analysis.unmatchedW.map(x=>({...x,src:'WMS'})),...analysis.unmatchedT.map(x=>({...x,src:'TimeDesigner'}))];
 $('unmatchedCount').textContent=all.length+'件';
 $('unmatchedBox').classList.toggle('hidden',!all.length);
 $('unmatchedBody').innerHTML=all.slice(0,50).map(x=>'<tr><td>'+x.src+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.code||'—')+'</td><td class="num">'+(x.src==='WMS'?fmt(x.qty,0)+'点':fmt(x.minutes/60,1)+'h')+'</td></tr>').join('');
}
function renderImports(){
 $('importBody').innerHTML=(imports||[]).map(x=>'<tr><td>'+new Date(x.imported_at).toLocaleString('ja-JP')+'</td><td>'+(x.source==='wms'?'WMS':'TimeDesigner')+'</td><td>'+esc(x.source_filename)+'</td><td>'+jpDate(x.period_start)+'～'+jpDate(x.period_end)+'</td><td class="num">'+num(x.source_rows).toLocaleString()+'</td></tr>').join('')||'<tr><td colspan="5" class="muted">取込履歴はありません。</td></tr>';
}
async function bootApp(){
 if(!$('month').value)$('month').value=currentYm();
 $('month').onchange=loadData;$('refreshBtn').onclick=loadData;
 document.querySelectorAll('#pickingTable th[data-sort]').forEach(th=>{th.onclick=()=>setPickingSort(th.dataset.sort)});
 $('wmsImportBtn').onclick=()=>handleImport('wms');$('tdImportBtn').onclick=()=>handleImport('td');
 $('wmsFile').onchange=()=>{if($('wmsFile').files?.[0])handleImport('wms')};
 $('tdFile').onchange=()=>{if($('tdFile').files?.[0])handleImport('td')};
 await loadData();
}
