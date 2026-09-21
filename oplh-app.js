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
let wmsRows=[],tdRows=[],workRows=[],imports=[],analysis=null;

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
async function importWms(file){
 setImportStatus('WMS CSVを解析中…');await new Promise(r=>setTimeout(r,20));
 const text=await readCsvText(file),agg=new Map(),range={min:'',max:''};let header=null,ix=null,sourceRows=0,usedRows=0;
 eachCsvRow(text,(row,no)=>{
  if(no===0){header=row;ix=getIndices(header,{date:'業務日付',activity:'作業区分',qty:'実績数',code:'作業者コード',name:'作業者名'});return}
  sourceRows++;
  const label=String(row[ix.activity]||'').trim(),key=WMS_MAP[label];if(!key)return;
  const d=dateOnly(row[ix.date]);if(!d)return;minmax(range,d);
  const name=String(row[ix.name]||'').trim(),code=String(row[ix.code]||'').trim(),workerKey=code||normName(name);if(!workerKey)return;
  const k=[d,workerKey,key].join('|'),q=num(String(row[ix.qty]||'').replaceAll(',',''));
  let a=agg.get(k);if(!a){a={work_date:d,worker_key:workerKey,worker_code:code||null,worker_name:name,activity_key:key,activity_label:label,action_count:0,quantity:0};agg.set(k,a)}
  if(key==='stock_move'){if(q>0){a.action_count++;a.quantity+=q;usedRows++}}
  else if(q>0){a.action_count++;a.quantity+=q;usedRows++}
 });
 if(!agg.size)throw new Error('対象となるWMS作業データがありません。');
 const batch=await rest('oplh_import_batches','select=*',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:user.id,source:'wms',source_filename:file.name,period_start:range.min,period_end:range.max,source_rows:sourceRows,aggregate_rows:agg.size})});
 const batchId=batch?.[0]?.id||null;
 await rest('oplh_wms_daily','owner_id=eq.'+user.id+'&work_date=gte.'+range.min+'&work_date=lte.'+range.max,{method:'DELETE'});
 const rows=[...agg.values()].map(r=>({...r,owner_id:user.id,staff_id:staffByName(r.worker_name)?.id||null,batch_id:batchId,updated_at:new Date().toISOString()}));
 await chunkUpsert('oplh_wms_daily',rows,'owner_id,work_date,worker_key,activity_key');
 setImportStatus('WMS取込完了：元データ '+sourceRows.toLocaleString()+'行 / 対象 '+usedRows.toLocaleString()+'行 → 日別集計 '+rows.length.toLocaleString()+'件','good');
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
 const p=periodText();$('refreshBtn').disabled=true;$('dataState').textContent='読み込み中…';
 try{
  const q='owner_id=eq.'+user.id+'&work_date=gte.'+p.start+'&work_date=lte.'+p.end;
  [staff,wmsRows,tdRows,workRows,imports]=await Promise.all([
   restAll('logistics_staff','owner_id=eq.'+user.id+'&select=id,name,employment_type,retirement_date,is_active&order=name.asc'),
   restAll('oplh_wms_daily',q+'&select=*'),
   restAll('oplh_timedesigner_daily',q+'&select=*'),
   restAll('logistics_work_time',q+'&select=staff_id,work_date,picking_minutes'),
   rest('oplh_import_batches','owner_id=eq.'+user.id+'&select=*&order=imported_at.desc&limit=12')
  ]);
  analysis=buildAnalysis();renderAll();
  $('dataState').textContent='WMS '+wmsRows.length.toLocaleString()+'件 / TimeDesigner '+tdRows.length.toLocaleString()+'件 / パート時間 '+workRows.length.toLocaleString()+'件';
 }catch(e){$('dataState').textContent='読み込みエラー：'+e.message}
 finally{$('refreshBtn').disabled=false}
}
function blankMetric(){return{quantity:0,actions:0,tdMinutes:0,partMinutes:0,minutes:0,source:'',oplh:null}}
function buildAnalysis(){
 const byStaff=new Map(),unmatchedW=new Map(),unmatchedT=new Map();
 const ensure=sid=>{if(!byStaff.has(sid))byStaff.set(sid,{metrics:{},timeOnly:{}});return byStaff.get(sid)};
 const getMetric=(sid,key)=>{const o=ensure(sid);if(!o.metrics[key])o.metrics[key]=blankMetric();return o.metrics[key]};
 for(const r of wmsRows){
  const sid=resolveStaffId(r);if(!sid){const k=r.worker_code||r.worker_name;unmatchedW.set(k,{name:r.worker_name,code:r.worker_code,qty:(unmatchedW.get(k)?.qty||0)+num(r.quantity)});continue}
  const m=getMetric(sid,r.activity_key);m.quantity+=num(r.quantity);m.actions+=num(r.action_count);
 }
 for(const r of tdRows){
  const sid=resolveStaffId(r);if(!sid){const k=r.employee_no||r.worker_name;unmatchedT.set(k,{name:r.worker_name,code:r.employee_no,minutes:(unmatchedT.get(k)?.minutes||0)+num(r.work_minutes)});continue}
  if(TIME_ONLY.some(x=>x.key===r.activity_key)){const o=ensure(sid);o.timeOnly[r.activity_key]=(o.timeOnly[r.activity_key]||0)+num(r.work_minutes)}
  else getMetric(sid,r.activity_key).tdMinutes+=num(r.work_minutes);
 }
 for(const r of workRows){if(r.staff_id)getMetric(r.staff_id,'picking').partMinutes+=num(r.picking_minutes)}
 for(const [sid,o] of byStaff){
  for(const a of ACTIVITIES){
   const m=o.metrics[a.key]||blankMetric();o.metrics[a.key]=m;
   if(a.key==='picking'){
    if(m.tdMinutes>0){m.minutes=m.tdMinutes;m.source='TimeDesigner'}
    else if(m.partMinutes>0){m.minutes=m.partMinutes;m.source='時間管理'}
   }else if(m.tdMinutes>0){m.minutes=m.tdMinutes;m.source='TimeDesigner'}
   if(a.oplh&&m.minutes>0)m.oplh=null;
  }
 }
 return{byStaff,unmatchedW:[...unmatchedW.values()],unmatchedT:[...unmatchedT.values()]};
}
function selectedActivity(){return ACTIVITIES.find(x=>x.key===$('activity').value)||ACTIVITIES[0]}
function selectedBasis(){return $('basisMode')?.value==='quantity'?'quantity':'actions'}
function metricValue(m,basis=selectedBasis()){return basis==='quantity'?num(m.quantity):num(m.actions)}
function metricOplh(m,a=selectedActivity(),basis=selectedBasis()){return a.oplh&&m.minutes>0?metricValue(m,basis)/(m.minutes/60):null}
function overallFor(a){
 const basis=selectedBasis();let qty=0,actions=0,mins=0,covered=0,total=0;
 for(const r of wmsRows)if(r.activity_key===a.key)total+=basis==='quantity'?num(r.quantity):num(r.action_count);
 for(const [sid,o] of analysis.byStaff){
  const m=o.metrics[a.key]||blankMetric();qty+=m.quantity;actions+=m.actions;
  if(m.minutes>0){mins+=m.minutes;covered+=metricValue(m,basis)}
 }
 return{qty,actions,mins,oplh:a.oplh&&mins>0?covered/(mins/60):null,coverage:total>0?covered/total*100:0,total};
}
function renderAll(){renderActivity();renderTimeOnly();renderUnmatched();renderImports()}
function renderActivity(){
 const a=selectedActivity(),basis=selectedBasis(),ov=overallFor(a),basisLabel=basis==='quantity'?'処理点数（実績数）':'WMS作業回数';
 $('metricNumeratorLabel').textContent=basisLabel;
 $('metricQty').textContent=fmt(ov.total,0)+(basis==='quantity'?'点':'回');
 $('metricHours').textContent=a.oplh?fmt(ov.mins/60,1)+'h':'—';
 $('metricOplh').textContent=a.oplh&&ov.oplh!=null?fmt(ov.oplh,1):'算出対象外';
 $('metricCoverage').textContent=a.oplh?fmt(ov.coverage,1)+'%':'—';
 $('activityNote').textContent=a.oplh?'OPLH = '+basisLabel+' ÷ 作業時間。基準は切替可能です。ピッキング時間はTimeDesignerを優先し、記録がない人はパート時間管理のピッキング時間を使用します。':'調整出庫はWMS実績のみ表示し、OPLHは算出しません。';
 let rows=[];
 for(const s of staff){
  const o=analysis.byStaff.get(s.id),m=o?.metrics?.[a.key];if(!m||(m.quantity===0&&m.minutes===0))continue;
  rows.push({s,m});
 }
 const mode=$('sortMode').value;
 rows.sort((x,y)=>{
  if(mode==='oplh')return(num(metricOplh(y.m,a,basis))-num(metricOplh(x.m,a,basis)))||x.s.name.localeCompare(y.s.name,'ja');
  if(mode==='qty')return(y.m.quantity-x.m.quantity)||x.s.name.localeCompare(y.s.name,'ja');
  return x.s.name.localeCompare(y.s.name,'ja');
 });
 let html='<tr class="total"><td><b>全体</b></td><td>—</td><td class="num"><b>'+fmt(ov.qty,0)+'</b></td><td class="num">'+fmt(ov.actions,0)+'</td><td class="num">'+(a.oplh?fmt(ov.mins/60,1)+'h':'—')+'</td><td class="num"><b>'+(a.oplh&&ov.oplh!=null?fmt(ov.oplh,1):'—')+'</b></td><td>—</td></tr>';
 for(const {s,m} of rows){const oplh=metricOplh(m,a,basis);html+='<tr><td><b>'+esc(s.name)+'</b></td><td>'+esc(s.employment_type||'')+'</td><td class="num">'+fmt(m.quantity,0)+'</td><td class="num">'+fmt(m.actions,0)+'</td><td class="num">'+(m.minutes?fmt(m.minutes/60,2)+'h':'—')+'</td><td class="num oplh">'+(oplh!=null?fmt(oplh,1):'—')+'</td><td>'+esc(m.source||'時間なし')+'</td></tr>'}
 if(!rows.length)html+='<tr><td colspan="7" class="muted">この月度のデータがありません。</td></tr>';
 $('performanceBody').innerHTML=html;
}
function renderTimeOnly(){
 const totals=Object.fromEntries(TIME_ONLY.map(x=>[x.key,0]));
 const people=Object.fromEntries(TIME_ONLY.map(x=>[x.key,new Set()]));
 for(const [sid,o] of analysis.byStaff)for(const t of TIME_ONLY){const m=num(o.timeOnly[t.key]);if(m){totals[t.key]+=m;people[t.key].add(sid)}}
 $('timeOnlyBody').innerHTML=TIME_ONLY.map(t=>'<tr><td>'+esc(t.label)+'</td><td class="num">'+fmt(totals[t.key]/60,1)+'h</td><td class="num">'+people[t.key].size+'人</td><td class="muted">処理件数データなし</td></tr>').join('');
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
 if(!$('activity').options.length)for(const a of ACTIVITIES){const o=document.createElement('option');o.value=a.key;o.textContent=a.label;$('activity').appendChild(o)}
 $('month').onchange=loadData;$('activity').onchange=renderActivity;$('basisMode').onchange=renderActivity;$('sortMode').onchange=renderActivity;$('refreshBtn').onclick=loadData;
 $('wmsImportBtn').onclick=()=>handleImport('wms');$('tdImportBtn').onclick=()=>handleImport('td');
 await loadData();
}