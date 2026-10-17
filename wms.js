const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='logistics_monthly_oplh_session_v1';
const $=id=>document.getElementById(id);
let session=null,user=null,refreshPromise=null,wmsRows=[],tdRows=[],ptRows=[],staffRows=[],directory=new Map(),staffToCode=new Map(),nameToCode=new Map(),staffById=new Map(),staffByName=new Map(),staffByCode=new Map();
const ACTIVITY_ORDER=['picking','stock_move','shipping_check','adjustment_out','receiving','receiving_check'];
const ACTIVITY_LABELS={picking:'ピッキング',stock_move:'在庫移動',shipping_check:'出荷検品',adjustment_out:'調整出庫',receiving:'調整入庫・入庫',receiving_check:'入荷検品'};
const ACTIVITY_COLORS={picking:'#2589f5',stock_move:'#2637a8',shipping_check:'#ed7d31',adjustment_out:'#7030a0',receiving:'#db3fa7',receiving_check:'#6b7280'};

function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function accessTokenNearExpiry(){const exp=Number(session?.expires_at||0);return !!(exp&&Date.now()>=(exp*1000-5*60*1000))}
async function refreshSession(){if(refreshPromise)return refreshPromise;if(!session?.refresh_token)return false;refreshPromise=(async()=>{try{const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});const d=await res.json().catch(()=>null);if(!res.ok||!d?.access_token)return false;saveSession(d);user=d.user||user;return true}catch{return false}finally{refreshPromise=null}})();return refreshPromise}
async function req(path,opt={}){const{skipRefresh=false,...fo}=opt;if(!skipRefresh&&session?.refresh_token&&(!session?.access_token||accessTokenNearExpiry())&&!path.includes('grant_type='))await refreshSession();const headers={apikey:SB_KEY,'Content-Type':'application/json',...(fo.headers||{})};if(session?.access_token)headers.Authorization='Bearer '+session.access_token;let res=await fetch(SB_URL+path,{...fo,headers});if(res.status===401&&!skipRefresh&&session?.refresh_token&&!path.includes('grant_type=')){if(await refreshSession())return req(path,{...fo,skipRefresh:true})}const txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||('HTTP '+res.status));return data}
async function restAll(table,params,pageSize=1000){let out=[],from=0;while(true){const page=await req('/rest/v1/'+table+(params?'?'+params:''),{headers:{Range:from+'-'+(from+pageSize-1),'Range-Unit':'items'}});out.push(...(page||[]));if(!page||page.length<pageSize)break;from+=pageSize}return out}

function normalizeName(s){return String(s||'').normalize('NFKC').replace(/[\s　]/g,'').trim()}
function normalizeCode(s){return String(s||'').normalize('NFKC').trim().replace(/\.0$/,'')}
function staffParts(s){
 const raw=String(s||'').normalize('NFKC').trim(),m=raw.match(/^([A-Za-z]*\d+)[\s　]+(.+)$/);
 return{raw,code:m?normalizeCode(m[1]):null,display:(m?m[2]:raw).trim(),norm:normalizeName(m?m[2]:raw)}
}
function workerNormName(s){
 return normalizeName(String(s||'').normalize('NFKC').replace(/^[A-Za-z]*\d+[\s　]+/,''))
}
function shiftYm(ym,delta){let[y,m]=ym.split('-').map(Number);m+=delta;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+String(m).padStart(2,'0')}
function monthRange(ym){let[y,m]=ym.split('-').map(Number),py=y,pm=m-1;if(pm===0){pm=12;py--}return[py+'-'+String(pm).padStart(2,'0')+'-21',y+'-'+String(m).padStart(2,'0')+'-20']}
function fiscalStartYear(ym){const[y,m]=ym.split('-').map(Number);return m>=3?y:y-1}
function companyYmFromDate(iso){let[y,m,d]=String(iso||'').split('-').map(Number);if(!y||!m||!d)return null;if(d>=21){m++;if(m===13){m=1;y++}}return y+'-'+String(m).padStart(2,'0')}
function fyMonths(fy){const out=[];let x=fy+'-03';for(let i=0;i<12;i++){out.push(x);x=shiftYm(x,1)}return out}
function fmt(v,d=0){return v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('ja-JP',{minimumFractionDigits:d,maximumFractionDigits:d})}
function hours(v){return v==null||!Number.isFinite(Number(v))?'—':fmt(v,1)+'h'}
function todayCompanyYm(){const d=new Date(),y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate();if(day>=21){let yy=y,mm=m+1;if(mm===13){mm=1;yy++}return yy+'-'+String(mm).padStart(2,'0')}return y+'-'+String(m).padStart(2,'0')}

function buildAliases(){
 staffToCode=new Map();nameToCode=new Map();staffById=new Map();staffByName=new Map();staffByCode=new Map();
 const prefer=(oldRow,newRow)=>!oldRow||(!oldRow.is_active&&newRow.is_active)?newRow:oldRow;
 for(const s of staffRows){
  staffById.set(s.id,s);const p=staffParts(s.name);
  if(p.code)staffByCode.set(p.code,prefer(staffByCode.get(p.code),s));
  if(p.norm)staffByName.set(p.norm,prefer(staffByName.get(p.norm),s))
 }
 for(const r of [...wmsRows,...tdRows]){
  const code=normalizeCode(r.worker_code||r.employee_no),name=workerNormName(r.worker_name);
  const master=(code&&staffByCode.get(code))||(name&&staffByName.get(name))||(r.staff_id&&staffById.get(r.staff_id))||null;
  if(code){
   if(r.staff_id)staffToCode.set(r.staff_id,code);
   if(master?.id)staffToCode.set(master.id,code);
   if(name)nameToCode.set(name,code)
  }
 }
}
function identityFor(row){
 const code=normalizeCode(row.worker_code||row.employee_no),name=workerNormName(row.worker_name);
 const master=(code&&staffByCode.get(code))||(row.staff_id&&staffById.get(row.staff_id))||(name&&staffByName.get(name))||null;
 if(master)return'staff:'+master.id;
 if(code)return'code:'+code;
 return'name:'+name
}
function buildDirectory(){
 buildAliases();directory=new Map();
 const categoryFor=s=>s.employment_type==='社員'?'employee':s.employment_type==='パート'?'part':s.employment_type==='派遣'?'temp':s.employment_type==='シルバー'?'silver':'unknown';
 for(const s of staffRows){
  const p=staffParts(s.name),key='staff:'+s.id;
  directory.set(key,{key,name:p.display||p.raw||'不明',code:p.code,staffId:s.id,department:'物流部',employment:s.employment_type||null,scope:'logistics',category:categoryFor(s),isActive:!!s.is_active,retirementDate:s.retirement_date||null})
 }
 const touch=(key,row)=>{
  if(!key||key==='name:')return;
  const existing=directory.get(key);
  if(existing){if(row.source_department)existing.sourceDepartment=String(row.source_department).normalize('NFKC').trim();return}
  const code=normalizeCode(row.worker_code||row.employee_no),name=String(row.worker_name||'').normalize('NFKC').trim()||'不明';
  directory.set(key,{key,name,code:code||null,staffId:null,department:row.source_department||null,employment:null,scope:'other',category:(row.source_department&&row.source_department!=='物流部')?'support':'unknown'})
 };
 for(const r of wmsRows)touch(identityFor(r),r);
 for(const r of tdRows)touch(identityFor(r),r)
}
function canonicalForStaff(staffId){
 return staffId&&staffById.has(staffId)?'staff:'+staffId:null
}

async function loadData(){
 const fy=Number($('fiscalYear').value),months=fyMonths(fy),[start]=monthRange(months[0]),[,end]=monthRange(months[11]);
 $('loadStatus').textContent='データ読込中…';
 [wmsRows,tdRows,ptRows,staffRows]=await Promise.all([
  restAll('oplh_wms_daily','owner_id=eq.'+user.id+'&work_date=gte.'+start+'&work_date=lte.'+end+'&select=work_date,staff_id,worker_key,worker_code,worker_name,activity_key,activity_label,action_count,quantity&order=work_date.asc'),
  restAll('oplh_timedesigner_daily','owner_id=eq.'+user.id+'&work_date=gte.'+start+'&work_date=lte.'+end+'&activity_key=in.(picking,stock_move,shipping_check,receiving)&select=work_date,staff_id,worker_key,employee_no,worker_name,source_department,activity_key,activity_label,work_minutes&order=work_date.asc'),
  restAll('logistics_work_time','owner_id=eq.'+user.id+'&work_date=gte.'+start+'&work_date=lte.'+end+'&select=work_date,staff_id,picking_minutes,stock_move_minutes&order=work_date.asc'),
  restAll('logistics_staff','owner_id=eq.'+user.id+'&select=id,name,employment_type,is_active,retirement_date')
 ]);
 buildDirectory();renderWorkerOptions();renderAll();
 $('loadStatus').textContent='WMS '+fmt(wmsRows.length)+'集計行 / TimeDesigner '+fmt(tdRows.length)+'集計行 / 物流PT '+fmt(ptRows.length)+'日次行';
}
function currentWorkerSet(){
 const selected=$('workerFilter').value,scope=$('scopeFilter').value,group=$('groupFilter').value;
 if(selected!=='all')return new Set([selected]);
 const set=new Set();
 for(const[x,v]of directory){
  const scopeOk=scope==='all'||v.scope===scope,groupOk=group==='all'||v.category===group;
  if(scopeOk&&groupOk)set.add(x)
 }
 return set
}
function workerIncluded(key,set){return set.has(key)}
function activityTimeMap(workerSet){
 const map=new Map(),add=(ym,key,act,min)=>{if(!workerIncluded(key,workerSet))return;const k=ym+'|'+act;map.set(k,(map.get(k)||0)+(Number(min)||0))};
 for(const r of tdRows){const ym=companyYmFromDate(r.work_date);if(!ym)continue;add(ym,identityFor(r),r.activity_key,r.work_minutes)}
 for(const r of ptRows){const ym=companyYmFromDate(r.work_date),key=canonicalForStaff(r.staff_id);if(!ym||!key)continue;add(ym,key,'picking',r.picking_minutes);add(ym,key,'receiving',r.stock_move_minutes)}
 return map
}
function aggregate(){
 const fy=Number($('fiscalYear').value),months=fyMonths(fy),workerSet=currentWorkerSet(),timeMap=activityTimeMap(workerSet),monthMap=new Map(months.map(m=>[m,{ym:m,acts:{},actHours:{},quantity:0,total:0,hours:0,matchedActions:0}]));
 const actTotal={};let workersUsed=new Set();
 for(const r of wmsRows){
  const key=identityFor(r);if(!workerIncluded(key,workerSet))continue;const ym=companyYmFromDate(r.work_date),m=monthMap.get(ym);if(!m)continue;
  const act=r.activity_key||'other',actions=Number(r.action_count)||0,qty=Number(r.quantity)||0,a=m.acts[act]||(m.acts[act]={actions:0,quantity:0});a.actions+=actions;a.quantity+=qty;m.total+=actions;m.quantity+=qty;workersUsed.add(key);
  const t=actTotal[act]||(actTotal[act]={actions:0,quantity:0,hours:0});t.actions+=actions;t.quantity+=qty
 }
 for(const m of monthMap.values()){
  for(const act of ACTIVITY_ORDER){
   const mins=timeMap.get(m.ym+'|'+act)||0,hrs=mins/60;m.actHours[act]=hrs;
   if(hrs>0){m.hours+=hrs;m.matchedActions+=(m.acts[act]?.actions||0)}
   const t=actTotal[act]||(actTotal[act]={actions:0,quantity:0,hours:0});t.hours+=hrs
  }
 }
 const monthly=[...monthMap.values()],totals=monthly.reduce((a,m)=>({actions:a.actions+m.total,quantity:a.quantity+m.quantity,hours:a.hours+m.hours,matchedActions:a.matchedActions+m.matchedActions}),{actions:0,quantity:0,hours:0,matchedActions:0});
 return{monthly,actTotal,totals,workerSet,workersUsed}
}
function renderWorkerOptions(){
 const scope=$('scopeFilter').value,group=$('groupFilter').value,current=$('workerFilter').value;
 const byPerson=new Map();
 for(const s of staffRows){
  const p=staffParts(s.name),personKey=p.code||p.norm||s.id,existing=byPerson.get(personKey);
  if(!existing||(!existing.is_active&&s.is_active))byPerson.set(personKey,s)
 }
 const masterOnly=[...byPerson.values()]
   .filter(s=>group==='all'||(s.employment_type==='社員'?'employee':s.employment_type==='パート'?'part':s.employment_type==='派遣'?'temp':s.employment_type==='シルバー'?'silver':'unknown')===group)
   .map(s=>{const p=staffParts(s.name);return{...s,key:'staff:'+s.id,display:p.display||p.raw,code:p.code}})
   .sort((a,b)=>{
    const ac=String(a.code||''),bc=String(b.code||'');
    if(ac&&bc)return ac.localeCompare(bc,'ja',{numeric:true,sensitivity:'base'});
    if(ac)return-1;if(bc)return 1;
    return a.display.localeCompare(b.display,'ja')
   });
 const option=x=>'<option value="'+x.key+'">'+escapeHtml(x.display)+(x.code?' ('+escapeHtml(x.code)+')':'')+'</option>';
 if(scope==='other'){
  $('workerFilter').innerHTML='<option value="all">その他 全体</option>';
  $('workerFilter').value='all';return
 }
 let html='<option value="all">'+(scope==='logistics'?'物流部 全体':'全体')+'</option>';
 if(masterOnly.length)html+='<optgroup label="物流部（従業員マスタ）">'+masterOnly.map(option).join('')+'</optgroup>';
 $('workerFilter').innerHTML=html;
 if([...$('workerFilter').options].some(o=>o.value===current))$('workerFilter').value=current;else $('workerFilter').value='all'
}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderAll(){
 const a=aggregate(),t=a.totals,selected=$('workerFilter').value,info=selected==='all'?null:directory.get(selected);
 $('kActions').textContent=fmt(t.actions);$('kQuantity').textContent=fmt(t.quantity);$('kHours').textContent=hours(t.hours);$('kRate').textContent=t.hours?fmt(t.matchedActions/t.hours,1)+'件/h':'—';$('kWorkers').textContent=fmt(a.workersUsed.size);
 $('selectedWorkerNote').textContent=info?(info.name+(info.code?' / '+info.code:'')+' / '+(info.scope==='logistics'?'物流部':'その他')+(info.employment?' / '+info.employment:'')):'全体';
 renderLegend();renderChart(a.monthly);renderMonthly(a.monthly);renderHumanHours(a.monthly);renderActivities(a.actTotal)
}
function renderLegend(){$('chartLegend').innerHTML=ACTIVITY_ORDER.map(k=>'<span class="legend-item"><i class="legend-dot" style="background:'+ACTIVITY_COLORS[k]+'"></i>'+ACTIVITY_LABELS[k]+'</span>').join('')}
function renderChart(monthly){
 const canvas=$('wmsChart'),box=canvas.parentElement.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.max(600,box.width),h=Math.max(260,box.height);canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
 const pad={l:58,r:20,t:18,b:42},cw=w-pad.l-pad.r,ch=h-pad.t-pad.b,max=Math.max(1,...monthly.map(m=>m.total)),step=cw/monthly.length,barW=Math.min(58,step*.7);
 ctx.font='12px sans-serif';ctx.fillStyle='#667085';ctx.strokeStyle='#e5e7eb';ctx.lineWidth=1;
 for(let i=0;i<=4;i++){const y=pad.t+ch*(1-i/4),val=max*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();ctx.textAlign='right';ctx.fillText(Math.round(val).toLocaleString(),pad.l-8,y+4)}
 monthly.forEach((m,idx)=>{const x=pad.l+step*idx+(step-barW)/2;let yBase=pad.t+ch;for(const act of ACTIVITY_ORDER){const v=m.acts[act]?.actions||0;if(!v)continue;const bh=ch*v/max;yBase-=bh;ctx.fillStyle=ACTIVITY_COLORS[act];ctx.fillRect(x,yBase,barW,bh)}ctx.fillStyle='#475467';ctx.textAlign='center';ctx.fillText(Number(m.ym.split('-')[1])+'月度',x+barW/2,h-16)});
}
function renderMonthly(monthly){
 $('monthlyHead').innerHTML='<tr><th>月度</th>'+ACTIVITY_ORDER.map(k=>'<th>'+ACTIVITY_LABELS[k]+'</th>').join('')+'<th>合計</th><th>実績数</th><th>対応時間</th><th>件/h</th></tr>';
 $('monthlyBody').innerHTML=monthly.map(m=>'<tr><td><b>'+Number(m.ym.split('-')[1])+'月度</b></td>'+ACTIVITY_ORDER.map(k=>'<td>'+fmt(m.acts[k]?.actions||0)+'</td>').join('')+'<td><b>'+fmt(m.total)+'</b></td><td>'+fmt(m.quantity)+'</td><td>'+hours(m.hours)+'</td><td>'+(m.hours?fmt(m.matchedActions/m.hours,1):'—')+'</td></tr>').join('')
}
function renderHumanHours(monthly){
 $('humanHoursHead').innerHTML='<tr><th>月度</th>'+ACTIVITY_ORDER.map(k=>'<th>'+ACTIVITY_LABELS[k]+'</th>').join('')+'<th>合計人時</th></tr>';
 $('humanHoursBody').innerHTML=monthly.map(m=>'<tr><td><b>'+Number(m.ym.split('-')[1])+'月度</b></td>'+ACTIVITY_ORDER.map(k=>'<td>'+hours(m.actHours?.[k]||0)+'</td>').join('')+'<td><b>'+hours(m.hours)+'</b></td></tr>').join('')
}
function renderActivities(actTotal){
 $('activityBody').innerHTML=ACTIVITY_ORDER.map(k=>{const x=actTotal[k]||{actions:0,quantity:0,hours:0},rate=x.hours?x.actions/x.hours:null,qrate=x.hours?x.quantity/x.hours:null;return'<tr><td>'+ACTIVITY_LABELS[k]+'</td><td>'+fmt(x.actions)+'</td><td>'+fmt(x.quantity)+'</td><td>'+hours(x.hours)+'</td><td>'+fmt(rate,1)+'</td><td>'+fmt(qrate,1)+'</td></tr>'}).join('')
}
function initYears(){const fy=fiscalStartYear(todayCompanyYm()),sel=$('fiscalYear');for(let y=fy-2;y<=fy+1;y++){const o=document.createElement('option');o.value=String(y);o.textContent=y+'年度';if(y===fy)o.selected=true;sel.appendChild(o)}}
function showApp(){const ok=!!user;$('authView').classList.toggle('hidden',ok);$('appView').classList.toggle('hidden',!ok);$('logoutBtn').classList.toggle('hidden',!ok);$('userLabel').textContent=user?.email||''}
async function login(){const email=$('email').value.trim(),password=$('password').value;$('authError').textContent='';try{const d=await req('/auth/v1/token?grant_type=password',{method:'POST',skipRefresh:true,body:JSON.stringify({email,password})});saveSession(d);user=d.user;showApp();await loadData()}catch(e){$('authError').textContent=e.message}}
function logout(){saveSession(null);session=null;user=null;showApp()}
async function restoreLogin(){session=loadSession();if(session?.refresh_token){try{if(!session?.access_token||accessTokenNearExpiry())await refreshSession();user=await req('/auth/v1/user');showApp();await loadData();return}catch(e){console.warn(e)}}saveSession(null);session=null;user=null;showApp()}
initYears();$('loginBtn').onclick=login;$('logoutBtn').onclick=logout;$('reloadBtn').onclick=loadData;$('fiscalYear').onchange=loadData;$('scopeFilter').onchange=()=>{renderWorkerOptions();$('workerFilter').value='all';renderAll()};$('groupFilter').onchange=()=>{renderWorkerOptions();$('workerFilter').value='all';renderAll()};$('workerFilter').onchange=renderAll;window.addEventListener('resize',()=>{if(user)renderAll()});setInterval(()=>{if(session?.refresh_token&&accessTokenNearExpiry())refreshSession()},5*60*1000);restoreLogin();
