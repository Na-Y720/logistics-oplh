const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='logistics_monthly_oplh_session_v1';
const SHIPPING_START='09:00',SHIPPING_END='15:30';
const $=id=>document.getElementById(id);let session=null,user=null,staff=[],defaults=[],monthRows=[],editingStaff=null,editingMonthIndex=null,dirty=false,lastLoadedMonth='';let monthlySort={key:'name',dir:'asc'},masterSort={key:'name',dir:'asc'};let refreshPromise=null;
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('ja-JP',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
function tmin(t){if(!t)return null;const[a,b]=String(t).slice(0,5).split(':').map(Number);return a*60+b}function overlap(a,b,c,d){return Math.max(0,Math.min(b,d)-Math.max(a,c))}
function calcSchedule(r){const st=tmin(r.start_time),en=tmin(r.end_time),bs=tmin(r.break_start),be=tmin(r.break_end),ss=tmin(SHIPPING_START),se=tmin(SHIPPING_END);if(st==null||en==null||en<=st)return{grossDay:0,shipDay:0,grossMonth:0,shipMonth:0};const br=(bs!=null&&be!=null)?overlap(bs,be,st,en):0;const gross=Math.max(0,en-st-br);let ship=overlap(st,en,ss,se);if(bs!=null&&be!=null)ship-=overlap(bs,be,Math.max(st,ss),Math.min(en,se));ship=Math.max(0,ship);return{grossDay:gross/60,shipDay:ship/60,grossMonth:gross/60*n(r.work_days),shipMonth:ship/60*n(r.work_days)}}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}function monthDate(){return ($('month').value||new Date().toISOString().slice(0,7))+'-01'}
function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
async function refreshSession(){
 if(refreshPromise)return refreshPromise;
 if(!session?.refresh_token)return false;
 refreshPromise=(async()=>{
  try{
   const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
   const data=await res.json().catch(()=>null);
   if(!res.ok||!data?.access_token)return false;
   saveSession(data);user=data.user||user;showApp();return true;
  }catch{return false}
  finally{refreshPromise=null}
 })();
 return refreshPromise;
}
async function req(path,opt={}){
 const{skipRefresh=false,...fetchOpt}=opt;
 const headers={'apikey':SB_KEY,'Content-Type':'application/json',...(fetchOpt.headers||{})};
 if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
 let res;try{res=await fetch(SB_URL+path,{...fetchOpt,headers})}catch{throw new Error('Supabaseへ接続できません。インターネット接続を確認してください。')}
 if(res.status===401&&!skipRefresh&&session?.refresh_token&&!path.includes('grant_type=')){
  if(await refreshSession())return req(path,{...fetchOpt,skipRefresh:true});
 }
 let txt=await res.text(),data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
 if(!res.ok)throw new Error(data?.message||data?.msg||data?.error_description||data?.error||('HTTP '+res.status));return data
}
async function rest(table,params='',opt={}){return req('/rest/v1/'+table+(params?'?'+params:''),opt)}
async function login(){
 const em=$('email').value.trim(),pw=$('password').value;if(!em||!pw){$('authError').textContent='メールアドレスとパスワードを入力してください。';return}
 const b=$('loginBtn');b.disabled=true;b.textContent='ログイン中…';$('authError').textContent='';
 try{
  const d=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:em,password:pw}),skipRefresh:true});
  saveSession(d);user=d.user;showApp();
  try{await loadAll()}catch(e){showDataError(e)}
 }catch(e){$('authError').textContent=e.message}
 finally{b.disabled=false;b.textContent='ログイン'}
}
async function logout(){try{if(session?.access_token)await req('/auth/v1/logout',{method:'POST'})}catch{}saveSession(null);user=null;showApp()}function showApp(){const on=!!session?.access_token;$('authView').classList.toggle('hidden',on);$('appView').classList.toggle('hidden',!on);$('logoutBtn').classList.toggle('hidden',!on);$('userLabel').textContent=user?.email||''}
async function loadAll(){if(!$('month').value)$('month').value=new Date().toISOString().slice(0,7);const [s,d]=await Promise.all([rest('logistics_staff',`owner_id=eq.${user.id}&is_active=eq.true&select=*&order=name.asc`),rest('logistics_staff_defaults',`owner_id=eq.${user.id}&select=*`)]);staff=(s||[]).filter(x=>!String(x.name).startsWith('__'));defaults=d||[];await loadMonth();renderMaster()}
async function ensureMonthRows(){const m=monthDate();let rows=await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&plan_month=eq.${m}&select=*`);const missing=staff.filter(s=>!(rows||[]).some(r=>r.staff_id===s.id));if(!missing.length)return rows||[];let prev=[];try{prev=await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&plan_month=lt.${m}&select=*&order=plan_month.desc`)}catch{}const inserts=[];for(const s of missing){const def=defaults.find(d=>d.staff_id===s.id);const p=(prev||[]).find(x=>x.staff_id===s.id);inserts.push({owner_id:user.id,staff_id:s.id,plan_month:m,work_days:p?n(p.work_days):n(def?.default_work_days),included:p?p.included:!!def,start_time:def?.start_time||null,end_time:def?.end_time||null,break_start:def?.break_start||null,break_end:def?.break_end||null})}if(inserts.length)await rest('logistics_monthly_staffing','',{method:'POST',body:JSON.stringify(inserts)});return await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&plan_month=eq.${m}&select=*`)}
function showDataError(e){
 console.error(e);
 const box=$('monthNotice');if(box){box.classList.remove('hidden');box.textContent='データ表示エラー: '+(e?.message||e)}
 const st=$('status');if(st){st.className='status bad';st.textContent='データの読み込みに失敗しました。再読み込みしてください。'}
 const tb=$('monthlyBody');if(tb&&!tb.children.length)tb.innerHTML='<tr><td colspan="11" class="err">一覧を表示できませんでした。</td></tr>';
}
async function loadMonth(){
 const m=monthDate();
 try{
  const [plan,rows]=await Promise.all([rest('logistics_monthly_plans',`owner_id=eq.${user.id}&plan_month=eq.${m}&select=*`),ensureMonthRows()]);
  const p=plan?.[0];$('shipments').value=p?.planned_shipments??0;$('targetOplh').value=p?.target_oplh??32;$('bufferPct').value=p?.safety_buffer_pct??0;
  monthRows=(rows||[]).map(r=>({...r,staff:staff.find(s=>s.id===r.staff_id),default:defaults.find(d=>d.staff_id===r.staff_id)})).filter(r=>r.staff);
  dirty=false;updateDirty();lastLoadedMonth=$('month').value;
  const box=$('monthNotice');if(box){box.classList.add('hidden');box.textContent=''}
  renderMonthly();
 }catch(e){showDataError(e);throw e}
}
function renderMonthly(){
 let secured=0,gross=0,days=0,included=0;
 for(const r of monthRows){if(!r.included)continue;const c=calcSchedule(r);secured+=c.shipMonth;gross+=c.grossMonth;days+=n(r.work_days);included++}
 const shipments=n($('shipments').value),target=n($('targetOplh').value),buf=n($('bufferPct').value),required=target>0?shipments/target*(1+buf/100):Infinity,gap=secured-required,need=secured>0?shipments/secured:Infinity,ful=required>0?secured/required*100:(shipments===0?100:0);
 $('requiredHours').textContent=Number.isFinite(required)?fmt(required)+'h':'—';$('securedHours').textContent=fmt(secured)+'h';$('gapHours').textContent=Number.isFinite(gap)?(gap>=0?'+':'')+fmt(gap)+'h':'—';$('requiredOplh').textContent=Number.isFinite(need)?fmt(need,2):'—';$('staffCount').textContent=staff.length+'人';$('includedCount').textContent=included+'人';$('totalDays').textContent=fmt(days)+'日';$('grossHours').textContent=fmt(gross)+'h';$('shipHours').textContent=fmt(secured)+'h';$('otherHours').textContent=fmt(Math.max(0,gross-secured))+'h';$('fulfillRate').textContent=Number.isFinite(ful)?fmt(ful)+'%':'—';$('fulfillBar').style.width=Math.max(0,Math.min(100,Number.isFinite(ful)?ful:0))+'%';
 const st=$('status');if(!shipments){st.className='status warn';st.textContent='月間出荷予定件数を入力してください'}else if(gap>=0){st.className='status good';st.textContent=`人時達成：${fmt(gap)}h余剰 / 充足率 ${fmt(ful)}%`}else{st.className='status bad';st.textContent=`人時不足：${fmt(Math.abs(gap))}h不足。現有人時ではOPLH ${fmt(need,2)} が必要`}
 const tb=$('monthlyBody');tb.innerHTML='';
 const sorted=monthRows.map((r,i)=>({r,i,c:calcSchedule(r)})).sort((a,b)=>{
  const value=x=>monthlySort.key==='name'?String(x.r.staff?.name||''):monthlySort.key==='type'?String(x.r.staff?.employment_type||''):monthlySort.key==='shipDay'?x.c.shipDay:monthlySort.key==='workDays'?n(x.r.work_days):monthlySort.key==='grossMonth'?x.c.grossMonth:x.c.shipMonth;
  const av=value(a),bv=value(b);const cmp=typeof av==='string'?av.localeCompare(bv,'ja',{numeric:true,sensitivity:'base'}):av-bv;return monthlySort.dir==='asc'?cmp:-cmp
 });
 if(!sorted.length){tb.innerHTML='<tr><td colspan="11" class="small">この月の従業員データはありません。</td></tr>'}
 for(const {r,i,c} of sorted){
  try{
   const missing=!r.start_time||!r.end_time,tr=document.createElement('tr');if(!r.included)tr.classList.add('off');
   tr.innerHTML=`<td><input class="check" type="checkbox" data-inc="${i}" ${r.included?'checked':''} ${missing?'disabled':''}></td><td><b>${esc(r.staff?.name||'（氏名未設定）')}</b></td><td>${esc(r.staff?.employment_type||'')}</td><td class="time">${missing?'—':String(r.start_time).slice(0,5)+'～'+String(r.end_time).slice(0,5)}</td><td class="time">${r.break_start&&r.break_end?String(r.break_start).slice(0,5)+'～'+String(r.break_end).slice(0,5):'なし'}</td><td class="num"><b>${missing?'—':fmt(c.shipDay,2)+'h'}</b></td><td class="num"><input class="days" type="number" min="0" max="31" step="0.5" data-days="${i}" value="${n(r.work_days)}" ${missing?'disabled':''}></td><td class="num">${fmt(c.grossMonth)}h</td><td class="num"><b>${fmt(c.shipMonth)}h</b></td><td>${missing?'<span class="badge missing">勤務未設定</span>':'<span class="badge">計算可</span>'}</td><td><button data-ms="${i}" ${missing?'disabled':''}>月別勤務変更</button></td>`;
   tb.appendChild(tr)
  }catch(e){const tr=document.createElement('tr');tr.innerHTML=`<td colspan="11" class="err">${esc(r.staff?.name||'従業員')} の行を表示できません: ${esc(e.message)}</td>`;tb.appendChild(tr)}
 }
 tb.querySelectorAll('[data-inc]').forEach(x=>x.onchange=()=>{monthRows[+x.dataset.inc].included=x.checked;markDirty();renderMonthly()});
 tb.querySelectorAll('[data-days]').forEach(x=>x.onchange=()=>{monthRows[+x.dataset.days].work_days=Math.max(0,Math.min(31,n(x.value)));markDirty();renderMonthly()});
 tb.querySelectorAll('[data-ms]').forEach(x=>x.onclick=()=>openMonthSchedule(+x.dataset.ms));
 updateSortHeaders()
}
function markDirty(){dirty=true;updateDirty()}function updateDirty(){$('dirtyLabel').textContent=dirty?'● 未保存の変更があります':'保存済み';$('dirtyLabel').style.color=dirty?'#b54708':'#027a48'}
