const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='logistics_monthly_oplh_session_v1';
const $=id=>document.getElementById(id);

let session=null,user=null,staff=[],dailyRows=new Map(),dailySummary=null;
let selectedDate=null,editingStaffId=null,refreshPromise=null;
const saveTimers=new Map();
let summaryTimer=null;

const numericFields=[
  'phone_customer_count','phone_partner_count','phone_complaint_count','phone_first_resolution_count',
  'mail_relation_count','mail_store_manager_count','mail_complaint_count','mail_first_resolution_target_count','mail_first_resolution_count',
  'returns_exchange_count','store_service_count','complaint_count','store_cancel_count','customer_cancel_count',
  'work_case_count','work_minutes','single_resolution_count','complaint_minutes','manual_case_created_count'
];

function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
async function refreshSession(){
  if(refreshPromise)return refreshPromise;
  if(!session?.refresh_token)return false;
  refreshPromise=(async()=>{
    try{
      const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:session.refresh_token})
      });
      const d=await res.json().catch(()=>null);
      if(!res.ok||!d?.access_token)return false;
      saveSession(d);user=d.user||user;return true;
    }catch{return false}finally{refreshPromise=null}
  })();
  return refreshPromise;
}
async function req(path,opt={}){
  const {skipRefresh=false,...fo}=opt;
  const headers={apikey:SB_KEY,'Content-Type':'application/json',...(fo.headers||{})};
  if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
  let res=await fetch(SB_URL+path,{...fo,headers});
  if(res.status===401&&!skipRefresh&&session?.refresh_token&&!path.includes('grant_type=')){
    if(await refreshSession())return req(path,{...fo,skipRefresh:true});
  }
  const txt=await res.text();let data=null;
  try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||('HTTP '+res.status));
  return data;
}
async function rest(table,params='',opt={}){return req('/rest/v1/'+table+(params?'?'+params:''),opt)}
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function localDateISO(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
function dateObj(iso){return new Date(iso+'T00:00:00')}
function addDays(iso,n){const d=dateObj(iso);d.setDate(d.getDate()+n);return localDateISO(d)}
function displayDate(iso){return dateObj(iso).toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric',weekday:'short'})}
function shortDate(iso){return dateObj(iso).toLocaleDateString('ja-JP',{year:'numeric',month:'numeric',day:'numeric'})}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0}
function int(v){const x=Math.trunc(Number(v));return Number.isFinite(x)&&x>=0?x:0}
function pct(num,den){return den>0?(num/den*100).toFixed(1)+'%':'—'}
function avg(minutes,count){return count>0?(minutes/count).toFixed(1)+'分':'—'}
function blankZero(v){return Number(v)>0?String(v):''}
function setMessage(id,text='',kind=''){const el=$(id);el.textContent=text;el.className='message'+(kind?' '+kind:'')}

async function login(){
  const em=$('email').value.trim(),pw=$('password').value;
  if(!em||!pw){$('authError').textContent='メールアドレスとパスワードを入力してください。';return}
  const b=$('loginBtn');b.disabled=true;$('authError').textContent='';
  try{
    const d=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:em,password:pw}),skipRefresh:true});
    saveSession(d);user=d.user;showApp();await bootstrap();
  }catch(e){$('authError').textContent=e.message}finally{b.disabled=false}
}
async function logout(){
  try{if(session?.access_token)await req('/auth/v1/logout',{method:'POST'})}catch{}
  saveSession(null);session=null;user=null;showApp();
}
function showApp(){
  const on=!!session?.access_token;
  $('authView').classList.toggle('hidden',on);
  $('appView').classList.toggle('hidden',!on);
  $('logoutBtn').classList.toggle('hidden',!on);
  $('userLabel').textContent=user?.email||'';
}

async function loadStaff(){
  staff=await rest('cs_staff',`owner_id=eq.${user.id}&select=*&order=display_order.asc,name.asc`)||[];
  renderMaster();
}
function staffVisibleOnDate(s,iso){
  if(s.retirement_date&&iso>s.retirement_date)return false;
  return !!s.is_active;
}
function visibleStaffForDate(iso){return staff.filter(s=>staffVisibleOnDate(s,iso))}
function staffStatus(s){
  const today=localDateISO();
  if(s.retirement_date&&s.retirement_date<today)return ['退職済','retired'];
  if(!s.is_active)return ['非表示','inactive'];
  return ['在籍','active'];
}

async function loadDay(){
  const d=selectedDate||localDateISO();selectedDate=d;
  $('dailyDateLabel').textContent=displayDate(d);
  $('nextDateBtn').disabled=d>=localDateISO();
  setMessage('dailyMessage');
  try{
    const [reports,summaries]=await Promise.all([
      rest('cs_daily_reports',`owner_id=eq.${user.id}&report_date=eq.${d}&select=*`),
      rest('cs_daily_summary',`owner_id=eq.${user.id}&report_date=eq.${d}&select=*`)
    ]);
    dailyRows=new Map((reports||[]).map(r=>[r.staff_id,r]));
    dailySummary=(summaries||[])[0]||null;
    $('orderCount').value=dailySummary?.order_count?dailySummary.order_count:'';
    setSummaryState(dailySummary?'保存済 ✓':'未入力',dailySummary?'saved':'');
    renderDaily();
  }catch(e){setMessage('dailyMessage','読み込みに失敗しました: '+e.message,'bad')}
}
function changeDay(days){
  const next=addDays(selectedDate||localDateISO(),days);
  if(next>localDateISO())return;
  selectedDate=next;loadDay();
}

function numField(label,field,val,opts=''){
  return `<label class="field">${esc(label)}<input type="number" min="0" step="1" inputmode="numeric" data-field="${field}" value="${blankZero(val)}" ${opts}></label>`;
}
function selectBoolField(label,field,val){
  const v=val===true?'true':val===false?'false':'';
  return `<label class="field">${esc(label)}<select data-field="${field}"><option value="" ${v===''?'selected':''}>—</option><option value="true" ${v==='true'?'selected':''}>○</option><option value="false" ${v==='false'?'selected':''}>×</option></select></label>`;
}
function reportValue(r,f){return r?.[f]??0}
function renderDaily(){
  const root=$('staffCards');root.innerHTML='';
  const list=visibleStaffForDate(selectedDate);
  for(const s of list){
    const r=dailyRows.get(s.id)||{};
    const phoneTotal=n(r.phone_customer_count)+n(r.phone_partner_count)+n(r.phone_complaint_count);
    const mailTotal=n(r.mail_relation_count)+n(r.mail_store_manager_count)+n(r.mail_complaint_count);
    const total=phoneTotal+mailTotal;
    const first=n(r.phone_first_resolution_count)+n(r.mail_first_resolution_count);
    const card=document.createElement('article');
    card.className='staff-card';card.dataset.staff=s.id;
    const extras=s.employee_code==='100051'
      ? `<div class="extras"><div class="input-section-title">個別管理項目</div><div class="input-grid">${numField('単独解決数','single_resolution_count',r.single_resolution_count)}</div></div>`
      : s.employee_code==='100052'
      ? `<div class="extras"><div class="input-section-title">個別管理項目</div><div class="input-grid">${numField('クレーム時間(分)','complaint_minutes',r.complaint_minutes)}${selectBoolField('クレーム20分以内','complaint_within_20min',r.complaint_within_20min)}${numField('マニュアル・事例 作成数','manual_case_created_count',r.manual_case_created_count)}</div></div>`
      : '';
    card.innerHTML=`
      <div class="staff-head">
        <div><div class="staff-name">${esc(s.name)}</div><div class="staff-meta">${esc(s.employee_code)} ・ ${esc(s.employment_type)}</div></div>
        <span class="staff-state ${r.id?'saved':''}">${r.id?'保存済 ✓':'未入力'}</span>
      </div>
      <div class="staff-body">
        <div class="input-section">
          <div class="input-section-title"><span>電話</span><span class="mini-result" data-metric="phone">合計 ${phoneTotal} / 初回解決率 ${pct(n(r.phone_first_resolution_count),phoneTotal)}</span></div>
          <div class="input-grid">
            ${numField('お客様','phone_customer_count',r.phone_customer_count)}
            ${numField('取引先','phone_partner_count',r.phone_partner_count)}
            ${numField('クレーム','phone_complaint_count',r.phone_complaint_count)}
            ${numField('初回解決数','phone_first_resolution_count',r.phone_first_resolution_count)}
          </div>
        </div>
        <div class="input-section">
          <div class="input-section-title"><span>メール</span><span class="mini-result" data-metric="mail">合計 ${mailTotal} / 初回解決率 ${pct(n(r.mail_first_resolution_count),mailTotal)}</span></div>
          <div class="input-grid mail">
            ${numField('Relation','mail_relation_count',r.mail_relation_count)}
            ${numField('店長','mail_store_manager_count',r.mail_store_manager_count)}
            ${numField('クレーム','mail_complaint_count',r.mail_complaint_count)}
            ${numField('初回解決対象ラベル','mail_first_resolution_target_count',r.mail_first_resolution_target_count)}
            ${numField('初回解決数','mail_first_resolution_count',r.mail_first_resolution_count)}
          </div>
        </div>
        <div class="input-section">
          <div class="input-section-title"><span>その他対応</span><span class="mini-result" data-metric="overall">CS対応 ${total} / 総合初回解決率 ${pct(first,total)}</span></div>
          <div class="input-grid other">
            ${numField('返品交換','returns_exchange_count',r.returns_exchange_count)}
            ${numField('店舗接客','store_service_count',r.store_service_count)}
            ${numField('クレーム件数','complaint_count',r.complaint_count)}
            ${numField('店舗都合キャンセル','store_cancel_count',r.store_cancel_count)}
            ${numField('お客様都合キャンセル','customer_cancel_count',r.customer_cancel_count)}
          </div>
        </div>
        <div class="input-section">
          <div class="input-section-title"><span>作業量・時間</span><span class="mini-result" data-metric="avg">1件タイム ${avg(n(r.work_minutes),n(r.work_case_count))}</span></div>
          <div class="input-grid work">
            ${numField('件数','work_case_count',r.work_case_count)}
            ${numField('時間（分）','work_minutes',r.work_minutes,'max="1440"')}
            <div class="field">1件タイム<div class="readonly" data-metric="avgbox">${avg(n(r.work_minutes),n(r.work_case_count))}</div></div>
          </div>
        </div>
        ${extras}
        <label class="field note-row">備考<input type="text" data-field="note" value="${esc(r.note||'')}" placeholder="任意"></label>
      </div>`;
    root.appendChild(card);
  }
  root.querySelectorAll('input[data-field],select[data-field]').forEach(el=>{
    const evt=el.tagName==='SELECT'?'change':'input';
    el.addEventListener(evt,()=>{const card=el.closest('.staff-card');updateCardMetrics(card);scheduleReportSave(card)});
    if(el.tagName==='INPUT')el.addEventListener('blur',()=>scheduleReportSave(el.closest('.staff-card'),true));
  });
  refreshDailyKpis();
}
function readCard(card){
  const out={};
  numericFields.forEach(f=>{
    const el=card.querySelector(`[data-field="${f}"]`);
    out[f]=el?int(el.value):0;
  });
  const b=card.querySelector('[data-field="complaint_within_20min"]');
  out.complaint_within_20min=!b||b.value===''?null:b.value==='true';
  out.note=card.querySelector('[data-field="note"]')?.value?.trim()||'';
  return out;
}
function calcMetrics(v){
  const phone=v.phone_customer_count+v.phone_partner_count+v.phone_complaint_count;
  const mail=v.mail_relation_count+v.mail_store_manager_count+v.mail_complaint_count;
  const total=phone+mail;
  const first=v.phone_first_resolution_count+v.mail_first_resolution_count;
  return {phone,mail,total,first};
}
function updateCardMetrics(card){
  const v=readCard(card),m=calcMetrics(v);
  const p=card.querySelector('[data-metric="phone"]');if(p)p.textContent=`合計 ${m.phone} / 初回解決率 ${pct(v.phone_first_resolution_count,m.phone)}`;
  const e=card.querySelector('[data-metric="mail"]');if(e)e.textContent=`合計 ${m.mail} / 初回解決率 ${pct(v.mail_first_resolution_count,m.mail)}`;
  const o=card.querySelector('[data-metric="overall"]');if(o)o.textContent=`CS対応 ${m.total} / 総合初回解決率 ${pct(m.first,m.total)}`;
  const a=avg(v.work_minutes,v.work_case_count);
  const t=card.querySelector('[data-metric="avg"]');if(t)t.textContent='1件タイム '+a;
  const box=card.querySelector('[data-metric="avgbox"]');if(box)box.textContent=a;
  refreshDailyKpis();
}
function setCardState(card,text,kind=''){const el=card?.querySelector('.staff-state');if(!el)return;el.className='staff-state'+(kind?' '+kind:'');el.textContent=text}
function scheduleReportSave(card,immediate=false){
  if(!card)return;const id=card.dataset.staff;
  clearTimeout(saveTimers.get(id));setCardState(card,'保存待ち…','saving');
  if(immediate)saveReport(card);else saveTimers.set(id,setTimeout(()=>saveReport(card),650));
}
async function saveReport(card){
  const staffId=card.dataset.staff;clearTimeout(saveTimers.get(staffId));setCardState(card,'保存中…','saving');
  const body=readCard(card);
  Object.assign(body,{
    owner_id:user.id,staff_id:staffId,report_date:selectedDate,source:'app',
    submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()
  });
  try{
    const saved=await rest('cs_daily_reports','on_conflict=owner_id%2Cstaff_id%2Creport_date',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)
    });
    dailyRows.set(staffId,Array.isArray(saved)&&saved[0]?saved[0]:body);
    setCardState(card,'保存済 ✓','saved');setMessage('dailyMessage');
  }catch(e){setCardState(card,'保存エラー','error');setMessage('dailyMessage','保存に失敗しました: '+e.message,'bad')}
}
function refreshDailyKpis(){
  let phone=0,mail=0,total=0,first=0,complaints=0;
  document.querySelectorAll('#staffCards .staff-card').forEach(card=>{
    const v=readCard(card),m=calcMetrics(v);
    phone+=m.phone;mail+=m.mail;total+=m.total;first+=m.first;complaints+=v.complaint_count;
  });
  const orders=int($('orderCount').value);
  $('kPhone').textContent=phone.toLocaleString('ja-JP');
  $('kMail').textContent=mail.toLocaleString('ja-JP');
  $('kTotal').textContent=total.toLocaleString('ja-JP');
  $('kFirstRate').textContent=pct(first,total);
  $('kResponseRate').textContent=pct(total,orders);
  $('kComplaints').textContent=complaints.toLocaleString('ja-JP');
}
function setSummaryState(text,kind=''){$('summarySaveState').className='save-state'+(kind?' '+kind:'');$('summarySaveState').textContent=text}
function scheduleSummarySave(immediate=false){
  clearTimeout(summaryTimer);setSummaryState('保存待ち…','saving');refreshDailyKpis();
  if(immediate)saveSummary();else summaryTimer=setTimeout(saveSummary,650);
}
async function saveSummary(){
  clearTimeout(summaryTimer);setSummaryState('保存中…','saving');
  const body={owner_id:user.id,report_date:selectedDate,order_count:int($('orderCount').value),updated_at:new Date().toISOString()};
  try{
    const saved=await rest('cs_daily_summary','on_conflict=owner_id%2Creport_date',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(body)
    });
    dailySummary=Array.isArray(saved)&&saved[0]?saved[0]:body;setSummaryState('保存済 ✓','saved');
  }catch(e){setSummaryState('保存エラー','error');setMessage('dailyMessage','受注件数の保存に失敗しました: '+e.message,'bad')}
}

function getPeriodRange(anchor,mode){
  const d=dateObj(anchor);
  let start,end;
  if(mode==='week'){
    const diff=(d.getDay()+6)%7;d.setDate(d.getDate()-diff);start=localDateISO(d);d.setDate(d.getDate()+6);end=localDateISO(d);
  }else if(mode==='calendar'){
    start=localDateISO(new Date(d.getFullYear(),d.getMonth(),1));
    end=localDateISO(new Date(d.getFullYear(),d.getMonth()+1,0));
  }else{
    if(d.getDate()>=21){
      start=localDateISO(new Date(d.getFullYear(),d.getMonth(),21));
      end=localDateISO(new Date(d.getFullYear(),d.getMonth()+1,20));
    }else{
      start=localDateISO(new Date(d.getFullYear(),d.getMonth()-1,21));
      end=localDateISO(new Date(d.getFullYear(),d.getMonth(),20));
    }
  }
  return {start,end};
}
function shiftPeriod(dir){
  const mode=$('periodMode').value,anchor=$('periodAnchor').value||localDateISO(),d=dateObj(anchor);
  if(mode==='week')d.setDate(d.getDate()+dir*7);
  else{d.setDate(15);d.setMonth(d.getMonth()+dir)}
  $('periodAnchor').value=localDateISO(d);loadPeriod();
}
function emptyAgg(){const o={};numericFields.forEach(f=>o[f]=0);o.complaint_within_20min=null;return o}
function addReport(a,r){numericFields.forEach(f=>a[f]+=n(r[f]));return a}
async function loadPeriod(){
  const anchor=$('periodAnchor').value||localDateISO(),mode=$('periodMode').value,{start,end}=getPeriodRange(anchor,mode);
  $('periodRange').textContent=shortDate(start)+' ～ '+shortDate(end);setMessage('periodMessage');
  try{
    const [rows,sums]=await Promise.all([
      rest('cs_daily_reports',`owner_id=eq.${user.id}&report_date=gte.${start}&report_date=lte.${end}&select=*`),
      rest('cs_daily_summary',`owner_id=eq.${user.id}&report_date=gte.${start}&report_date=lte.${end}&select=*`)
    ]);
    const totalAgg=emptyAgg();(rows||[]).forEach(r=>addReport(totalAgg,r));
    const totalM=calcMetrics(totalAgg),orders=(sums||[]).reduce((a,r)=>a+n(r.order_count),0);
    $('sOrders').textContent=orders.toLocaleString('ja-JP');
    $('sPhone').textContent=totalM.phone.toLocaleString('ja-JP');
    $('sMail').textContent=totalM.mail.toLocaleString('ja-JP');
    $('sTotal').textContent=totalM.total.toLocaleString('ja-JP');
    $('sFirstRate').textContent=pct(totalM.first,totalM.total);
    $('sResponseRate').textContent=pct(totalM.total,orders);

    const by=new Map(staff.map(s=>[s.id,emptyAgg()]));
    (rows||[]).forEach(r=>{if(!by.has(r.staff_id))by.set(r.staff_id,emptyAgg());addReport(by.get(r.staff_id),r)});
    const tb=$('periodBody');tb.innerHTML='';
    for(const s of staff){
      const a=by.get(s.id)||emptyAgg(),m=calcMetrics(a);
      const has=Object.values(a).some(v=>typeof v==='number'&&v>0);
      if(!has&&!s.is_active&&s.retirement_date&&s.retirement_date<start)continue;
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><b>${esc(s.name)}</b><div class="muted">${esc(s.employee_code)}</div></td>
        <td>${m.phone}</td><td>${a.phone_first_resolution_count}</td><td>${m.mail}</td><td>${a.mail_first_resolution_count}</td>
        <td><b>${m.total}</b></td><td>${pct(m.first,m.total)}</td><td>${a.returns_exchange_count}</td><td>${a.store_service_count}</td>
        <td>${a.complaint_count}</td><td>${a.store_cancel_count}</td><td>${a.customer_cancel_count}</td>
        <td>${a.work_case_count}</td><td>${a.work_minutes}</td><td>${avg(a.work_minutes,a.work_case_count)}</td>`;
      tb.appendChild(tr);
    }
  }catch(e){setMessage('periodMessage','集計に失敗しました: '+e.message,'bad')}
}

function renderMaster(){
  const tb=$('masterBody');if(!tb)return;tb.innerHTML='';
  for(const s of staff){
    const [label,kind]=staffStatus(s),tr=document.createElement('tr');
    tr.innerHTML=`<td>${s.display_order??0}</td><td>${esc(s.employee_code)}</td><td><b>${esc(s.name)}</b></td><td>${esc(s.employment_type)}</td>
      <td><span class="badge ${kind}">${label}</span></td><td>${s.retirement_date?esc(s.retirement_date.replaceAll('-','/')):'—'}</td>
      <td><button class="editbtn" data-edit="${s.id}">編集</button></td>`;
    tb.appendChild(tr);
  }
  tb.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openStaff(b.dataset.edit));
}
function openStaff(id=null){
  editingStaffId=id;const s=id?staff.find(x=>x.id===id):null;
  $('staffDialogTitle').textContent=id?'CS従業員編集':'CS従業員追加';
  $('fCode').value=s?.employee_code||'';
  $('fName').value=s?.name||'';
  $('fType').value=s?.employment_type||'パート';
  $('fOrder').value=s?.display_order??((staff.length+1)*10);
  $('fRetirement').value=s?.retirement_date||'';
  $('fActive').checked=s?.is_active??true;
  $('fNotes').value=s?.notes||'';
  $('staffDialog').showModal();
}
async function saveStaff(e){
  e.preventDefault();
  const body={
    employee_code:$('fCode').value.trim(),name:$('fName').value.trim(),employment_type:$('fType').value,
    display_order:int($('fOrder').value),retirement_date:$('fRetirement').value||null,is_active:$('fActive').checked,
    notes:$('fNotes').value.trim(),updated_at:new Date().toISOString()
  };
  if(!body.employee_code||!body.name)return;
  try{
    if(editingStaffId){
      await rest('cs_staff',`owner_id=eq.${user.id}&id=eq.${editingStaffId}`,{method:'PATCH',body:JSON.stringify(body)});
    }else{
      body.owner_id=user.id;
      await rest('cs_staff','',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(body)});
    }
    $('staffDialog').close();setMessage('masterMessage','保存しました。','ok');await loadStaff();await loadDay();
  }catch(e){setMessage('masterMessage','保存に失敗しました: '+e.message,'bad')}
}

function activateTab(name){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  $('dailyTab').classList.toggle('hidden',name!=='daily');
  $('summaryTab').classList.toggle('hidden',name!=='summary');
  $('masterTab').classList.toggle('hidden',name!=='master');
  if(name==='summary')loadPeriod();
  if(name==='master')renderMaster();
}
async function bootstrap(){
  selectedDate=selectedDate||localDateISO();
  $('periodAnchor').value=$('periodAnchor').value||localDateISO();
  await loadStaff();await loadDay();
}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));
$('loginBtn').onclick=login;$('logoutBtn').onclick=logout;
$('prevDateBtn').onclick=()=>changeDay(-1);$('nextDateBtn').onclick=()=>changeDay(1);
$('reloadDailyBtn').onclick=loadDay;
$('orderCount').addEventListener('input',()=>scheduleSummarySave());
$('orderCount').addEventListener('blur',()=>scheduleSummarySave(true));
$('periodMode').onchange=loadPeriod;$('periodAnchor').onchange=loadPeriod;$('loadPeriodBtn').onclick=loadPeriod;
$('prevPeriodBtn').onclick=()=>shiftPeriod(-1);$('nextPeriodBtn').onclick=()=>shiftPeriod(1);
$('addStaffBtn').onclick=()=>openStaff();$('staffCancel').onclick=()=>$('staffDialog').close();$('staffForm').onsubmit=saveStaff;

(async()=>{
  selectedDate=localDateISO();$('periodAnchor').value=localDateISO();session=loadSession();
  if(session?.access_token){
    try{user=await req('/auth/v1/user');showApp();await bootstrap()}
    catch{saveSession(null);session=null;user=null;showApp()}
  }else showApp();
})();
