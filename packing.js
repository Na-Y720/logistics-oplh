const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='logistics_monthly_oplh_session_v1';
const $=id=>document.getElementById(id);
let session=null,user=null,currentBundle=null,fiscalBundles=[],refreshPromise=null;

function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function accessTokenNearExpiry(){const exp=Number(session?.expires_at||0);return !!(exp&&Date.now()>=(exp*1000-5*60*1000))}
async function refreshSession(){if(refreshPromise)return refreshPromise;if(!session?.refresh_token)return false;refreshPromise=(async()=>{try{const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});const d=await res.json().catch(()=>null);if(!res.ok||!d?.access_token)return false;saveSession(d);user=d.user||user;return true}catch{return false}finally{refreshPromise=null}})();return refreshPromise}
async function req(path,opt={}){const{skipRefresh=false,...fo}=opt;if(!skipRefresh&&session?.refresh_token&&(!session?.access_token||accessTokenNearExpiry())&&!path.includes('grant_type='))await refreshSession();const headers={apikey:SB_KEY,'Content-Type':'application/json',...(fo.headers||{})};if(session?.access_token)headers.Authorization='Bearer '+session.access_token;let res=await fetch(SB_URL+path,{...fo,headers});if(res.status===401&&!skipRefresh&&session?.refresh_token&&!path.includes('grant_type=')){if(await refreshSession())return req(path,{...fo,skipRefresh:true})}const txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||('HTTP '+res.status));return data}
const rest=(table,query='',opt={})=>req('/rest/v1/'+table+(query?'?'+query:''),opt);

function localDateISO(d){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
function companyMonthToday(){const d=new Date(),y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate();if(day>=21){let yy=y,mm=m+1;if(mm===13){mm=1;yy++}return yy+'-'+String(mm).padStart(2,'0')}return y+'-'+String(m).padStart(2,'0')}
function monthRange(ym){let[y,m]=ym.split('-').map(Number),py=y,pm=m-1;if(pm===0){pm=12;py--}return[py+'-'+String(pm).padStart(2,'0')+'-21',y+'-'+String(m).padStart(2,'0')+'-20']}
function shiftYm(ym,delta){let[y,m]=ym.split('-').map(Number);m+=delta;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+String(m).padStart(2,'0')}
function fiscalStartYear(ym){const[y,m]=ym.split('-').map(Number);return m>=3?y:y-1}
function companyYmFromDate(iso){let[y,m,d]=String(iso||'').split('-').map(Number);if(!y||!m||!d)return null;if(d>=21){m++;if(m===13){m=1;y++}}return y+'-'+String(m).padStart(2,'0')}
function ymRange(startYm,endYm){const out=[];let x=startYm;while(x<=endYm){out.push(x);x=shiftYm(x,1);if(out.length>24)break}return out}
function fmt(v,d=1){return v==null||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('ja-JP',{minimumFractionDigits:d,maximumFractionDigits:d})}
function intFmt(v){return v==null||!Number.isFinite(Number(v))?'—':Math.round(Number(v)).toLocaleString('ja-JP')}
function hours(v){return v==null||!Number.isFinite(Number(v))?'—':fmt(v,2)+'h'}
function seconds(v){return v==null||!Number.isFinite(Number(v))?'—':fmt(v,2)+'秒'}

function packMetrics(b){
 const m=b?.monthly||{},lap1=Number(m.auto1_lap_seconds)||null,count1=m.auto1_count==null?null:Number(m.auto1_count),lap2=Number(m.auto2_lap_seconds)||null,count2=m.auto2_count==null?null:Number(m.auto2_count),handLap=Number(m.hand_pack_lap_seconds)||null;
 const auto1Hourly=lap1?3600/lap1:null,auto2Hourly=lap2?3600/lap2:null,handHourly=handLap?3600/handLap:null;
 const auto1Hours=lap1&&count1!=null?count1*lap1/3600:null,auto2Hours=lap2&&count2!=null?count2*lap2/3600:null;
 const tdHand=(b?.td||[]).filter(r=>r.activity_key==='hand_pack').reduce((a,r)=>a+(Number(r.work_minutes)||0),0)/60;
 const ptHand=(b?.pt||[]).reduce((a,r)=>a+(Number(r.hand_pack_minutes)||0),0)/60;
 const handHours=tdHand+ptHand+(Number(m.timee_packing_hours)||0);
 return{lap1,count1,auto1Hourly,auto1Hours,auto1Three:auto1Hourly?auto1Hourly/3:null,lap2,count2,auto2Hourly,auto2Hours,auto2Three:auto2Hourly?auto2Hourly/3:null,handLap,handHourly,handHours}
}
async function loadMonth(ym){
 const[start,end]=monthRange(ym);
 const [monthlyRows,pt,td]=await Promise.all([
  rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${ym}&select=*`).catch(()=>[]),
  rest('logistics_work_time',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&select=work_date,hand_pack_minutes`).catch(()=>[]),
  rest('oplh_timedesigner_daily',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&activity_key=eq.hand_pack&select=work_date,activity_key,work_minutes`).catch(()=>[])
 ]);
 return{ym,monthly:monthlyRows?.[0]||null,pt:pt||[],td:td||[],start,end}
}
async function loadFiscal(fy){
 const startYm=fy+'-03',endYm=(fy+1)+'-02',[startDate]=monthRange(startYm),[,endDate]=monthRange(endYm),months=ymRange(startYm,endYm);
 const [monthlyRows,ptRows,tdRows]=await Promise.all([
  rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=gte.${startYm}&month_ym=lte.${endYm}&select=*&order=month_ym.asc`).catch(()=>[]),
  rest('logistics_work_time',`owner_id=eq.${user.id}&work_date=gte.${startDate}&work_date=lte.${endDate}&select=work_date,hand_pack_minutes`).catch(()=>[]),
  rest('oplh_timedesigner_daily',`owner_id=eq.${user.id}&work_date=gte.${startDate}&work_date=lte.${endDate}&activity_key=eq.hand_pack&select=work_date,activity_key,work_minutes`).catch(()=>[])
 ]);
 const mm=new Map((monthlyRows||[]).map(r=>[r.month_ym,r])),pm=new Map(),tm=new Map(),push=(map,k,r)=>{if(!k)return;const a=map.get(k)||[];a.push(r);map.set(k,a)};
 for(const r of ptRows||[])push(pm,companyYmFromDate(r.work_date),r);
 for(const r of tdRows||[])push(tm,companyYmFromDate(r.work_date),r);
 return months.map(ym=>{const[start,end]=monthRange(ym);return{ym,monthly:mm.get(ym)||null,pt:pm.get(ym)||[],td:tm.get(ym)||[],start,end}})
}
function stateCell(b){const m=b.monthly;if(!m)return'<span class="badge missing">未入力</span>';return m.status==='confirmed'?'<span class="badge confirmed">確定済</span>':'<span class="badge open">運用中</span>'}
function renderSelected(){
 const b=currentBundle,m=b.monthly||{},x=packMetrics(b);$('statusBadge').textContent=!b.monthly?'未入力':(m.status==='confirmed'?'確定済':'運用中');$('statusBadge').className='badge '+(!b.monthly?'missing':(m.status==='confirmed'?'confirmed':'open'));
 $('a1Lap').textContent=seconds(x.lap1);$('a1Hourly').textContent=x.auto1Hourly==null?'—':fmt(x.auto1Hourly,1)+'個/h';$('a1Count').textContent=x.count1==null?'—':intFmt(x.count1)+'個';$('a1Hours').textContent=hours(x.auto1Hours);$('a1Three').textContent=x.auto1Three==null?'—':fmt(x.auto1Three,1)+'個/人時';
 $('a2Lap').textContent=seconds(x.lap2);$('a2Hourly').textContent=x.auto2Hourly==null?'—':fmt(x.auto2Hourly,1)+'個/h';$('a2Count').textContent=x.count2==null?'—':intFmt(x.count2)+'個';$('a2Hours').textContent=hours(x.auto2Hours);$('a2Three').textContent=x.auto2Three==null?'—':fmt(x.auto2Three,1)+'個/人時';
 $('handLap').textContent=seconds(x.handLap);$('handHourly').textContent=x.handHourly==null?'—':fmt(x.handHourly,1)+'個/h';$('handHours').textContent=hours(x.handHours);
}
function renderFiscal(){
 const fy=fiscalStartYear($('monthPick').value),note=fy+'年度（'+fy+'年3月度～'+(fy+1)+'年2月度）';$('fiscalNote1').textContent=note;$('fiscalNote2').textContent=note;$('fiscalNote3').textContent=note;
 $('auto1FiscalBody').innerHTML=fiscalBundles.map(b=>{const x=packMetrics(b),mo=Number(b.ym.split('-')[1]);return`<tr><td><b>${mo}月度</b></td><td>${stateCell(b)}</td><td>${fmt(x.lap1,2)}</td><td>${fmt(x.auto1Hourly,1)}</td><td>${x.count1==null?'—':intFmt(x.count1)}</td><td>${fmt(x.auto1Hours,2)}</td><td>${fmt(x.auto1Three,1)}</td></tr>`}).join('');
 $('auto2FiscalBody').innerHTML=fiscalBundles.map(b=>{const x=packMetrics(b),mo=Number(b.ym.split('-')[1]);return`<tr><td><b>${mo}月度</b></td><td>${stateCell(b)}</td><td>${fmt(x.lap2,2)}</td><td>${fmt(x.auto2Hourly,1)}</td><td>${x.count2==null?'—':intFmt(x.count2)}</td><td>${fmt(x.auto2Hours,2)}</td><td>${fmt(x.auto2Three,1)}</td></tr>`}).join('');
 $('handFiscalBody').innerHTML=fiscalBundles.map(b=>{const x=packMetrics(b),mo=Number(b.ym.split('-')[1]);return`<tr><td><b>${mo}月度</b></td><td>${stateCell(b)}</td><td>${fmt(x.handLap,2)}</td><td>${fmt(x.handHourly,1)}</td><td>${fmt(x.handHours,2)}</td></tr>`}).join('')
}
async function loadAll(){const ym=$('monthPick').value||companyMonthToday();$('monthPick').value=ym;const[start,end]=monthRange(ym);$('monthRange').textContent=start+' ～ '+end+'（21日～翌20日）';try{const fy=fiscalStartYear(ym);[currentBundle,fiscalBundles]=await Promise.all([loadMonth(ym),loadFiscal(fy)]);renderSelected();renderFiscal()}catch(e){console.error(e);alert('読み込みに失敗しました: '+e.message)}}
function showApp(){const ok=!!user;$('authView').classList.toggle('hidden',ok);$('appView').classList.toggle('hidden',!ok);$('logoutBtn').classList.toggle('hidden',!ok);$('userLabel').textContent=user?.email||''}
async function login(){const email=$('email').value.trim(),password=$('password').value;$('authError').textContent='';try{const d=await req('/auth/v1/token?grant_type=password',{method:'POST',skipRefresh:true,body:JSON.stringify({email,password})});saveSession(d);user=d.user;showApp();await loadAll()}catch(e){$('authError').textContent=e.message}}
function logout(){saveSession(null);session=null;user=null;showApp()}
async function restoreLogin(){session=loadSession();if(session?.refresh_token){try{if(!session?.access_token||accessTokenNearExpiry())await refreshSession();user=await req('/auth/v1/user');showApp();await loadAll();return}catch(e){console.warn(e)}}saveSession(null);session=null;user=null;showApp()}
$('loginBtn').onclick=login;$('logoutBtn').onclick=logout;$('reloadBtn').onclick=loadAll;$('monthPick').onchange=loadAll;$('prevMonthBtn').onclick=()=>{$('monthPick').value=shiftYm($('monthPick').value,-1);loadAll()};$('nextMonthBtn').onclick=()=>{$('monthPick').value=shiftYm($('monthPick').value,1);loadAll()};
setInterval(()=>{if(session?.refresh_token&&accessTokenNearExpiry())refreshSession()},5*60*1000);
restoreLogin();
