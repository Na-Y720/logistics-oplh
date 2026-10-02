const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='logistics_monthly_oplh_session_v1';
const $=id=>document.getElementById(id);
let session=null,user=null,currentBundle=null,prevBundle=null,yearBundle=null,refreshPromise=null;
const TD_ACTIVITY_MAP={
 'オーダーピッキング（送り状ピッキング）':{key:'picking',label:'オーダーピッキング（送り状ピッキング）'},
 'オーダーピッキング':{key:'picking',label:'オーダーピッキング（送り状ピッキング）'},
 'パスソート':{key:'pass_sort',label:'パスソート'},
 'トータルピッキング（トータル回収作業）':{key:'total_picking',label:'トータルピッキング（トータル回収作業）'},
 'トータルピッキング':{key:'total_picking',label:'トータルピッキング（トータル回収作業）'},
 '出荷検品（複数ピッキング）':{key:'shipping_check',label:'出荷検品（複数ピッキング）'},
 '出荷検品':{key:'shipping_check',label:'出荷検品（複数ピッキング）'},
 '手動梱包':{key:'hand_pack',label:'手動梱包'},
 '自動梱包機':{key:'auto_pack',label:'自動梱包機'},
 '入庫':{key:'receiving',label:'入庫'},
 '調整入庫':{key:'receiving',label:'入庫'},
 '在庫移動':{key:'stock_move',label:'在庫移動'},
 'AM受注処理':{key:'order_am',label:'AM受注処理'},
 'Z受注処理':{key:'order_z',label:'Z受注処理'},
 'PM受注処理':{key:'order_pm',label:'PM受注処理'},
 'その他受注処理':{key:'order_next',label:'その他受注処理'}
};
const TD_ACTIVITY_ORDER=['picking','pass_sort','total_picking','shipping_check','hand_pack','auto_pack','receiving','stock_move','order_am','order_z','order_pm','order_next'];
const TD_ACTIVITY_LABELS=Object.fromEntries(Object.values(TD_ACTIVITY_MAP).map(x=>[x.key,x.label]));
let tdLastPreview=null;


function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
async function refreshSession(){if(refreshPromise)return refreshPromise;if(!session?.refresh_token)return false;refreshPromise=(async()=>{try{const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});const d=await res.json().catch(()=>null);if(!res.ok||!d?.access_token)return false;saveSession(d);user=d.user||user;return true}catch{return false}finally{refreshPromise=null}})();return refreshPromise}
async function req(path,opt={}){const{skipRefresh=false,...fo}=opt,headers={apikey:SB_KEY,'Content-Type':'application/json',...(fo.headers||{})};if(session?.access_token)headers.Authorization='Bearer '+session.access_token;let res=await fetch(SB_URL+path,{...fo,headers});if(res.status===401&&!skipRefresh&&session?.refresh_token&&!path.includes('grant_type=')){if(await refreshSession())return req(path,{...fo,skipRefresh:true})}const txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||('HTTP '+res.status));return data}
async function rest(table,params='',opt={}){return req('/rest/v1/'+table+(params?'?'+params:''),opt)}
function localDateISO(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
function companyMonthToday(d=new Date()){let y=d.getFullYear(),m=d.getMonth()+1;if(d.getDate()>=21){m++;if(m===13){y++;m=1}}return y+'-'+String(m).padStart(2,'0')}
function monthRange(ym){const[y,m]=ym.split('-').map(Number),end=new Date(y,m-1,20),start=new Date(y,m-2,21);return[localDateISO(start),localDateISO(end)]}
function previousYm(ym){let[y,m]=ym.split('-').map(Number);m--;if(m===0){m=12;y--}return y+'-'+String(m).padStart(2,'0')}
function shiftYm(ym,delta){let[y,m]=ym.split('-').map(Number);m+=delta;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+String(m).padStart(2,'0')}
function priorYearYm(ym){const[y,m]=ym.split('-');return (Number(y)-1)+'-'+m}
function n(v){return v==null||v===''?null:Number(v)}
function fmt(v,d=0){if(v==null||Number.isNaN(Number(v)))return '—';return Number(v).toLocaleString('ja-JP',{minimumFractionDigits:d,maximumFractionDigits:d})}
function yen(v,d=0){return v==null?'—':'¥'+fmt(v,d)}
function pct(v,d=1){return v==null?'—':(Number(v)*100).toFixed(d)+'%'}
function hours(v){return v==null?'—':fmt(v,2)+'h'}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

async function login(){const em=$('email').value.trim(),pw=$('password').value;if(!em||!pw){$('authError').textContent='メールアドレスとパスワードを入力してください。';return}const b=$('loginBtn');b.disabled=true;$('authError').textContent='';try{const d=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:em,password:pw}),skipRefresh:true});saveSession(d);user=d.user;showApp();await initApp()}catch(e){$('authError').textContent=e.message}finally{b.disabled=false}}
async function logout(){try{if(session?.access_token)await req('/auth/v1/logout',{method:'POST'})}catch{}saveSession(null);session=null;user=null;showApp()}
function showApp(){const on=!!session?.access_token;$('authView').classList.toggle('hidden',on);$('appView').classList.toggle('hidden',!on);$('logoutBtn').classList.toggle('hidden',!on);$('userLabel').textContent=user?.email||''}

async function ensureMonth(ym){let rows=await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${ym}&select=*`);if(rows?.length)return rows[0];const[start,end]=monthRange(ym);const body={owner_id:user.id,month_ym:ym,period_start:start,period_end:end,status:'open',origin:'app'};const saved=await rest('logistics_cost_monthly','on_conflict=owner_id%2Cmonth_ym',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)});return saved?.[0]||body}
async function loadBundle(ym,{create=false}={}){let monthlyRows=await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${ym}&select=*`);let monthly=monthlyRows?.[0]||null;if(!monthly&&create)monthly=await ensureMonth(ym);const[start,end]=monthly?[monthly.period_start,monthly.period_end]:monthRange(ym);
 const [shipping,pt,td,imports]=await Promise.all([
  rest('logistics_shipping_monthly',`owner_id=eq.${user.id}&month_ym=eq.${ym}&select=*`).catch(()=>[]),
  rest('logistics_work_time',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&select=work_date,picking_minutes,total_picking_minutes,pass_sort_minutes,sorting_minutes,hand_pack_minutes,auto_pack_minutes,stock_move_minutes`).catch(()=>[]),
  rest('oplh_timedesigner_daily',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&select=activity_key,activity_label,work_minutes,event_count,worker_key,worker_name,employee_no,staff_id,source_department`).catch(()=>[]),
  rest('logistics_cost_import_batches',`owner_id=eq.${user.id}&month_ym=eq.${ym}&select=source,source_filename,source_rows,imported_at,metadata&order=imported_at.desc`).catch(()=>[])
 ]);
 return{ym,monthly,shipping:shipping||[],pt:pt||[],td:td||[],imports:imports||[],start,end}
}

function sum(obj,key){return(obj||[]).reduce((a,r)=>a+(Number(r[key])||0),0)}
function dateSpan(rows){const ds=(rows||[]).map(r=>r.work_date).filter(Boolean).sort();return ds.length?{min:ds[0],max:ds[ds.length-1]}:{min:null,max:null}}
function mdLabel(iso){if(!iso)return '—';const p=String(iso).split('-');return Number(p[1])+'/'+Number(p[2])}
function tdTotals(rows){const out={};for(const r of rows||[]){const key=r.activity_key||r.activity_label||'';out[key]=(out[key]||0)+(Number(r.work_minutes)||0)}return out}
function tdMinutes(rows,keys=[],labels=[]){return(rows||[]).reduce((a,r)=>{const key=r.activity_key||'',label=r.activity_label||'';return a+((keys.includes(key)||labels.includes(label))?(Number(r.work_minutes)||0):0)},0)}
function tdDepartment(r){const d=String(r?.source_department||'').trim();if(d)return d;return r?.staff_id?'物流部':'部署不明'}
function tdIsLogistics(r){return tdDepartment(r)==='物流部'}
function tdGroupMinutes(rows,keys=[],labels=[]){let logistics=0,support=0;for(const r of rows||[]){const key=r.activity_key||'',label=r.activity_label||'';if(!(keys.includes(key)||labels.includes(label)))continue;const mins=Number(r.work_minutes)||0;if(tdIsLogistics(r))logistics+=mins;else support+=mins}return{logistics,support,total:logistics+support}}
function tdDepartmentBreakdown(rows){const out={};for(const r of rows||[]){const dept=tdDepartment(r);if(dept==='物流部')continue;const key=r.activity_key||'',mins=(Number(r.work_minutes)||0)/60,x=out[dept]||(out[dept]={pick:0,pack:0,receiving:0,total:0});if(['picking','pass_sort','total_picking','shipping_check'].includes(key))x.pick+=mins;else if(['hand_pack','auto_pack'].includes(key))x.pack+=mins;else if(key==='receiving')x.receiving+=mins;x.total+=mins}return out}
function orderMinutes(td){const t=tdTotals(td);const byLabel={};for(const r of td||[]){byLabel[r.activity_label]=(byLabel[r.activity_label]||0)+(Number(r.work_minutes)||0)}return{
 am:(t.order_am||byLabel['AM受注処理']||0),
 z:(t.order_z||byLabel['Z受注処理']||0),
 pm:(t.order_pm||byLabel['PM受注処理']||0),
 next:(t.order_next||byLabel['その他受注処理']||0)
}}
function metrics(b){const m=b?.monthly||{},ship=b?.shipping||[],tdRows=b?.td||[],td=tdTotals(tdRows);
 const shipments=ship.reduce((a,r)=>a+(Number(r.adopted_count)||0),0);
 const shipNet=ship.reduce((a,r)=>a+(Number(r.net_cost)||0),0);
 const shipPer=shipments?shipNet/shipments:null;
 const ppm=shipments&&m.complaint_count!=null?Number(m.complaint_count)/shipments*1000000:null;

 const gOrderPick=tdGroupMinutes(tdRows,['picking'],['オーダーピッキング（送り状ピッキング）','オーダーピッキング']);
 const gPass=tdGroupMinutes(tdRows,['pass_sort'],['パスソート']);
 const gTotalPick=tdGroupMinutes(tdRows,['total_picking'],['トータルピッキング（トータル回収作業）','トータルピッキング']);
 const gCheck=tdGroupMinutes(tdRows,['shipping_check'],['出荷検品（複数ピッキング）','出荷検品']);
 const gHandPack=tdGroupMinutes(tdRows,['hand_pack'],['手動梱包']);
 const gAutoPack=tdGroupMinutes(tdRows,['auto_pack'],['自動梱包機']);
 const gReceiving=tdGroupMinutes(tdRows,['receiving'],['入庫']);
 const gStockMove=tdGroupMinutes(tdRows,['stock_move'],['在庫移動']);
 const empOrderPickMin=gOrderPick.total,empPassMin=gPass.total,empTotalPickMin=gTotalPick.total,empCheckMin=gCheck.total;
 const empHandPackMin=gHandPack.total,empAutoPackMin=gAutoPack.total,empReceivingMin=gReceiving.total,empStockMoveMin=gStockMove.total;

 const ptOrderPickMin=sum(b?.pt,'picking_minutes');
 const ptTotalPickMin=sum(b?.pt,'total_picking_minutes');
 const ptPassMin=sum(b?.pt,'pass_sort_minutes');
 const ptSortingMin=sum(b?.pt,'sorting_minutes');
 const ptHandPackMin=sum(b?.pt,'hand_pack_minutes');
 const ptAutoPackMin=sum(b?.pt,'auto_pack_minutes');
 const ptStockMoveMin=sum(b?.pt,'stock_move_minutes');

 const empPickMin=empOrderPickMin+empPassMin+empTotalPickMin+empCheckMin;
 const empPackMin=empHandPackMin+empAutoPackMin;
 const ptPickMin=ptOrderPickMin+ptTotalPickMin+ptPassMin;
 const ptPackMin=ptHandPackMin+ptAutoPackMin;
 const timeePick=(Number(m.timee_picking_hours)||0)*60,timeePack=(Number(m.timee_packing_hours)||0)*60;
 const pickHours=(empPickMin+ptPickMin+timeePick)/60,packHours=(empPackMin+ptPackMin+timeePack)/60,totalHours=pickHours+packHours;
 let oplh=shipments&&totalHours?shipments/totalHours:null;
 if(m.origin==='legacy_spreadsheet'&&m.oplh_legacy!=null)oplh=Number(m.oplh_legacy);
 const ord=orderMinutes(tdRows);
 return{shipments,shipNet,shipPer,ppm,pickHours,packHours,totalHours,oplh,td,ord,
   empPickHours:empPickMin/60,empPackHours:empPackMin/60,ptPickHours:ptPickMin/60,ptPackHours:ptPackMin/60,
   timeePickHours:Number(m.timee_picking_hours)||0,timeePackHours:Number(m.timee_packing_hours)||0,
   detail:{
     empOrderPick:empOrderPickMin/60,empPass:empPassMin/60,empTotalPick:empTotalPickMin/60,empCheck:empCheckMin/60,
     empHandPack:empHandPackMin/60,empAutoPack:empAutoPackMin/60,empReceiving:empReceivingMin/60,empStockMove:empStockMoveMin/60,
     logOrderPick:gOrderPick.logistics/60,helpOrderPick:gOrderPick.support/60,logPass:gPass.logistics/60,helpPass:gPass.support/60,
     logTotalPick:gTotalPick.logistics/60,helpTotalPick:gTotalPick.support/60,logCheck:gCheck.logistics/60,helpCheck:gCheck.support/60,
     logHandPack:gHandPack.logistics/60,helpHandPack:gHandPack.support/60,logAutoPack:gAutoPack.logistics/60,helpAutoPack:gAutoPack.support/60,
     logReceiving:gReceiving.logistics/60,helpReceiving:gReceiving.support/60,logStockMove:gStockMove.logistics/60,helpStockMove:gStockMove.support/60,
     ptOrderPick:ptOrderPickMin/60,ptPass:ptPassMin/60,ptTotalPick:ptTotalPickMin/60,ptSorting:ptSortingMin/60,
     ptHandPack:ptHandPackMin/60,ptAutoPack:ptAutoPackMin/60,ptStockMove:ptStockMoveMin/60
   },
   help:{
     pickHours:(gOrderPick.support+gPass.support+gTotalPick.support+gCheck.support)/60,
     packHours:(gHandPack.support+gAutoPack.support)/60,
     receivingHours:gReceiving.support/60,
     departments:tdDepartmentBreakdown(tdRows)
   }}
}

function diff(now,old,betterLow=false,percent=false){if(now==null||old==null||Number(old)===0)return '—';const delta=Number(now)-Number(old),rate=(Number(now)/Number(old)-1)*100;let cls='neutral';if(delta!==0)cls=((betterLow?delta<0:delta>0)?'good':'bad');return `<span class="${cls}">${delta>=0?'+':''}${percent?(delta*100).toFixed(1)+'pt':fmt(delta,1)} (${rate>=0?'+':''}${rate.toFixed(1)}%)</span>`}


function csvLine(line){const out=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){cur+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out}
function normalizeHeader(s){return String(s||'').replace(/^\uFEFF/,'').trim()}
function normalizeWorkerName(s){return String(s||'').normalize('NFKC').replace(/^[A-Za-z]*\d+[\s　]*/,'').replace(/[\s　]/g,'').trim()}
function normalizeDateCell(s){const raw=String(s||'').trim().split(/[ T]/)[0].replace(/\./g,'/').replace(/-/g,'/');const p=raw.split('/').map(Number);if(p.length!==3||!p[0]||!p[1]||!p[2])return null;return p[0]+'-'+String(p[1]).padStart(2,'0')+'-'+String(p[2]).padStart(2,'0')}
async function readShiftJisCsv(file){const buf=await file.arrayBuffer();return new TextDecoder('shift_jis').decode(buf)}
async function tdStaffMaps(){const rows=await rest('logistics_staff',`owner_id=eq.${user.id}&select=id,name`);const byCode=new Map(),byName=new Map();for(const r of rows||[]){const full=String(r.name||'').normalize('NFKC').trim(),m=full.match(/^([A-Za-z]*\d+)/);if(m)byCode.set(m[1],r.id);const nm=normalizeWorkerName(full);if(nm)byName.set(nm,r.id)}return{byCode,byName}}
async function parseTimeDesignerFile(file){
 const text=await readShiftJisCsv(file),lines=text.replace(/\r/g,'').split('\n').filter(x=>x.trim());
 if(lines.length<2)throw new Error('CSVにデータがありません。');
 const head=csvLine(lines[0]).map(normalizeHeader),find=name=>head.indexOf(name);
 const ix={name:find('作業履歴_作業担当者'),dept:find('作業履歴_作業担当者_部署名'),emp:find('作業履歴_作業担当者_従業員番号'),start:find('作業履歴_作業開始日時'),min:find('作業履歴_作業時間(分)'),task:find('タスク_タスク名')};
 const missing=Object.entries(ix).filter(([k,v])=>['name','emp','start','min','task'].includes(k)&&v<0).map(([k])=>k);
 if(missing.length)throw new Error('必要な列が見つかりません: '+missing.join(', '));
 const [periodStart,periodEnd]=monthRange(currentBundle.ym),staff=await tdStaffMaps(),agg=new Map(),unmapped=new Map(),unmatchedStaff=new Set();
 let periodRows=0,mappedSourceRows=0,outsideRows=0;
 for(let i=1;i<lines.length;i++){
  const r=csvLine(lines[i]),date=normalizeDateCell(r[ix.start]);if(!date)continue;
  if(date<periodStart||date>periodEnd){outsideRows++;continue}
  periodRows++;
  const task=String(r[ix.task]||'').trim(),map=TD_ACTIVITY_MAP[task];
  const mins=Number(String(r[ix.min]||'0').replace(/,/g,''))||0;
  if(!map){if(task){const x=unmapped.get(task)||{count:0,minutes:0};x.count++;x.minutes+=mins;unmapped.set(task,x)}continue}
  const employeeNo=(String(r[ix.emp]||'').normalize('NFKC').trim().replace(/\.0$/,'')||null);
  const sourceDepartment=ix.dept>=0?(String(r[ix.dept]||'').normalize('NFKC').trim()||null):null;
  const workerName=normalizeWorkerName(r[ix.name])||String(r[ix.name]||'').trim()||'不明';
  const workerKey=employeeNo||workerName;
  const staffId=(employeeNo&&staff.byCode.get(employeeNo))||staff.byName.get(workerName)||null;
  if(!staffId&&sourceDepartment==='物流部')unmatchedStaff.add((employeeNo?employeeNo+' ':'')+workerName);
  const key=[date,workerKey,map.key].join('|'),x=agg.get(key)||{owner_id:user.id,work_date:date,staff_id:staffId,worker_key:workerKey,employee_no:employeeNo,worker_name:workerName,source_department:sourceDepartment,activity_key:map.key,activity_label:map.label,event_count:0,work_minutes:0};
  x.event_count++;x.work_minutes+=mins;if(!x.staff_id&&staffId)x.staff_id=staffId;agg.set(key,x);mappedSourceRows++;
 }
 const rows=[...agg.values()].map(x=>({...x,work_minutes:Number(x.work_minutes.toFixed(4))}));
 if(!rows.length)throw new Error(`${periodStart}～${periodEnd} に自動振分できるデータがありません。`);
 return{fileName:file.name,periodStart,periodEnd,periodRows,mappedSourceRows,outsideRows,rows,unmapped:[...unmapped.entries()].map(([task,v])=>({task,...v})),unmatchedStaff:[...unmatchedStaff].sort()};
}
async function importTimeDesigner(){
 const m=currentBundle?.monthly||{};if(m.status==='confirmed'||m.origin==='legacy_spreadsheet'){alert('確定済み・過去移行月には取り込めません。');return}
 const file=$('tdImportFile').files?.[0];if(!file){$('tdImportMessage').className='message bad';$('tdImportMessage').textContent='CSVを選択してください。';return}
 const btn=$('tdImportBtn');btn.disabled=true;$('tdImportMessage').className='message';$('tdImportMessage').textContent='CSVを確認しています…';
 try{
  const parsed=await parseTimeDesignerFile(file);tdLastPreview=parsed;
  const existing=currentBundle.td?.length||0;
  if(existing&&!confirm(`${currentBundle.ym}月度にはTimeDesignerデータが既にあります。\n新しいCSVで置き換えますか？`))return;
  $('tdImportMessage').textContent='DBへ保存しています…';
  const batchRows=await rest('oplh_import_batches','',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({owner_id:user.id,source:'timedesigner',source_filename:parsed.fileName,period_start:parsed.periodStart,period_end:parsed.periodEnd,source_rows:parsed.mappedSourceRows,aggregate_rows:parsed.rows.length})});
  const batchId=batchRows?.[0]?.id;if(!batchId)throw new Error('取込バッチを作成できませんでした。');
  const now=new Date().toISOString(),rows=parsed.rows.map(r=>({...r,batch_id:batchId,updated_at:now}));
  for(let i=0;i<rows.length;i+=400){
   const chunk=rows.slice(i,i+400);
   await rest('oplh_timedesigner_daily','on_conflict=owner_id%2Cwork_date%2Cworker_key%2Cactivity_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(chunk)});
  }
  const range=`owner_id=eq.${user.id}&work_date=gte.${parsed.periodStart}&work_date=lte.${parsed.periodEnd}`;
  await rest('oplh_timedesigner_daily',range+'&batch_id=is.null',{method:'DELETE',headers:{Prefer:'return=minimal'}});
  await rest('oplh_timedesigner_daily',range+`&batch_id=neq.${batchId}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  await rest('logistics_cost_import_batches','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({owner_id:user.id,month_ym:currentBundle.ym,source:'timedesigner',source_filename:parsed.fileName,source_rows:parsed.mappedSourceRows,period_start:parsed.periodStart,period_end:parsed.periodEnd,metadata:{aggregate_rows:rows.length,period_rows:parsed.periodRows,outside_rows:parsed.outsideRows,unmapped_tasks:parsed.unmapped,unmatched_staff:parsed.unmatchedStaff}})});
  $('tdImportMessage').className='message ok';$('tdImportMessage').textContent=`取込完了：${parsed.mappedSourceRows.toLocaleString()}行 → ${rows.length.toLocaleString()}集計行`;
  await loadAll()
 }catch(e){console.error(e);$('tdImportMessage').className='message bad';$('tdImportMessage').textContent=e.message}
 finally{btn.disabled=false}
}
function renderTDImport(){
 const m=currentBundle?.monthly||{},locked=m.status==='confirmed'||m.origin==='legacy_spreadsheet';
 $('tdImportBtn').disabled=locked;$('tdImportFile').disabled=locked;$('tdLockedNotice').classList.toggle('hidden',!locked);
 $('tdLockedNotice').textContent=locked?'確定済み・過去移行月のTimeDesignerデータは変更できません。':'';
 const latest=(currentBundle.imports||[]).find(x=>x.source==='timedesigner'),totals={};
 for(const r of currentBundle.td||[]){const key=r.activity_key||r.activity_label||'other',x=totals[key]||{minutes:0,count:0};x.minutes+=Number(r.work_minutes)||0;x.count+=Number(r.event_count)||0;totals[key]=x}
 $('tdImportBody').innerHTML=TD_ACTIVITY_ORDER.filter(k=>totals[k]).map(k=>`<tr><td>${TD_ACTIVITY_LABELS[k]||k}</td><td>${hours(totals[k].minutes/60)}</td><td>${fmt(totals[k].count)}</td></tr>`).join('')||'<tr><td colspan="3">対象データはありません。</td></tr>';
 const meta=latest?.metadata||{},unmapped=meta.unmapped_tasks||[],unmatched=meta.unmatched_staff||[];
 const deptTotals={};for(const r of currentBundle.td||[]){const dept=tdDepartment(r);deptTotals[dept]=(deptTotals[dept]||0)+(Number(r.work_minutes)||0)}
 const deptText=Object.entries(deptTotals).sort((a,b)=>b[1]-a[1]).map(([dept,min])=>esc(dept)+' '+hours(min/60)).join(' / ')||'—';
 $('tdImportSummary').innerHTML=[
  `<div class="source-row"><div><strong>最新ファイル</strong><small>${latest?.source_filename?esc(latest.source_filename):'—'}</small></div><span class="badge ${currentBundle.td.length?'auto':'missing'}">${currentBundle.td.length?'取込済':'未取込'}</span></div>`,
  `<div class="source-row"><div><strong>部署別</strong><small>${deptText}</small></div><span class="badge auto">部署分離</span></div>`,
  `<div class="source-row"><div><strong>未振分タスク</strong><small>${unmapped.length?unmapped.map(x=>esc(x.task)+' ('+x.count+'件)').join(' / '):'なし'}</small></div><span class="badge ${unmapped.length?'missing':'auto'}">${unmapped.length}件</span></div>`,
  `<div class="source-row"><div><strong>物流部でマスタ未一致</strong><small>${unmatched.length?unmatched.map(esc).join(' / '):'なし'}</small></div><span class="badge ${unmatched.length?'missing':'auto'}">${unmatched.length}名</span></div>`
 ].join('')
}

async function loadAll(){const ym=$('monthPick').value||companyMonthToday();$('monthPick').value=ym;const[start,end]=monthRange(ym);$('monthRange').textContent=`${start} ～ ${end}（21日～翌20日）`;try{
 [currentBundle,prevBundle,yearBundle]=await Promise.all([loadBundle(ym,{create:true}),loadBundle(previousYm(ym)),loadBundle(priorYearYm(ym))]);
 renderAll()
 }catch(e){console.error(e);alert('読み込みに失敗しました: '+e.message)}
}
function renderAll(){renderStatus();renderDashboard();renderMonthly();renderShipping();renderTDImport();renderWork();renderComparison()}
function renderStatus(){const m=currentBundle.monthly||{};$('statusBadge').textContent=m.status==='confirmed'?'確定済':'運用中';$('statusBadge').className='badge '+(m.status==='confirmed'?'confirmed':'open');$('confirmBtn').disabled=m.status==='confirmed'||m.origin==='legacy_spreadsheet'}
function renderDashboard(){const c=metrics(currentBundle),p=metrics(prevBundle),y=metrics(yearBundle),m=currentBundle.monthly||{},pm=prevBundle.monthly||{},ym=yearBundle.monthly||{};
 const vals=[
  ['kOrders','cOrders',n(m.orders),n(pm.orders),n(ym.orders),false,false],
  ['kShipments','cShipments',c.shipments,p.shipments,y.shipments,false,false],
  ['kOplh','cOplh',c.oplh,p.oplh,y.oplh,false,false],
  ['kShipCost','cShipCost',c.shipPer,p.shipPer,y.shipPer,true,false],
  ['kReceiving','cReceiving',n(m.receiving_rate),n(pm.receiving_rate),n(ym.receiving_rate),false,true],
  ['kPpm','cPpm',c.ppm,p.ppm,y.ppm,true,false]
 ];
 for(const [kid,cid,v,pv,yv,low,percent] of vals){$(kid).textContent=percent?pct(v):(kid==='kShipCost'?yen(v,2):fmt(v,kid==='kOplh'?2:1));$(cid).innerHTML='前月 '+diff(v,pv,low,percent)+'<br>前年 '+diff(v,yv,low,percent)}
 if(c.ppm!=null){$('kPpm').classList.toggle('good',c.ppm<=100);$('kPpm').classList.toggle('bad',c.ppm>100)}else{$('kPpm').classList.remove('good','bad')}
 const ord=c.ord;$('orderAm').textContent=hours(ord.am/60);$('orderZ').textContent=hours(ord.z/60);$('orderPm').textContent=hours(ord.pm/60);$('orderNext').textContent=hours(ord.next/60);
 const mth=currentBundle.monthly||{},ship=currentBundle.shipping||[],imports=currentBundle.imports||[];
 const ptSpan=dateSpan(currentBundle.pt),tdSpan=dateSpan(currentBundle.td);
 const status=[
  ['月次手入力',mth.orders!=null&&mth.complaint_count!=null&&mth.receiving_rate!=null&&mth.material_cost!=null,'受注・品質・資材'],
  ['TimeDesigner',currentBundle.td.length>0,currentBundle.td.length?`社員作業時間＋受注処理（${mdLabel(tdSpan.min)}〜${mdLabel(tdSpan.max)}）`:'社員作業時間＋受注処理：未取込'],
  ['物流PT',currentBundle.pt.length>0,currentBundle.pt.length?`物流PT作業時間管理（${mdLabel(ptSpan.min)}〜${mdLabel(ptSpan.max)}・${currentBundle.pt.length}件）`:'物流PT作業時間管理：未入力'],
  ['発送費',ship.filter(x=>['yamato','sagawa','japanpost'].includes(x.carrier)&&x.adopted_count!=null&&x.net_cost!=null).length===3,'ヤマト・佐川・日本郵便']
 ];
 $('sourceStatus').innerHTML=status.map(x=>`<div class="source-row"><div><strong>${x[0]}</strong><small>${x[2]}</small></div><span class="badge ${x[1]?'auto':'missing'}">${x[1]?'取得済':'未完了'}</span></div>`).join('')
}
function setInput(id,v,percent=false){$(id).value=v==null?'':(percent?Number(v)*100:v)}
function renderMonthly(){const m=currentBundle.monthly||{},locked=m.status==='confirmed'||m.origin==='legacy_spreadsheet';
 setInput('mOrders',m.orders);setInput('mComplaints',m.complaint_count);setInput('mReceiving',m.receiving_rate,true);setInput('mShippingWork',m.shipping_work_count);setInput('mPickComplaints',m.picking_complaint_count);setInput('mMaterialCost',m.material_cost);setInput('mSilverCost',m.silver_cost);setInput('mTimeeCost',m.timee_cost);setInput('mTimeePick',m.timee_picking_hours);setInput('mTimeePack',m.timee_packing_hours);setInput('m955Ok',m.label_955_ok_days);setInput('m955Total',m.label_955_total_days);
 setInput('mAuto1Lap',m.auto1_lap_seconds);setInput('mAuto1Count',m.auto1_count);setInput('mAuto2Lap',m.auto2_lap_seconds);setInput('mAuto2Count',m.auto2_count);
 ['mOrders','mComplaints','mReceiving','mShippingWork','mPickComplaints','mMaterialCost','mSilverCost','mTimeeCost','mTimeePick','mTimeePack','m955Ok','m955Total','mAuto1Lap','mAuto1Count','mAuto2Lap','mAuto2Count'].forEach(id=>$(id).disabled=locked);
 $('saveMonthlyBtn').disabled=locked;$('legacyNotice').classList.toggle('hidden',m.origin!=='legacy_spreadsheet');$('legacyNotice').textContent=m.origin==='legacy_spreadsheet'?'旧スプレッドシートから移行した確定値です。過去実績としてロックしています。':''
}
function inputNum(id,divide=1){const v=$(id).value.trim();return v===''?null:Number(v)/divide}
async function saveMonthly(){const m=currentBundle.monthly;if(m.status==='confirmed'||m.origin==='legacy_spreadsheet')return;const body={owner_id:user.id,month_ym:currentBundle.ym,period_start:currentBundle.start,period_end:currentBundle.end,status:'open',origin:'app',orders:inputNum('mOrders'),complaint_count:inputNum('mComplaints'),receiving_rate:inputNum('mReceiving',100),shipping_work_count:inputNum('mShippingWork'),picking_complaint_count:inputNum('mPickComplaints'),material_cost:inputNum('mMaterialCost'),silver_cost:inputNum('mSilverCost'),timee_cost:inputNum('mTimeeCost'),timee_picking_hours:inputNum('mTimeePick'),timee_packing_hours:inputNum('mTimeePack'),label_955_ok_days:inputNum('m955Ok'),label_955_total_days:inputNum('m955Total'),auto1_lap_seconds:inputNum('mAuto1Lap'),auto1_count:inputNum('mAuto1Count'),auto2_lap_seconds:inputNum('mAuto2Lap'),auto2_count:inputNum('mAuto2Count'),updated_at:new Date().toISOString()};
 try{await rest('logistics_cost_monthly','on_conflict=owner_id%2Cmonth_ym',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});$('monthlyMessage').className='message ok';$('monthlyMessage').textContent='保存しました。';await loadAll()}catch(e){$('monthlyMessage').className='message bad';$('monthlyMessage').textContent=e.message}}

async function parseSagawaFile(file){
 const text=await readShiftJisCsv(file),lines=text.replace(/\r/g,'').split('\n').filter(x=>x.trim());
 if(lines.length<2)throw new Error('佐川CSVにデータがありません。');
 const head=csvLine(lines[0]).map(normalizeHeader);
 const findContains=word=>head.findIndex(h=>h.includes(word));
 const ix={cost:findContains('運賃請求金額'),dest:findContains('着店名称'),from:findContains('集荷店名称')};
 if(ix.cost<0)throw new Error('「運賃請求金額」列が見つかりません。');
 let sourceRows=0,invoiceCount=0,excludedCount=0,netCost=0;
 for(let i=1;i<lines.length;i++){
  const r=csvLine(lines[i]);sourceRows++;
  const dest=ix.dest>=0?String(r[ix.dest]||'').trim():'',from=ix.from>=0?String(r[ix.from]||'').trim():'';
  if(dest.includes('丸岡')&&!from.includes('丸岡')){excludedCount++;continue}
  const cost=Number(String(r[ix.cost]||'').replace(/[¥￥,\s]/g,''));
  if(!Number.isFinite(cost))continue;
  invoiceCount++;netCost+=cost;
 }
 if(!invoiceCount)throw new Error('集計対象の佐川明細がありません。');
 return{fileName:file.name,sourceRows,invoiceCount,excludedCount,netCost:Number(netCost.toFixed(3)),grossCost:Number((netCost*1.1).toFixed(3))};
}
async function importSagawa(){
 const m=currentBundle?.monthly||{};if(m.status==='confirmed'||m.origin==='legacy_spreadsheet'){alert('確定済み・過去移行月には取り込めません。');return}
 const file=$('sagawaImportFile').files?.[0];if(!file){$('sagawaImportMessage').className='message bad';$('sagawaImportMessage').textContent='佐川CSVを選択してください。';return}
 const btn=$('sagawaImportBtn');btn.disabled=true;$('sagawaImportMessage').className='message';$('sagawaImportMessage').textContent='佐川CSVを集計しています…';
 try{
  const x=await parseSagawaFile(file),old=currentBundle.shipping.find(r=>r.carrier==='sagawa');
  const adoptedCount=(old?.metadata?.adopted_count_source==='wms'||old?.metadata?.adopted_count_source==='manual')?Number(old.adopted_count):x.invoiceCount;
  const metadata={source_rows:x.sourceRows,excluded_maruoka:x.excludedCount,adopted_count_source:(adoptedCount===x.invoiceCount?'invoice_rows':old.metadata.adopted_count_source),rule:'着店=丸岡 かつ 集荷店≠丸岡を除外'};
  const body={owner_id:user.id,month_ym:currentBundle.ym,carrier:'sagawa',adopted_count:adoptedCount,invoice_count:x.invoiceCount,gross_cost:x.grossCost,net_cost:x.netCost,source_kind:'invoice_file',source_filename:x.fileName,imported_at:new Date().toISOString(),metadata,updated_at:new Date().toISOString()};
  await rest('logistics_shipping_monthly','on_conflict=owner_id%2Cmonth_ym%2Ccarrier',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
  await rest('logistics_cost_import_batches','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({owner_id:user.id,month_ym:currentBundle.ym,source:'sagawa',source_filename:x.fileName,source_rows:x.sourceRows,period_start:currentBundle.start,period_end:currentBundle.end,metadata})});
  $('sagawaImportMessage').className='message ok';$('sagawaImportMessage').textContent=`取込完了：${x.invoiceCount.toLocaleString()}件 / 税抜 ${yen(x.netCost)}`;
  await loadAll()
 }catch(e){console.error(e);$('sagawaImportMessage').className='message bad';$('sagawaImportMessage').textContent=e.message}
 finally{btn.disabled=false}
}


function fileAsBase64(file){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onerror=()=>reject(fr.error||new Error('ファイル読込に失敗しました'));fr.onload=()=>resolve(String(fr.result||'').split(',')[1]||'');fr.readAsDataURL(file)})}
async function extractPdfText(file,retry=true){
 const data=await fileAsBase64(file);
 let r=await fetch('/api/parse-pdf',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({name:file.name,data})});
 if(r.status===401&&retry&&await refreshSession())return extractPdfText(file,false);
 const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('PDF解析エラー '+r.status));return j.text||''
}
function parseYamatoText(text){
 const toNum=x=>Number(String(x||'').replace(/,/g,''));
 let invoiceCount=null,grossCost=null,netCost=null;
 const normal=[...text.matchAll(/合計[（(]税込[）)]\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/g)];
 if(normal.length){const t=normal[normal.length-1];invoiceCount=toNum(t[1]);grossCost=toNum(t[2]);netCost=toNum(t[3])}
 if(invoiceCount==null){
  const compact=[...text.matchAll(/(\d{1,3},\d{3})(\d{1,3},\d{3},\d{3})(\d{1,3},\d{3},\d{3})\s+0\s+0\s+(\d{1,3},\d{3})\s*合計[（(]税込[）)]/g)];
  if(compact.length){const t=compact[compact.length-1];invoiceCount=toNum(t[1]);grossCost=toNum(t[2]);netCost=toNum(t[3])}
 }
 let adoptedCount=0;
 for(const line of text.replace(/\r/g,'').split('\n')){
  if(!line.includes('ネコポス'))continue;
  const after=line.split('ネコポス').slice(1).join('ネコポス');
  const nums=[...after.matchAll(/\d[\d,]*/g)].map(m=>toNum(m[0])).filter(Number.isFinite);
  if(nums.length<5)continue;
  const tail=nums.slice(-5);
  let count=0;
  if(tail[0]>=0&&tail[0]<=50&&tail[1]>=50)count=tail[0];
  else if(tail[1]>=0&&tail[1]<=50&&tail[0]>=50)count=tail[1];
  else if(tail[0]>=0&&tail[0]<=50)count=tail[0];
  else if(tail[1]>=0&&tail[1]<=50)count=tail[1];
  adoptedCount+=count||0;
 }
 if(!adoptedCount||!invoiceCount||!grossCost||!netCost)throw new Error('ヤマト請求書の件数または金額を読み取れませんでした。');
 return{adoptedCount,invoiceCount,grossCost,netCost,otherCount:invoiceCount-adoptedCount}
}
function isoDate(y,m,d){return Number(y)+'-'+String(Number(m)).padStart(2,'0')+'-'+String(Number(d)).padStart(2,'0')}
function parseJapanPostTexts(texts,start,end){
 const byDate=new Map();
 const re=/(\d{4})\/\s*(\d{1,2})\/\s*(\d{1,2})\s+([\d,]+)\s+([\d,]+)\s+(\d{4})\/\s*(\d{1,2})\/\s*(\d{1,2})\s+([\d,]+)\s+([\d,]+)/g;
 for(const text of texts){for(const m of text.matchAll(re)){const date=isoDate(m[1],m[2],m[3]);byDate.set(date,{prepaidCount:Number(m[4].replace(/,/g,''))||0,prepaidCost:Number(m[5].replace(/,/g,''))||0,codCount:Number(m[9].replace(/,/g,''))||0,codCost:Number(m[10].replace(/,/g,''))||0})}}
 let prepaidCount=0,codCount=0,grossCost=0,codCost=0,days=0;
 for(const [date,x] of byDate){if(date<start||date>end)continue;days++;prepaidCount+=x.prepaidCount;codCount+=x.codCount;grossCost+=x.prepaidCost;codCost+=x.codCost}
 if(!days||!(prepaidCount+codCount))throw new Error(start+'～'+end+' の日本郵便日別明細を読み取れませんでした。');
 return{adoptedCount:prepaidCount+codCount,invoiceCount:prepaidCount+codCount,prepaidCount,codCount,grossCost,netCost:grossCost/1.1,codCost,days}
}
async function saveShippingImport(carrier,fileNames,x,metadata){
 const body={owner_id:user.id,month_ym:currentBundle.ym,carrier,adopted_count:x.adoptedCount,invoice_count:x.invoiceCount,gross_cost:x.grossCost,net_cost:x.netCost,source_kind:'invoice_file',source_filename:fileNames,imported_at:new Date().toISOString(),metadata,updated_at:new Date().toISOString()};
 await rest('logistics_shipping_monthly','on_conflict=owner_id%2Cmonth_ym%2Ccarrier',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
 await rest('logistics_cost_import_batches','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({owner_id:user.id,month_ym:currentBundle.ym,source:carrier,source_filename:fileNames,source_rows:x.invoiceCount||0,period_start:currentBundle.start,period_end:currentBundle.end,metadata})})
}
async function importYamato(){
 const m=currentBundle?.monthly||{};if(m.status==='confirmed'||m.origin==='legacy_spreadsheet')return;
 const file=$('yamatoImportFile').files?.[0];if(!file){$('pdfImportMessage').className='message bad';$('pdfImportMessage').textContent='ヤマトPDFを選択してください。';return}
 const btn=$('yamatoImportBtn');btn.disabled=true;$('pdfImportMessage').className='message';$('pdfImportMessage').textContent='ヤマトPDFを解析しています…';
 try{const text=await extractPdfText(file),x=parseYamatoText(text),metadata={rule:'ネコポス明細個数を採用件数。請求書合計(税込)の税込・税抜総額を発送費',non_neko_count:x.otherCount};
  await saveShippingImport('yamato',file.name,x,metadata);$('pdfImportMessage').className='message ok';$('pdfImportMessage').textContent=`ヤマト取込完了：ネコポス ${fmt(x.adoptedCount)}件 / 税抜 ${yen(x.netCost)}`;await loadAll()
 }catch(e){console.error(e);$('pdfImportMessage').className='message bad';$('pdfImportMessage').textContent=e.message}finally{btn.disabled=false}
}
async function importJapanPost(){
 const m=currentBundle?.monthly||{};if(m.status==='confirmed'||m.origin==='legacy_spreadsheet')return;
 const files=[...($('japanPostImportFile').files||[])];if(!files.length){$('pdfImportMessage').className='message bad';$('pdfImportMessage').textContent='日本郵便PDFを選択してください。';return}
 const btn=$('japanPostImportBtn');btn.disabled=true;$('pdfImportMessage').className='message';$('pdfImportMessage').textContent='日本郵便PDFを解析しています…';
 try{const texts=[];for(const f of files){$('pdfImportMessage').textContent='日本郵便PDFを解析中：'+f.name;texts.push(await extractPdfText(f))}
  const x=parseJapanPostTexts(texts,currentBundle.start,currentBundle.end),metadata={rule:'21日～翌20日。採用件数=元払+着払個数、発送費=元払金額のみ（着払金額除外）',prepaid_count:x.prepaidCount,cod_count:x.codCount,cod_cost_excluded:x.codCost,days:x.days};
  await saveShippingImport('japanpost',files.map(f=>f.name).join(' / '),x,metadata);$('pdfImportMessage').className='message ok';$('pdfImportMessage').textContent=`日本郵便取込完了：${fmt(x.adoptedCount)}件 / 元払税込 ${yen(x.grossCost)}`;await loadAll()
 }catch(e){console.error(e);$('pdfImportMessage').className='message bad';$('pdfImportMessage').textContent=e.message}finally{btn.disabled=false}
}


function renderShipping(){const c=metrics(currentBundle),rows=['yamato','sagawa','japanpost'].map(car=>currentBundle.shipping.find(x=>x.carrier===car)||{carrier:car});const labels={yamato:'ヤマト運輸',sagawa:'佐川急便',japanpost:'日本郵便'};$('shippingBody').innerHTML=rows.map(r=>{const count=n(r.adopted_count),net=n(r.net_cost),gross=n(r.gross_cost),unit=count&&net?net/count:null;return `<tr><td>${labels[r.carrier]}</td><td>${fmt(count)}</td><td>${fmt(n(r.invoice_count))}</td><td>${yen(gross)}</td><td>${yen(net)}</td><td>${yen(unit,2)}</td><td>${c.shipments&&count?pct(count/c.shipments):'—'}</td><td>${r.source_kind==='legacy_spreadsheet'?'旧スプレッド':(r.source_filename?esc(r.source_filename):'—')}</td></tr>`}).join('');$('shipNetTotal').textContent=yen(c.shipNet);$('shipUnitTotal').textContent=yen(c.shipPer,2);
 const m=currentBundle.monthly||{},locked=m.status==='confirmed'||m.origin==='legacy_spreadsheet';$('sagawaImportBtn').disabled=locked;$('sagawaImportFile').disabled=locked;$('sagawaLockedNotice').classList.toggle('hidden',!locked);$('sagawaLockedNotice').textContent=locked?'確定済み・過去移行月の発送費は変更できません。':'';
 const sagawa=currentBundle.shipping.find(r=>r.carrier==='sagawa'),meta=sagawa?.metadata||{};$('sagawaImportSummary').innerHTML=sagawa?`<div class="source-row"><div><strong>現在の佐川データ</strong><small>${esc(sagawa.source_filename||'—')}</small></div><span class="badge auto">取込済</span></div><div class="source-row"><div><strong>請求明細 / 丸岡除外</strong><small>${fmt(sagawa.invoice_count)}件 / ${fmt(meta.excluded_maruoka||0)}件除外</small></div><span class="badge">税抜 ${yen(sagawa.net_cost)}</span></div>`:'<div class="source-row"><div><strong>現在の佐川データ</strong><small>未取込</small></div><span class="badge missing">未取込</span></div>';
 ['yamatoImportBtn','japanPostImportBtn','yamatoImportFile','japanPostImportFile'].forEach(id=>$(id).disabled=locked);
 const ya=currentBundle.shipping.find(r=>r.carrier==='yamato'),jpRow=currentBundle.shipping.find(r=>r.carrier==='japanpost'),yam=ya?.metadata||{},jpm=jpRow?.metadata||{};
 $('pdfImportSummary').innerHTML=[
  ya?`<div class="source-row"><div><strong>ヤマト</strong><small>${esc(ya.source_filename||'—')} / 請求${fmt(ya.invoice_count)}件・ネコポス${fmt(ya.adopted_count)}件</small></div><span class="badge auto">税抜 ${yen(ya.net_cost)}</span></div>`:'<div class="source-row"><div><strong>ヤマト</strong><small>未取込</small></div><span class="badge missing">未取込</span></div>',
  jpRow?`<div class="source-row"><div><strong>日本郵便</strong><small>${esc(jpRow.source_filename||'—')} / 着払${fmt(jpm.cod_count||0)}件（着払金額は除外）</small></div><span class="badge auto">税抜 ${yen(jpRow.net_cost)}</span></div>`:'<div class="source-row"><div><strong>日本郵便</strong><small>未取込</small></div><span class="badge missing">未取込</span></div>'
 ].join('')
}
function renderWork(){const c=metrics(currentBundle),d=c.detail,m=currentBundle.monthly||{},ship=currentBundle.shipping||[];
 $('wPick').textContent=hours(c.pickHours);$('wPack').textContent=hours(c.packHours);$('wTotal').textContent=hours(c.totalHours);$('wOplh').textContent=fmt(c.oplh,2);
 const rows=[
  ['ピッキング','オーダーピッキング',d.logOrderPick,d.helpOrderPick,d.ptOrderPick,0,true],
  ['ピッキング','パスソート',d.logPass,d.helpPass,d.ptPass,0,true],
  ['ピッキング','トータルピッキング',d.logTotalPick,d.helpTotalPick,d.ptTotalPick,0,true],
  ['ピッキング','出荷検品',d.logCheck,d.helpCheck,0,0,true],
  ['ピッキング','タイミー ピッキング',0,0,0,c.timeePickHours,true],
  ['梱包','手動梱包',d.logHandPack,d.helpHandPack,d.ptHandPack,0,true],
  ['梱包','自動梱包機',d.logAutoPack,d.helpAutoPack,d.ptAutoPack,0,true],
  ['梱包','タイミー 梱包',0,0,0,c.timeePackHours,true],
  ['その他','仕分け',0,0,d.ptSorting,0,false],
  ['在庫','入庫',d.logReceiving,d.helpReceiving,d.ptStockMove,0,false],
  ['在庫','在庫移動',d.logStockMove,d.helpStockMove,0,0,false]
 ];
 $('workDetailBody').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${hours(r[2])}</td><td>${hours(r[3])}</td><td>${hours(r[4])}</td><td>${hours(r[5])}</td><td><b>${hours(r[2]+r[3]+r[4]+r[5])}</b></td><td><span class="badge ${r[6]?'auto':''}">${r[6]?'含む':'対象外'}</span></td></tr>`).join('');

 const yamato=ship.find(x=>x.carrier==='yamato'),jpRow=ship.find(x=>x.carrier==='japanpost'),sagawa=ship.find(x=>x.carrier==='sagawa');
 const yCount=Number(yamato?.adopted_count)||0,jpCount=Number(jpRow?.adopted_count)||0,sCount=Number(sagawa?.adopted_count)||0;
 const lap1=Number(m.auto1_lap_seconds)||0,lap2=Number(m.auto2_lap_seconds)||0,count1=Number(m.auto1_count)||0,count2=Number(m.auto2_count)||0;
 const rate1=lap1?3600/lap1:null,rate2=lap2?3600/lap2:null;
 const auto1Hours=rate1?yCount/rate1:null,auto2Hours=rate2?jpCount/rate2:null;
 const handCount=Math.max(0,sCount+Math.max(0,yCount-count1)+Math.max(0,jpCount-count2));
 let handHours=Math.max(0,(c.empPackHours+c.ptPackHours)-(auto1Hours||0)-(auto2Hours||0));
 let handRate=handHours?handCount/handHours:null,handLap=handRate?3600/handRate:null;
 if(m.origin==='legacy_spreadsheet'&&m.hand_pack_lap_seconds!=null){handLap=Number(m.hand_pack_lap_seconds);handRate=handLap?3600/handLap:null;if(handRate)handHours=handCount/handRate}
 const packRows=[
  ['Auto1 ポスト便',lap1||null,rate1,count1||null,auto1Hours,rate1?fmt(rate1/3,1)+'件/h（3名換算）':'—'],
  ['Auto2 ゆうパック',lap2||null,rate2,count2||null,auto2Hours,rate2?fmt(rate2/3,1)+'件/h（3名換算）':'—'],
  ['手梱包',handLap,handRate,handCount||null,handHours,'佐川＋自動機以外']
 ];
 $('packingDetailBody').innerHTML=packRows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]!=null?fmt(r[1],2)+'秒':'—'}</td><td>${r[2]!=null?fmt(r[2],1)+'件/h':'—'}</td><td>${fmt(r[3])}</td><td>${r[4]!=null?hours(r[4]):'—'}</td><td>${r[5]}</td></tr>`).join('');

 const legacy=m.origin==='legacy_spreadsheet';
 const hp=legacy?(Number(m.help_picking_hours)||0):c.help.pickHours,hk=legacy?(Number(m.help_packing_hours)||0):c.help.packHours,hr=legacy?(Number(m.help_receiving_hours)||0):c.help.receivingHours;
 $('helpDetailBody').innerHTML=[
  ['ピッキング',hp,c.totalHours?hp/c.totalHours:null],['梱包',hk,c.totalHours?hk/c.totalHours:null],['入庫',hr,null]
 ].map(r=>`<tr><td>${r[0]}</td><td>${hours(r[1])}</td><td>${r[2]!=null?pct(r[2]):'—'}</td></tr>`).join('');
 const deptRows=Object.entries(c.help.departments||{}).sort((a,b)=>b[1].total-a[1].total);
 $('helpDepartmentBody').innerHTML=legacy
   ? '<tr><td colspan="5">過去移行月は部署別データを保持していません。</td></tr>'
   : (deptRows.length?deptRows.map(([dept,x])=>`<tr><td>${esc(dept)}</td><td>${hours(x.pick)}</td><td>${hours(x.pack)}</td><td>${hours(x.receiving)}</td><td><b>${hours(x.total)}</b></td></tr>`).join(''):'<tr><td colspan="5">他部署応援データはありません。</td></tr>')
}
function renderComparison(){const c=metrics(currentBundle),p=metrics(prevBundle),y=metrics(yearBundle),m=currentBundle.monthly||{},pm=prevBundle.monthly||{},ym=yearBundle.monthly||{};const rows=[['受注件数',n(m.orders),n(pm.orders),n(ym.orders),false,false],['出荷件数',c.shipments,p.shipments,y.shipments,false,false],['誤出荷PPM（低いほど良い）',c.ppm,p.ppm,y.ppm,true,false],['48H以内入庫率',n(m.receiving_rate),n(pm.receiving_rate),n(ym.receiving_rate),false,true],['発送費合計',c.shipNet,p.shipNet,y.shipNet,true,false],['発送費/件',c.shipPer,p.shipPer,y.shipPer,true,false],['資材費',n(m.material_cost),n(pm.material_cost),n(ym.material_cost),true,false],['タイミー費',n(m.timee_cost),n(pm.timee_cost),n(ym.timee_cost),true,false],['OPLH',c.oplh,p.oplh,y.oplh,false,false]];$('compareBody').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[5]?pct(r[1]):fmt(r[1],1)}</td><td>${r[5]?pct(r[2]):fmt(r[2],1)}</td><td>${diff(r[1],r[2],r[4],r[5])}</td><td>${r[5]?pct(r[3]):fmt(r[3],1)}</td><td>${diff(r[1],r[3],r[4],r[5])}</td></tr>`).join('')}
async function confirmMonth(){const m=currentBundle.monthly||{};if(m.origin==='legacy_spreadsheet'||m.status==='confirmed')return;const c=metrics(currentBundle);const missing=[];if(m.orders==null)missing.push('受注件数');if(m.complaint_count==null)missing.push('クレーム件数');if(m.receiving_rate==null)missing.push('48H以内入庫率');if(m.material_cost==null)missing.push('資材費');if(!currentBundle.td.length)missing.push('TimeDesigner');if(!currentBundle.pt.length)missing.push('物流PT');if(currentBundle.shipping.filter(x=>['yamato','sagawa','japanpost'].includes(x.carrier)&&x.adopted_count!=null&&x.net_cost!=null).length<3)missing.push('発送費3社');if(missing.length){alert('未完了: '+missing.join('、'));return}if(!confirm(currentBundle.ym+'月度を確定しますか？'))return;const body={status:'confirmed',confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()};await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${currentBundle.ym}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});await loadAll()}
async function initApp(){$('monthPick').value=companyMonthToday();await loadAll()}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));['dashboard','monthly','shipping','timedesigner','work','comparison'].forEach(t=>$(t+'Tab').classList.toggle('hidden',b.dataset.tab!==t))});
$('loginBtn').onclick=login;$('logoutBtn').onclick=logout;$('reloadBtn').onclick=loadAll;$('monthPick').onchange=loadAll;$('prevMonthBtn').onclick=()=>{$('monthPick').value=shiftYm($('monthPick').value,-1);loadAll()};$('nextMonthBtn').onclick=()=>{$('monthPick').value=shiftYm($('monthPick').value,1);loadAll()};$('saveMonthlyBtn').onclick=saveMonthly;$('confirmBtn').onclick=confirmMonth;$('tdImportBtn').onclick=importTimeDesigner;$('sagawaImportBtn').onclick=importSagawa;$('yamatoImportBtn').onclick=importYamato;$('japanPostImportBtn').onclick=importJapanPost;
(async()=>{session=loadSession();if(session?.access_token){try{user=await req('/auth/v1/user');showApp();await initApp()}catch{saveSession(null);session=null;user=null;showApp()}}else showApp()})();