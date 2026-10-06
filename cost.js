const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='logistics_monthly_oplh_session_v1';
const $=id=>document.getElementById(id);
let session=null,user=null,currentBundle=null,prevBundle=null,yearBundle=null,fiscalCurrent=null,fiscalPrior=null,fiscalMeta=null,fiscalMonthlyBundles=[],refreshPromise=null,orderAutoSaveTimer=null,orderAutoSavePromise=null,orderDirty=false,orderSaveFailed=false;
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
 'その他受注処理':{key:'order_next',label:'その他受注処理'},
 '夕方受注処理':{key:'order_evening',label:'夕方受注処理'}
};
const TD_ACTIVITY_ORDER=['picking','pass_sort','total_picking','shipping_check','hand_pack','auto_pack','receiving','stock_move','order_am','order_z','order_pm','order_evening','order_next'];
const TD_ACTIVITY_LABELS=Object.fromEntries(Object.values(TD_ACTIVITY_MAP).map(x=>[x.key,x.label]));
let tdLastPreview=null;


function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function accessTokenNearExpiry(){const exp=Number(session?.expires_at||0);return !!(exp&&Date.now()>=(exp*1000-5*60*1000))}
async function refreshSession(){if(refreshPromise)return refreshPromise;if(!session?.refresh_token)return false;refreshPromise=(async()=>{try{const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});const d=await res.json().catch(()=>null);if(!res.ok||!d?.access_token)return false;saveSession(d);user=d.user||user;return true}catch{return false}finally{refreshPromise=null}})();return refreshPromise}
async function req(path,opt={}){const{skipRefresh=false,...fo}=opt;if(!skipRefresh&&session?.refresh_token&&(!session?.access_token||accessTokenNearExpiry())&&!path.includes('grant_type=')){await refreshSession()}const headers={apikey:SB_KEY,'Content-Type':'application/json',...(fo.headers||{})};if(session?.access_token)headers.Authorization='Bearer '+session.access_token;let res=await fetch(SB_URL+path,{...fo,headers});if(res.status===401&&!skipRefresh&&session?.refresh_token&&!path.includes('grant_type=')){if(await refreshSession())return req(path,{...fo,skipRefresh:true})}const txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||('HTTP '+res.status));return data}
async function rest(table,params='',opt={}){return req('/rest/v1/'+table+(params?'?'+params:''),opt)}
function localDateISO(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
function companyMonthToday(d=new Date()){let y=d.getFullYear(),m=d.getMonth()+1;if(d.getDate()>=21){m++;if(m===13){y++;m=1}}return y+'-'+String(m).padStart(2,'0')}
function monthRange(ym){const[y,m]=ym.split('-').map(Number),end=new Date(y,m-1,20),start=new Date(y,m-2,21);return[localDateISO(start),localDateISO(end)]}
function previousYm(ym){let[y,m]=ym.split('-').map(Number);m--;if(m===0){m=12;y--}return y+'-'+String(m).padStart(2,'0')}
function shiftYm(ym,delta){let[y,m]=ym.split('-').map(Number);m+=delta;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+String(m).padStart(2,'0')}
function priorYearYm(ym){const[y,m]=ym.split('-');return (Number(y)-1)+'-'+m}
function companyYmFromDate(iso){let[y,m,d]=String(iso||'').split('-').map(Number);if(!y||!m||!d)return null;if(d>=21){m++;if(m===13){m=1;y++}}return y+'-'+String(m).padStart(2,'0')}
function ymRange(startYm,endYm){const out=[];let x=startYm;while(x<=endYm){out.push(x);x=shiftYm(x,1);if(out.length>24)break}return out}
function fiscalStartYear(ym){const[y,m]=ym.split('-').map(Number);return m>=3?y:y-1}
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
 const [shipping,pt,td,imports,orderDaily]=await Promise.all([
  rest('logistics_shipping_monthly',`owner_id=eq.${user.id}&month_ym=eq.${ym}&select=*`).catch(()=>[]),
  rest('logistics_work_time',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&select=work_date,picking_minutes,total_picking_minutes,pass_sort_minutes,sorting_minutes,hand_pack_minutes,auto_pack_minutes,stock_move_minutes`).catch(()=>[]),
  rest('oplh_timedesigner_daily',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&select=activity_key,activity_label,work_minutes,event_count,worker_key,worker_name,employee_no,staff_id,source_department`).catch(()=>[]),
  rest('logistics_cost_import_batches',`owner_id=eq.${user.id}&month_ym=eq.${ym}&select=source,source_filename,source_rows,imported_at,metadata,period_start,period_end&order=imported_at.desc`).catch(()=>[]),
  rest('logistics_order_daily',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&select=work_date,order_count,label_955_achieved,note&order=work_date.asc`).catch(()=>[])
 ]);
 return{ym,monthly,shipping:shipping||[],pt:pt||[],td:td||[],imports:imports||[],orderDaily:orderDaily||[],start,end}
}
async function loadBundleRange(startYm,endYm){
 const months=ymRange(startYm,endYm),[startDate]=monthRange(startYm),[,endDate]=monthRange(endYm);
 const [monthlyRows,shippingRows,ptRows,tdRows,orderRows]=await Promise.all([
  rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=gte.${startYm}&month_ym=lte.${endYm}&select=*&order=month_ym.asc`).catch(()=>[]),
  rest('logistics_shipping_monthly',`owner_id=eq.${user.id}&month_ym=gte.${startYm}&month_ym=lte.${endYm}&select=*`).catch(()=>[]),
  rest('logistics_work_time',`owner_id=eq.${user.id}&work_date=gte.${startDate}&work_date=lte.${endDate}&select=work_date,picking_minutes,total_picking_minutes,pass_sort_minutes,sorting_minutes,hand_pack_minutes,auto_pack_minutes,stock_move_minutes`).catch(()=>[]),
  rest('oplh_timedesigner_daily',`owner_id=eq.${user.id}&work_date=gte.${startDate}&work_date=lte.${endDate}&select=work_date,activity_key,activity_label,work_minutes,event_count,worker_key,worker_name,employee_no,staff_id,source_department`).catch(()=>[]),
  rest('logistics_order_daily',`owner_id=eq.${user.id}&work_date=gte.${startDate}&work_date=lte.${endDate}&select=work_date,order_count,label_955_achieved,note`).catch(()=>[])
 ]);
 const monthlyMap=new Map((monthlyRows||[]).map(r=>[r.month_ym,r])),shipMap=new Map(),ptMap=new Map(),tdMap=new Map(),orderMap=new Map();
 const push=(map,key,row)=>{if(!key)return;const a=map.get(key)||[];a.push(row);map.set(key,a)};
 for(const r of shippingRows||[])push(shipMap,r.month_ym,r);
 for(const r of ptRows||[])push(ptMap,companyYmFromDate(r.work_date),r);
 for(const r of tdRows||[])push(tdMap,companyYmFromDate(r.work_date),r);
 for(const r of orderRows||[])push(orderMap,companyYmFromDate(r.work_date),r);
 return months.map(ym=>{const monthly=monthlyMap.get(ym)||null,[start,end]=monthly?[monthly.period_start,monthly.period_end]:monthRange(ym);return{ym,monthly,shipping:shipMap.get(ym)||[],pt:ptMap.get(ym)||[],td:tdMap.get(ym)||[],imports:[],orderDaily:orderMap.get(ym)||[],start,end}})
}
function aggregateFiscal(bundles){
 const bs=(bundles||[]).filter(b=>b?.monthly),ms=bs.map(metrics),monthCount=bs.length;
 const sumKnown=(field)=>{const vals=bs.map(b=>n(b.monthly?.[field])).filter(v=>v!=null);return{value:vals.length?vals.reduce((a,v)=>a+v,0):null,count:vals.length,complete:vals.length===monthCount}};
 const orders=sumKnown('orders'),complaints=sumKnown('complaint_count'),material=sumKnown('material_cost'),timee=sumKnown('timee_cost');
 const shipments=ms.reduce((a,x)=>a+(Number(x.shipments)||0),0),shipNet=ms.reduce((a,x)=>a+(Number(x.shipNet)||0),0);
 const receivingVals=bs.map(b=>n(b.monthly?.receiving_rate)).filter(v=>v!=null),receivingAvg=receivingVals.length?receivingVals.reduce((a,v)=>a+v,0)/receivingVals.length:null;
 const deadline=bs.map(orderDeadlineStats).reduce((a,x)=>({ok:a.ok+(x.ok||0),total:a.total+(x.total||0)}),{ok:0,total:0});
 const orderHours=ms.reduce((a,x)=>a+(Number(x.orderTotalHours)||0),0),orderHourlyRate=orders.value!=null&&orderHours>0?orders.value/orderHours:null;
 let oplhHours=0,oplhShipments=0,oplhMonths=0,shipmentMonths=0;
 ms.forEach(x=>{if(x.shipments>0)shipmentMonths++;if(x.shipments>0&&x.oplh>0){oplhHours+=x.shipments/x.oplh;oplhShipments+=x.shipments;oplhMonths++}});
 return{
  months:monthCount,orders:orders.value,ordersComplete:orders.complete,shipments,
  complaints:complaints.value,ppm:(complaints.complete&&shipments)?complaints.value/shipments*1000000:null,
  receivingAvg,receivingCount:receivingVals.length,shipNet,shipPer:shipments?shipNet/shipments:null,
  materialCost:material.value,materialComplete:material.complete,timeeCost:timee.value,timeeComplete:timee.complete,
  deadlineRate:deadline.total?deadline.ok/deadline.total:null,deadlineOk:deadline.ok,deadlineTotal:deadline.total,
  orderHourlyRate,oplh:(shipmentMonths>0&&oplhMonths===shipmentMonths&&oplhHours>0)?oplhShipments/oplhHours:null
 }
}
async function loadFiscalComparison(){
 const currentYm=companyMonthToday(),fy=fiscalStartYear(currentYm),startYm=fy+'-03',fiscalEnd=(fy+1)+'-02';
 const allCurrent=await loadBundleRange(startYm,fiscalEnd),candidate=allCurrent.filter(b=>b.ym<=currentYm);
 const consecutive=[];for(const b of candidate){if(b.monthly?.status==='confirmed')consecutive.push(b);else break}
 if(!consecutive.length)return{current:null,prior:null,monthly:allCurrent,meta:{fy,startYm,endYm:null,priorFy:fy-1,fiscalEnd}};
 const endYm=consecutive[consecutive.length-1].ym,priorStart=(fy-1)+'-03',priorEnd=shiftYm(endYm,-12),priorBundles=await loadBundleRange(priorStart,priorEnd);
 return{current:aggregateFiscal(consecutive),prior:aggregateFiscal(priorBundles),monthly:allCurrent,meta:{fy,startYm,endYm,priorFy:fy-1,priorStart,priorEnd,fiscalEnd}}
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
function periodDates(start,end){const out=[];let d=new Date(start+'T00:00:00'),e=new Date(end+'T00:00:00');while(d<=e){out.push(localDateISO(d));d.setDate(d.getDate()+1)}return out}
function orderDeadlineStats(b){const daily=(b?.orderDaily||[]).filter(r=>r.label_955_achieved===true||r.label_955_achieved===false);if(daily.length){const ok=daily.filter(r=>r.label_955_achieved===true).length,total=daily.length;return{ok,total,rate:total?ok/total:null,source:'daily'}}const m=b?.monthly||{},ok=Number(m.label_955_ok_days),total=Number(m.label_955_total_days);if(Number.isFinite(total)&&total>0)return{ok:Number.isFinite(ok)?ok:0,total,rate:(Number.isFinite(ok)?ok:0)/total,source:'legacy'};return{ok:0,total:0,rate:null,source:'none'}}
function setOrderSaveStatus(text,state=''){const el=$('orderAutoSaveStatus');if(!el)return;el.textContent=text;el.className=state==='ok'?'good':(state==='bad'?'bad':'muted')}
function scheduleOrderAutoSave(delay=1000){const m=currentBundle?.monthly||{};if(m.status==='confirmed')return;orderDirty=true;clearTimeout(orderAutoSaveTimer);setOrderSaveStatus('未保存');orderAutoSaveTimer=setTimeout(()=>saveOrderDaily(),delay)}
async function flushOrderAutoSave(){clearTimeout(orderAutoSaveTimer);if(orderDirty)return await saveOrderDaily();if(orderAutoSavePromise)return await orderAutoSavePromise;return true}
function renderOrderDaily(){const m=currentBundle?.monthly||{},locked=m.status==='confirmed',editor=$('orderDailyEditor');editor.classList.remove('hidden');const map=new Map((currentBundle.orderDaily||[]).map(r=>[r.work_date,r]));$('orderDailyBody').innerHTML=periodDates(currentBundle.start,currentBundle.end).map(date=>{const r=map.get(date),v=r?.label_955_achieved===true?'true':(r?.label_955_achieved===false?'false':''),orders=r?.order_count!=null?String(r.order_count):'';return `<tr><td>${date}</td><td><input class="order-count-input" data-date="${date}" type="number" min="0" step="1" inputmode="numeric" value="${orders}" placeholder="未入力" ${locked?'disabled':''}></td><td><select class="order-deadline-select" data-date="${date}" ${locked?'disabled':''}><option value="" ${v===''?'selected':''}>未入力</option><option value="true" ${v==='true'?'selected':''}>○ 達成</option><option value="false" ${v==='false'?'selected':''}>× 未達</option></select></td></tr>`}).join('');
 if(locked)return;
 document.querySelectorAll('.order-count-input').forEach(inp=>{inp.addEventListener('input',()=>scheduleOrderAutoSave(1000));inp.addEventListener('change',()=>scheduleOrderAutoSave(0))});
 document.querySelectorAll('.order-deadline-select').forEach(sel=>sel.addEventListener('change',()=>scheduleOrderAutoSave(0)));
 setOrderSaveStatus('自動保存');
}
async function saveOrderDaily(){if(orderAutoSavePromise){orderDirty=true;return orderAutoSavePromise}const m=currentBundle?.monthly||{};if(m.status==='confirmed')return true;const bundleYm=currentBundle.ym,bundleStart=currentBundle.start,bundleEnd=currentBundle.end,existing=new Map((currentBundle.orderDaily||[]).map(r=>[r.work_date,r])),selects=[...document.querySelectorAll('.order-deadline-select')],orderInputs=[...document.querySelectorAll('.order-count-input')],selectMap=new Map(selects.map(s=>[s.dataset.date,s])),orderMap=new Map(orderInputs.map(i=>[i.dataset.date,i]));clearTimeout(orderAutoSaveTimer);orderDirty=false;orderSaveFailed=false;setOrderSaveStatus('保存中…');$('orderDailyMessage').className='message';$('orderDailyMessage').textContent='';
 orderAutoSavePromise=(async()=>{try{const rows=[];for(const date of periodDates(bundleStart,bundleEnd)){const sel=selectMap.get(date),inp=orderMap.get(date),old=existing.get(date),status=sel?.value||'',raw=inp?.value?.trim()||'',orderCount=raw===''?null:Number(raw),achieved=status===''?null:status==='true';if(orderCount!=null&&(!Number.isFinite(orderCount)||orderCount<0||!Number.isInteger(orderCount)))throw new Error(date+' の受注件数は0以上の整数で入力してください。');if(old||orderCount!=null||achieved!=null)rows.push({owner_id:user.id,work_date:date,order_count:orderCount,label_955_achieved:achieved,note:old?.note||'受注課画面入力',updated_at:new Date().toISOString()})}
  if(rows.length)await rest('logistics_order_daily','on_conflict=owner_id%2Cwork_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rows)});
  const evaluated=selects.filter(s=>s.value==='true'||s.value==='false'),ok=evaluated.filter(s=>s.value==='true').length,total=evaluated.length,enteredOrders=orderInputs.filter(i=>i.value.trim()!==''),orderTotal=enteredOrders.reduce((a,i)=>a+Number(i.value||0),0),monthlyUpdate={orders:enteredOrders.length?orderTotal:null,label_955_ok_days:ok,label_955_total_days:total,updated_at:new Date().toISOString()};
  await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${bundleYm}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(monthlyUpdate)});
  if(currentBundle?.ym===bundleYm){currentBundle.orderDaily=rows;currentBundle.monthly={...(currentBundle.monthly||{}),...monthlyUpdate};const c=metrics(currentBundle),deadline=orderDeadlineStats(currentBundle),pm=prevBundle?.monthly||{},ym=yearBundle?.monthly||{};$('kOrders').textContent=monthlyUpdate.orders==null?'—':fmt(monthlyUpdate.orders,1);$('cOrders').innerHTML='前月 '+diff(monthlyUpdate.orders,n(pm.orders))+'<br>前年 '+diff(monthlyUpdate.orders,n(ym.orders));$('mOrders').value=monthlyUpdate.orders==null?'':monthlyUpdate.orders;$('orderDeadlineOk').textContent=deadline.total?deadline.ok+'日':'—';$('orderDeadlineTotal').textContent=deadline.total?deadline.total+'日':'—';$('orderDeadlineRate').textContent=deadline.rate!=null?pct(deadline.rate):'—';$('orderDeadlineRate').classList.toggle('good',deadline.rate!=null&&deadline.rate>=0.9);$('orderDeadlineRate').classList.toggle('bad',deadline.rate!=null&&deadline.rate<0.9);$('orderHourlyRate').textContent=c.orderHourlyRate!=null?fmt(c.orderHourlyRate,1):'—';renderComparison()}
  const now=new Date(),stamp=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');setOrderSaveStatus('保存済み '+stamp,'ok');return true
 }catch(e){console.error(e);orderDirty=true;orderSaveFailed=true;setOrderSaveStatus('保存エラー','bad');$('orderDailyMessage').className='message bad';$('orderDailyMessage').textContent=e.message;return false}})();
 try{return await orderAutoSavePromise}finally{orderAutoSavePromise=null;if(orderDirty&&!orderSaveFailed)scheduleOrderAutoSave(0)}
}

function orderMinutes(td){const t=tdTotals(td);const byLabel={};for(const r of td||[]){byLabel[r.activity_label]=(byLabel[r.activity_label]||0)+(Number(r.work_minutes)||0)}return{
 am:(t.order_am||byLabel['AM受注処理']||0),
 z:(t.order_z||byLabel['Z受注処理']||0),
 pm:(t.order_pm||byLabel['PM受注処理']||0),
 evening:(t.order_evening||byLabel['夕方受注処理']||0),
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
 const pickingKpiHours=(empPickMin+ptOrderPickMin+timeePick)/60;
 const pickingHourlyRate=shipments&&pickingKpiHours?shipments/pickingKpiHours:null;
 let oplh=shipments&&totalHours?shipments/totalHours:null;
 if(m.origin==='legacy_spreadsheet'&&m.oplh_legacy!=null)oplh=Number(m.oplh_legacy);
 const ord=orderMinutes(tdRows);
 const orderTotalMinutes=ord.am+ord.z+ord.pm+ord.evening+ord.next;
 const orderTotalHours=orderTotalMinutes/60;
 const orderHourlyRate=(m.orders!=null&&orderTotalHours>0)?Number(m.orders)/orderTotalHours:null;
 return{shipments,shipNet,shipPer,ppm,pickHours,packHours,totalHours,oplh,pickingKpiHours,pickingHourlyRate,td,ord,orderTotalHours,orderHourlyRate,
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
function normalizeAutoLine(v){const s=String(v||'').normalize('NFKC').trim();if(/Auto0?1/i.test(s))return'Auto01';if(/Auto0?2/i.test(s))return'Auto02';if(/Hand0?1/i.test(s))return'Hand01';return null}
function parseAutoDateTime(v){
 const s=String(v||'').normalize('NFKC').trim();
 const m=s.match(/(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})[ T　]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
 if(!m)return null;
 const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),Number(m[4]),Number(m[5]),Number(m[6]||0),0);
 return Number.isNaN(d.getTime())?null:d
}
function parseAutoDate(v){const s=String(v||'').normalize('NFKC').trim(),m=s.match(/(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);return m?{y:Number(m[1]),m:Number(m[2]),d:Number(m[3])}:null}
function parseAutoTime(v){const s=String(v||'').normalize('NFKC').trim(),m=s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);return m?{h:Number(m[1]),m:Number(m[2]),s:Number(m[3]||0)}:null}
function autoIsoDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function autoTimeText(d){return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')+':'+String(d.getSeconds()).padStart(2,'0')}
function autoLineSummary(daily){
 const count=(daily||[]).reduce((a,x)=>a+x.count,0),activeSeconds=(daily||[]).reduce((a,x)=>a+x.active_seconds,0);
 return{count,active_seconds:activeSeconds,active_hours:activeSeconds/3600,lap_seconds:count&&activeSeconds?activeSeconds/count:null,hourly_rate:activeSeconds?count/(activeSeconds/3600):null}
}
async function parseAutoPackingFile(file){
 const text=await readShiftJisCsv(file),lines=text.replace(/\r/g,'').split('\n').filter(x=>x.trim());
 if(lines.length<2)throw new Error('自動梱包機CSVにデータがありません。');
 const head=csvLine(lines[0]).map(normalizeHeader);
 const findHead=(tests)=>head.findIndex(h=>tests.some(re=>re.test(h)));
 const lineIx=findHead([/作業.*ライン/i,/ライン名/i,/^ライン$/i]);
 const dtIx=findHead([/スキャン.*日時/i,/作業.*日時/i,/作業開始日時/i,/日時/i]);
 const dateIx=findHead([/^作業日$/i,/^日付$/i,/作業.*日/i]);
 const timeIx=findHead([/^時刻$/i,/スキャン.*時刻/i,/作業.*時刻/i]);
 const [periodStart,periodEnd]=monthRange(currentBundle.ym),events=new Map();
 let sourceRows=0,recognizedRows=0,outsideRows=0,unparsedRows=0;
 for(let i=1;i<lines.length;i++){
  const r=csvLine(lines[i]);sourceRows++;
  let line=lineIx>=0?normalizeAutoLine(r[lineIx]):null;
  if(!line){for(const v of r){line=normalizeAutoLine(v);if(line)break}}
  if(!line){unparsedRows++;continue}
  let dt=dtIx>=0?parseAutoDateTime(r[dtIx]):null;
  if(!dt){for(const v of r){dt=parseAutoDateTime(v);if(dt)break}}
  if(!dt){
   let date=dateIx>=0?parseAutoDate(r[dateIx]):null,time=timeIx>=0?parseAutoTime(r[timeIx]):null;
   if(!date){for(const v of r){date=parseAutoDate(v);if(date)break}}
   if(!time){for(const v of r){time=parseAutoTime(v);if(time)break}}
   if(date&&time)dt=new Date(date.y,date.m-1,date.d,time.h,time.m,time.s,0)
  }
  if(!dt||Number.isNaN(dt.getTime())){unparsedRows++;continue}
  const date=autoIsoDate(dt);if(date<periodStart||date>periodEnd){outsideRows++;continue}
  recognizedRows++;const key=line+'|'+date,a=events.get(key)||[];a.push(dt);events.set(key,a)
 }
 if(!recognizedRows)throw new Error(periodStart+'～'+periodEnd+' にAuto01／Auto02／Hand01のスキャンデータを確認できませんでした。');
 const daily=[];
 for(const [key,arr] of events){
  const [line,date]=key.split('|');arr.sort((a,b)=>a-b);let activeSeconds=0;
  for(let i=1;i<arr.length;i++){const gap=(arr[i]-arr[i-1])/1000;if(gap>=0&&gap<900)activeSeconds+=gap}
  daily.push({line,date,start_time:autoTimeText(arr[0]),end_time:autoTimeText(arr[arr.length-1]),count:arr.length,active_seconds:Number(activeSeconds.toFixed(3)),active_minutes:Number((activeSeconds/60).toFixed(2)),lap_seconds:arr.length&&activeSeconds?Number((activeSeconds/arr.length).toFixed(4)):null})
 }
 daily.sort((a,b)=>a.date.localeCompare(b.date)||a.line.localeCompare(b.line));
 const summary={};for(const line of ['Auto01','Auto02','Hand01'])summary[line]=autoLineSummary(daily.filter(x=>x.line===line));
 if(!summary.Auto01.count&&!summary.Auto02.count)throw new Error('Auto01／Auto02の対象データがありません。');
 return{fileName:file.name,periodStart,periodEnd,sourceRows,recognizedRows,outsideRows,unparsedRows,daily,summary,detected:{headers:head,line_column:lineIx>=0?head[lineIx]:null,datetime_column:dtIx>=0?head[dtIx]:null,date_column:dateIx>=0?head[dateIx]:null,time_column:timeIx>=0?head[timeIx]:null}}
}
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
async function replaceCostImportBatch(source,payload){
 await rest('logistics_cost_import_batches',`owner_id=eq.${user.id}&month_ym=eq.${currentBundle.ym}&source=eq.${source}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
 await rest('logistics_cost_import_batches','',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
}
async function importTimeDesigner(){
 const m=currentBundle?.monthly||{};if(m.status==='confirmed'){alert('確定済み月には取り込めません。ロック解除後に再度お試しください。');return}
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
  await rest('oplh_import_batches',`owner_id=eq.${user.id}&source=eq.timedesigner&period_start=eq.${parsed.periodStart}&period_end=eq.${parsed.periodEnd}&id=neq.${batchId}`,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  await replaceCostImportBatch('timedesigner',{owner_id:user.id,month_ym:currentBundle.ym,source:'timedesigner',source_filename:parsed.fileName,source_rows:parsed.mappedSourceRows,period_start:parsed.periodStart,period_end:parsed.periodEnd,metadata:{aggregate_rows:rows.length,period_rows:parsed.periodRows,outside_rows:parsed.outsideRows,unmapped_tasks:parsed.unmapped,unmatched_staff:parsed.unmatchedStaff,replace_rule:'対象期間を置換。同一ファイル・同一期間の再取込は二重計上しない'}});
  $('tdImportMessage').className='message ok';$('tdImportMessage').textContent=`取込完了：${parsed.mappedSourceRows.toLocaleString()}行 → ${rows.length.toLocaleString()}集計行`;
  await loadAll()
 }catch(e){console.error(e);$('tdImportMessage').className='message bad';$('tdImportMessage').textContent=e.message}
 finally{btn.disabled=false}
}
async function importAutoPacking(){
 const m=currentBundle?.monthly||{};if(m.status==='confirmed'){alert('確定済み月には取り込めません。ロック解除後に再度お試しください。');return}
 const file=$('autoPackImportFile').files?.[0];if(!file){$('autoPackImportMessage').className='message bad';$('autoPackImportMessage').textContent='自動梱包機CSVを選択してください。';return}
 const btn=$('autoPackImportBtn');btn.disabled=true;$('autoPackImportMessage').className='message';$('autoPackImportMessage').textContent='CSVを集計しています…';
 try{
  const parsed=await parseAutoPackingFile(file),existing=(currentBundle.imports||[]).find(x=>x.source==='auto_packing');
  if(existing&&!confirm(currentBundle.ym+'月度には自動梱包機データが既にあります。\n新しいCSVで置き換えますか？'))return;
  const a1=parsed.summary.Auto01,a2=parsed.summary.Auto02,body={auto1_lap_seconds:a1.lap_seconds,auto1_count:a1.count,auto2_lap_seconds:a2.lap_seconds,auto2_count:a2.count,updated_at:new Date().toISOString()};
  await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${currentBundle.ym}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
  await replaceCostImportBatch('auto_packing',{owner_id:user.id,month_ym:currentBundle.ym,source:'auto_packing',source_filename:parsed.fileName,source_rows:parsed.recognizedRows,period_start:parsed.periodStart,period_end:parsed.periodEnd,metadata:{idle_threshold_minutes:15,rule:'同一日・同一ラインで時刻順に並べ、前回スキャンから15分以上空いた区間を休止として除外',summary:parsed.summary,daily:parsed.daily,detected:parsed.detected,outside_rows:parsed.outsideRows,unparsed_rows:parsed.unparsedRows,replace_rule:'同月度の自動梱包機データを置換。同一ファイル再取込は二重計上しない'}});
  $('autoPackImportMessage').className='message ok';$('autoPackImportMessage').textContent='取込完了：Auto01 '+fmt(a1.count)+'件 / '+hours(a1.active_hours)+'、Auto02 '+fmt(a2.count)+'件 / '+hours(a2.active_hours);
  await loadAll()
 }catch(e){console.error(e);$('autoPackImportMessage').className='message bad';$('autoPackImportMessage').textContent=e.message}
 finally{btn.disabled=false}
}
function renderTDImport(){
 const m=currentBundle?.monthly||{},locked=m.status==='confirmed';
 $('tdImportBtn').disabled=locked;$('tdImportFile').disabled=locked;$('tdLockedNotice').classList.toggle('hidden',!locked);
 $('tdLockedNotice').textContent=locked?'確定済み月のTimeDesignerデータは変更できません。ロック解除後に修正できます。':'';
 $('autoPackImportBtn').disabled=locked;$('autoPackImportFile').disabled=locked;$('autoPackLockedNotice').classList.toggle('hidden',!locked);
 $('autoPackLockedNotice').textContent=locked?'確定済み月の自動梱包機データは変更できません。ロック解除後に修正できます。':'';
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
 ].join('');
 const autoImport=(currentBundle.imports||[]).find(x=>x.source==='auto_packing'),am=autoImport?.metadata||{},sumAuto={...(am.summary||{})};
 if(!sumAuto.Auto01&&(m.auto1_count!=null||m.auto1_lap_seconds!=null)){const count=Number(m.auto1_count)||0,lap=Number(m.auto1_lap_seconds)||null;sumAuto.Auto01={count,lap_seconds:lap,active_hours:count&&lap?count*lap/3600:null,hourly_rate:lap?3600/lap:null}}
 if(!sumAuto.Auto02&&(m.auto2_count!=null||m.auto2_lap_seconds!=null)){const count=Number(m.auto2_count)||0,lap=Number(m.auto2_lap_seconds)||null;sumAuto.Auto02={count,lap_seconds:lap,active_hours:count&&lap?count*lap/3600:null,hourly_rate:lap?3600/lap:null}}
 const autoRows=['Auto01','Auto02','Hand01'].map(line=>{const x=sumAuto[line]||{};return `<tr><td>${line}</td><td>${x.count!=null?fmt(x.count):'—'}</td><td>${x.active_hours!=null?hours(x.active_hours):'—'}</td><td>${x.lap_seconds!=null?fmt(x.lap_seconds,2)+'秒':'—'}</td><td>${x.hourly_rate!=null?fmt(x.hourly_rate,1)+'件/h':'—'}</td></tr>`}).join('');
 $('autoPackImportBody').innerHTML=autoRows;
 const hasLegacyAuto=!autoImport&&(m.auto1_count!=null||m.auto2_count!=null);
 $('autoPackImportSummary').innerHTML=[
   `<div class="source-row"><div><strong>最新ファイル</strong><small>${autoImport?.source_filename?esc(autoImport.source_filename):(hasLegacyAuto?'旧スプレッド移行値':'—')}</small></div><span class="badge ${autoImport||hasLegacyAuto?'auto':'missing'}">${autoImport?'取込済':(hasLegacyAuto?'移行済':'未取込')}</span></div>`,
   `<div class="source-row"><div><strong>集計ルール</strong><small>15分以上の空白を休止として除外</small></div><span class="badge auto">固定</span></div>`,
   `<div class="source-row"><div><strong>対象外・未解析</strong><small>月度外 ${fmt(am.outside_rows||0)}行 / 未解析 ${fmt(am.unparsed_rows||0)}行</small></div><span class="badge ${(am.unparsed_rows||0)?'missing':'auto'}">${fmt(am.unparsed_rows||0)}行</span></div>`
 ].join('')
}

async function loadAll(){const ym=$('monthPick').value||companyMonthToday();$('monthPick').value=ym;const[start,end]=monthRange(ym);$('monthRange').textContent=`${start} ～ ${end}（21日～翌20日）`;try{
 const [cb,pb,yb,fy]=await Promise.all([loadBundle(ym,{create:true}),loadBundle(previousYm(ym)),loadBundle(priorYearYm(ym)),loadFiscalComparison()]);
 currentBundle=cb;prevBundle=pb;yearBundle=yb;fiscalCurrent=fy.current;fiscalPrior=fy.prior;fiscalMeta=fy.meta;fiscalMonthlyBundles=fy.monthly||[];
 clearTimeout(orderAutoSaveTimer);orderDirty=false;renderAll()
 }catch(e){console.error(e);alert('読み込みに失敗しました: '+e.message)}
}
function renderAll(){renderStatus();renderDashboard();renderMonthly();renderShipping();renderTDImport();renderWork();renderComparison()}
function renderStatus(){const m=currentBundle.monthly||{},locked=m.status==='confirmed';$('statusBadge').textContent=locked?'確定済':'運用中';$('statusBadge').className='badge '+(locked?'confirmed':'open');$('confirmBtn').disabled=locked;$('unlockBtn').classList.toggle('hidden',!locked)}
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
 const ord=c.ord;$('orderAm').textContent=hours(ord.am/60);$('orderZ').textContent=hours(ord.z/60);$('orderPm').textContent=hours(ord.pm/60);$('orderEvening').textContent=hours(ord.evening/60);$('orderNext').textContent=hours(ord.next/60);$('orderTotalHours').textContent=hours(c.orderTotalHours);$('orderHourlyRate').textContent=c.orderHourlyRate!=null?fmt(c.orderHourlyRate,1):'—';
 const deadline=orderDeadlineStats(currentBundle);$('orderDeadlineOk').textContent=deadline.total?deadline.ok+'日':'—';$('orderDeadlineTotal').textContent=deadline.total?deadline.total+'日':'—';$('orderDeadlineRate').textContent=deadline.rate!=null?pct(deadline.rate):'—';$('orderDeadlineRate').classList.toggle('good',deadline.rate!=null&&deadline.rate>=0.9);$('orderDeadlineRate').classList.toggle('bad',deadline.rate!=null&&deadline.rate<0.9);$('orderDeadlineLegacyNote').textContent=deadline.source==='legacy'?'旧受注処理作業管理表の○を達成日として月度集計しています。':'○＝達成、×＝未達。未入力日は分母に含めません。';renderOrderDaily();
 const mth=currentBundle.monthly||{},ship=currentBundle.shipping||[],imports=currentBundle.imports||[];
 const ptSpan=dateSpan(currentBundle.pt),tdSpan=dateSpan(currentBundle.td),tdImport=imports.find(x=>x.source==='timedesigner');
 const tdPeriod=tdImport?.period_start&&tdImport?.period_end
   ? mdLabel(tdImport.period_start)+'〜'+mdLabel(tdImport.period_end)
   : mdLabel(tdSpan.min)+'〜'+mdLabel(tdSpan.max);
 const status=[
  ['月次手入力',mth.orders!=null&&mth.complaint_count!=null&&mth.receiving_rate!=null&&mth.material_cost!=null,'受注・品質・資材'],
  ['TimeDesigner',currentBundle.td.length>0,currentBundle.td.length?`社員作業時間＋受注処理（${tdPeriod}）`:'社員作業時間＋受注処理：未取込'],
  ['自動梱包機',imports.some(x=>x.source==='auto_packing')||mth.auto1_count!=null||mth.auto2_count!=null,imports.some(x=>x.source==='auto_packing')?'Auto01・Auto02月次CSV集計済':((mth.auto1_count!=null||mth.auto2_count!=null)?'過去移行値あり':'月次CSV未取込')],
  ['物流PT',currentBundle.pt.length>0,currentBundle.pt.length?`物流PT作業時間管理（${mdLabel(ptSpan.min)}〜${mdLabel(ptSpan.max)}・${currentBundle.pt.length}件）`:'物流PT作業時間管理：未入力'],
  ['発送費',ship.filter(x=>['yamato','sagawa','japanpost'].includes(x.carrier)&&x.adopted_count!=null&&x.net_cost!=null).length===3,'ヤマト・佐川・日本郵便']
 ];
 $('sourceStatus').innerHTML=status.map(x=>`<div class="source-row"><div><strong>${x[0]}</strong><small>${x[2]}</small></div><span class="badge ${x[1]?'auto':'missing'}">${x[1]?'取得済':'未完了'}</span></div>`).join('')
}
function setInput(id,v,percent=false){$(id).value=v==null?'':(percent?Number(v)*100:v)}
function renderMonthly(){const m=currentBundle.monthly||{},locked=m.status==='confirmed';
 setInput('mOrders',m.orders);setInput('mComplaints',m.complaint_count);setInput('mReceiving',m.receiving_rate,true);setInput('mShippingWork',m.shipping_work_count);setInput('mPickComplaints',m.picking_complaint_count);setInput('mMaterialCost',m.material_cost);setInput('mSilverCost',m.silver_cost);setInput('mTimeeCost',m.timee_cost);setInput('mTimeePick',m.timee_picking_hours);setInput('mTimeePack',m.timee_packing_hours);
 ['mOrders','mComplaints','mReceiving','mShippingWork','mPickComplaints','mMaterialCost','mSilverCost','mTimeeCost','mTimeePick','mTimeePack'].forEach(id=>$(id).disabled=locked);
 $('saveMonthlyBtn').disabled=locked;$('legacyNotice').classList.toggle('hidden',m.origin!=='legacy_spreadsheet');$('legacyNotice').textContent=m.origin==='legacy_spreadsheet'?(locked?'旧スプレッドシートから移行した値です。修正する場合は上部の「ロック解除」を押してください。':'旧スプレッドシート由来の月度をロック解除中です。修正後は「月度確定」で再ロックしてください。'):''
}
function inputNum(id,divide=1){const v=$(id).value.trim();return v===''?null:Number(v)/divide}
async function saveMonthly(){const m=currentBundle.monthly;if(m.status==='confirmed')return;const body={owner_id:user.id,month_ym:currentBundle.ym,period_start:currentBundle.start,period_end:currentBundle.end,status:'open',origin:m.origin||'app',orders:inputNum('mOrders'),complaint_count:inputNum('mComplaints'),receiving_rate:inputNum('mReceiving',100),shipping_work_count:inputNum('mShippingWork'),picking_complaint_count:inputNum('mPickComplaints'),material_cost:inputNum('mMaterialCost'),silver_cost:inputNum('mSilverCost'),timee_cost:inputNum('mTimeeCost'),timee_picking_hours:inputNum('mTimeePick'),timee_packing_hours:inputNum('mTimeePack'),updated_at:new Date().toISOString()};
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
 const m=currentBundle?.monthly||{};if(m.status==='confirmed'){alert('確定済み月には取り込めません。ロック解除後に再度お試しください。');return}
 const file=$('sagawaImportFile').files?.[0];if(!file){$('sagawaImportMessage').className='message bad';$('sagawaImportMessage').textContent='佐川CSVを選択してください。';return}
 const btn=$('sagawaImportBtn');btn.disabled=true;$('sagawaImportMessage').className='message';$('sagawaImportMessage').textContent='佐川CSVを集計しています…';
 try{
  const x=await parseSagawaFile(file),old=currentBundle.shipping.find(r=>r.carrier==='sagawa');
  const adoptedCount=(old?.metadata?.adopted_count_source==='wms'||old?.metadata?.adopted_count_source==='manual')?Number(old.adopted_count):x.invoiceCount;
  const metadata={source_rows:x.sourceRows,excluded_maruoka:x.excludedCount,adopted_count_source:(adoptedCount===x.invoiceCount?'invoice_rows':old.metadata.adopted_count_source),rule:'着店=丸岡 かつ 集荷店≠丸岡を除外'};
  const body={owner_id:user.id,month_ym:currentBundle.ym,carrier:'sagawa',adopted_count:adoptedCount,invoice_count:x.invoiceCount,gross_cost:x.grossCost,net_cost:x.netCost,source_kind:'invoice_file',source_filename:x.fileName,imported_at:new Date().toISOString(),metadata,updated_at:new Date().toISOString()};
  await rest('logistics_shipping_monthly','on_conflict=owner_id%2Cmonth_ym%2Ccarrier',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
  await replaceCostImportBatch('sagawa',{owner_id:user.id,month_ym:currentBundle.ym,source:'sagawa',source_filename:x.fileName,source_rows:x.sourceRows,period_start:currentBundle.start,period_end:currentBundle.end,metadata:{...metadata,replace_rule:'同月度の佐川データを置換。同一ファイル再取込は二重計上しない'}});
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
function summarizeJapanPostRows(rows){
 let prepaidCount=0,codCount=0,grossCost=0,codCost=0;
 for(const x of rows||[]){prepaidCount+=Number(x.prepaidCount)||0;codCount+=Number(x.codCount)||0;grossCost+=Number(x.prepaidCost)||0;codCost+=Number(x.codCost)||0}
 return{adoptedCount:prepaidCount+codCount,invoiceCount:prepaidCount+codCount,prepaidCount,codCount,grossCost,netCost:grossCost/1.1,codCost,days:(rows||[]).length,dailyRows:rows||[]}
}
function parseJapanPostTexts(texts,start,end){
 const byDate=new Map();
 const re=/(\d{4})\/\s*(\d{1,2})\/\s*(\d{1,2})\s+([\d,]+)\s+([\d,]+)\s+(\d{4})\/\s*(\d{1,2})\/\s*(\d{1,2})\s+([\d,]+)\s+([\d,]+)/g;
 for(const text of texts){for(const m of text.matchAll(re)){const date=isoDate(m[1],m[2],m[3]);if(date<start||date>end)continue;byDate.set(date,{date,prepaidCount:Number(m[4].replace(/,/g,''))||0,prepaidCost:Number(m[5].replace(/,/g,''))||0,codCount:Number(m[9].replace(/,/g,''))||0,codCost:Number(m[10].replace(/,/g,''))||0})}}
 const dailyRows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
 const x=summarizeJapanPostRows(dailyRows);
 if(!x.days||!x.adoptedCount)throw new Error(start+'～'+end+' の日本郵便日別明細を読み取れませんでした。');
 return x
}
async function saveShippingImport(carrier,fileNames,x,metadata){
 const body={owner_id:user.id,month_ym:currentBundle.ym,carrier,adopted_count:x.adoptedCount,invoice_count:x.invoiceCount,gross_cost:x.grossCost,net_cost:x.netCost,source_kind:'invoice_file',source_filename:fileNames,imported_at:new Date().toISOString(),metadata,updated_at:new Date().toISOString()};
 await rest('logistics_shipping_monthly','on_conflict=owner_id%2Cmonth_ym%2Ccarrier',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});
 await replaceCostImportBatch(carrier,{owner_id:user.id,month_ym:currentBundle.ym,source:carrier,source_filename:fileNames,source_rows:x.invoiceCount||0,period_start:currentBundle.start,period_end:currentBundle.end,metadata:{...metadata,replace_rule:carrier==='japanpost'?'日付単位で置換・追加。同日再取込は二重計上しない':'同月度の同一配送会社データを置換。同一ファイル再取込は二重計上しない'}})
}
async function importYamato(){
 const m=currentBundle?.monthly||{};if(m.status==='confirmed')return;
 const file=$('yamatoImportFile').files?.[0];if(!file){$('pdfImportMessage').className='message bad';$('pdfImportMessage').textContent='ヤマトPDFを選択してください。';return}
 const btn=$('yamatoImportBtn');btn.disabled=true;$('pdfImportMessage').className='message';$('pdfImportMessage').textContent='ヤマトPDFを解析しています…';
 try{const text=await extractPdfText(file),x=parseYamatoText(text),metadata={rule:'ネコポス明細個数を採用件数。請求書合計(税込)の税込・税抜総額を発送費',non_neko_count:x.otherCount};
  await saveShippingImport('yamato',file.name,x,metadata);$('pdfImportMessage').className='message ok';$('pdfImportMessage').textContent=`ヤマト取込完了：ネコポス ${fmt(x.adoptedCount)}件 / 税抜 ${yen(x.netCost)}`;await loadAll()
 }catch(e){console.error(e);$('pdfImportMessage').className='message bad';$('pdfImportMessage').textContent=e.message}finally{btn.disabled=false}
}
async function importJapanPost(){
 const m=currentBundle?.monthly||{};if(m.status==='confirmed')return;
 const files=[...($('japanPostImportFile').files||[])];if(!files.length){$('pdfImportMessage').className='message bad';$('pdfImportMessage').textContent='日本郵便PDFを選択してください。';return}
 const btn=$('japanPostImportBtn');btn.disabled=true;$('pdfImportMessage').className='message';$('pdfImportMessage').textContent='日本郵便PDFを解析しています…';
 try{
  const texts=[];for(const f of files){$('pdfImportMessage').textContent='日本郵便PDFを解析中：'+f.name;texts.push(await extractPdfText(f))}
  const incoming=parseJapanPostTexts(texts,currentBundle.start,currentBundle.end),existing=currentBundle.shipping.find(r=>r.carrier==='japanpost'),oldMeta=existing?.metadata||{},oldRows=Array.isArray(oldMeta.daily_rows)?oldMeta.daily_rows:[];
  const merged=new Map(oldRows.filter(r=>r?.date&&r.date>=currentBundle.start&&r.date<=currentBundle.end).map(r=>[r.date,r]));
  for(const r of incoming.dailyRows)merged.set(r.date,r);
  const mergedRows=[...merged.values()].sort((a,b)=>a.date.localeCompare(b.date)),x=summarizeJapanPostRows(mergedRows);
  const oldFiles=Array.isArray(oldMeta.source_files)?oldMeta.source_files:(existing?.source_filename?[existing.source_filename]:[]),sourceFiles=[...new Set([...oldFiles,...files.map(f=>f.name)])];
  const metadata={rule:'21日～翌20日。採用件数=元払+着払個数、発送費=元払金額のみ（着払金額除外）。日付単位で追加入力し、同日再取込は置換',prepaid_count:x.prepaidCount,cod_count:x.codCount,cod_cost_excluded:x.codCost,days:x.days,daily_rows:x.dailyRows,source_files:sourceFiles};
  await saveShippingImport('japanpost',sourceFiles.join(' / '),x,metadata);
  $('pdfImportMessage').className='message ok';$('pdfImportMessage').textContent=`日本郵便取込完了：今回${incoming.days}日分を反映 → 月度累計 ${x.days}日 / ${fmt(x.adoptedCount)}件 / 元払税込 ${yen(x.grossCost)}`;
  await loadAll()
 }catch(e){console.error(e);$('pdfImportMessage').className='message bad';$('pdfImportMessage').textContent=e.message}finally{btn.disabled=false}
}


function renderShipping(){const c=metrics(currentBundle),rows=['yamato','sagawa','japanpost'].map(car=>currentBundle.shipping.find(x=>x.carrier===car)||{carrier:car});const labels={yamato:'ヤマト運輸',sagawa:'佐川急便',japanpost:'日本郵便'};$('shippingBody').innerHTML=rows.map(r=>{const count=n(r.adopted_count),net=n(r.net_cost),gross=n(r.gross_cost),unit=count&&net?net/count:null;return `<tr><td>${labels[r.carrier]}</td><td>${fmt(count)}</td><td>${fmt(n(r.invoice_count))}</td><td>${yen(gross)}</td><td>${yen(net)}</td><td>${yen(unit,2)}</td><td>${c.shipments&&count?pct(count/c.shipments):'—'}</td><td>${r.source_kind==='legacy_spreadsheet'?'旧スプレッド':(r.source_filename?esc(r.source_filename):'—')}</td></tr>`}).join('');$('shipNetTotal').textContent=yen(c.shipNet);$('shipUnitTotal').textContent=yen(c.shipPer,2);
 const m=currentBundle.monthly||{},locked=m.status==='confirmed';$('sagawaImportBtn').disabled=locked;$('sagawaImportFile').disabled=locked;$('sagawaLockedNotice').classList.toggle('hidden',!locked);$('sagawaLockedNotice').textContent=locked?'確定済み月の発送費は変更できません。ロック解除後に修正できます。':'';
 const sagawa=currentBundle.shipping.find(r=>r.carrier==='sagawa'),meta=sagawa?.metadata||{};$('sagawaImportSummary').innerHTML=sagawa?`<div class="source-row"><div><strong>現在の佐川データ</strong><small>${esc(sagawa.source_filename||'—')}</small></div><span class="badge auto">取込済</span></div><div class="source-row"><div><strong>請求明細 / 丸岡除外</strong><small>${fmt(sagawa.invoice_count)}件 / ${fmt(meta.excluded_maruoka||0)}件除外</small></div><span class="badge">税抜 ${yen(sagawa.net_cost)}</span></div>`:'<div class="source-row"><div><strong>現在の佐川データ</strong><small>未取込</small></div><span class="badge missing">未取込</span></div>';
 ['yamatoImportBtn','japanPostImportBtn','yamatoImportFile','japanPostImportFile'].forEach(id=>$(id).disabled=locked);
 const ya=currentBundle.shipping.find(r=>r.carrier==='yamato'),jpRow=currentBundle.shipping.find(r=>r.carrier==='japanpost'),yam=ya?.metadata||{},jpm=jpRow?.metadata||{};
 $('pdfImportSummary').innerHTML=[
  ya?`<div class="source-row"><div><strong>ヤマト</strong><small>${esc(ya.source_filename||'—')} / 請求${fmt(ya.invoice_count)}件・ネコポス${fmt(ya.adopted_count)}件</small></div><span class="badge auto">税抜 ${yen(ya.net_cost)}</span></div>`:'<div class="source-row"><div><strong>ヤマト</strong><small>未取込</small></div><span class="badge missing">未取込</span></div>',
  jpRow?`<div class="source-row"><div><strong>日本郵便</strong><small>${esc(jpRow.source_filename||'—')} / 着払${fmt(jpm.cod_count||0)}件（着払金額は除外）</small></div><span class="badge auto">税抜 ${yen(jpRow.net_cost)}</span></div>`:'<div class="source-row"><div><strong>日本郵便</strong><small>未取込</small></div><span class="badge missing">未取込</span></div>'
 ].join('');
 renderShippingFiscalMonthly()
}
function renderShippingFiscalMonthly(){
 const fy=fiscalMeta?.fy||fiscalStartYear(companyMonthToday()),rows=fiscalMonthlyBundles||[];
 $('shippingFiscalMonthlyNote').textContent=fy+'年度（'+fy+'年3月度～'+(fy+1)+'年2月度）';
 $('shippingFiscalMonthlyBody').innerHTML=rows.map(b=>{
  const m=b.monthly||{},exists=!!b.monthly,status=!exists?'未入力':(m.status==='confirmed'?'確定済':'運用中'),badgeClass=!exists?'missing':(m.status==='confirmed'?'confirmed':'open');
  const byCarrier=Object.fromEntries(['yamato','sagawa','japanpost'].map(car=>[car,(b.shipping||[]).find(x=>x.carrier===car)||null]));
  const cell=(r,type)=>{
   if(!r)return '—';
   const count=n(r.adopted_count),net=n(r.net_cost),unit=count&&net!=null?net/count:null;
   if(type==='count')return count!=null?fmt(count):'—';
   if(type==='net')return net!=null?yen(net):'—';
   return unit!=null?yen(unit,2):'—'
  };
  const totalCount=(b.shipping||[]).reduce((a,r)=>a+(Number(r.adopted_count)||0),0);
  const totalNet=(b.shipping||[]).reduce((a,r)=>a+(Number(r.net_cost)||0),0);
  const totalUnit=totalCount?totalNet/totalCount:null,monthNum=Number(b.ym.split('-')[1]);
  return `<tr>
   <td><b>${monthNum}月度</b></td>
   <td><span class="badge ${badgeClass}">${status}</span></td>
   <td>${cell(byCarrier.yamato,'count')}</td><td>${cell(byCarrier.yamato,'net')}</td><td>${cell(byCarrier.yamato,'unit')}</td>
   <td>${cell(byCarrier.sagawa,'count')}</td><td>${cell(byCarrier.sagawa,'net')}</td><td>${cell(byCarrier.sagawa,'unit')}</td>
   <td>${cell(byCarrier.japanpost,'count')}</td><td>${cell(byCarrier.japanpost,'net')}</td><td>${cell(byCarrier.japanpost,'unit')}</td>
   <td>${totalCount?fmt(totalCount):'—'}</td><td>${totalNet?yen(totalNet):'—'}</td><td>${totalUnit!=null?yen(totalUnit,2):'—'}</td>
  </tr>`
 }).join('')
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

 const legacy=m.origin==='legacy_spreadsheet',hasTdDept=(currentBundle.td||[]).some(r=>r.source_department);
 const hp=hasTdDept?c.help.pickHours:(legacy?(Number(m.help_picking_hours)||0):c.help.pickHours),
       hk=hasTdDept?c.help.packHours:(legacy?(Number(m.help_packing_hours)||0):c.help.packHours),
       hr=hasTdDept?c.help.receivingHours:(legacy?(Number(m.help_receiving_hours)||0):c.help.receivingHours);
 $('helpDetailBody').innerHTML=[
  ['ピッキング',hp,c.totalHours?hp/c.totalHours:null],['梱包',hk,c.totalHours?hk/c.totalHours:null],['入庫',hr,null]
 ].map(r=>`<tr><td>${r[0]}</td><td>${hours(r[1])}</td><td>${r[2]!=null?pct(r[2]):'—'}</td></tr>`).join('');
 const deptRows=Object.entries(c.help.departments||{}).sort((a,b)=>b[1].total-a[1].total);
 $('helpDepartmentBody').innerHTML=deptRows.length
   ? deptRows.map(([dept,x])=>`<tr><td>${esc(dept)}</td><td>${hours(x.pick)}</td><td>${hours(x.pack)}</td><td>${hours(x.receiving)}</td><td><b>${hours(x.total)}</b></td></tr>`).join('')
   : (legacy?'<tr><td colspan="5">この過去月は部署別TimeDesignerデータ未登録です。</td></tr>':'<tr><td colspan="5">他部署応援データはありません。</td></tr>')
}
function fiscalValue(v,type='number',partial=false){let s=type==='percent'?pct(v):(type==='yen'?yen(v):fmt(v,1));if(v!=null&&partial)s+=' ※';return s}
function renderComparison(){
 const c=metrics(currentBundle),p=metrics(prevBundle),y=metrics(yearBundle),m=currentBundle.monthly||{},pm=prevBundle.monthly||{},ym=yearBundle.monthly||{},od=orderDeadlineStats(currentBundle),op=orderDeadlineStats(prevBundle),oy=orderDeadlineStats(yearBundle);
 const rows=[['受注件数',n(m.orders),n(pm.orders),n(ym.orders),false,false],['受注処理能力（件/h）',c.orderHourlyRate,p.orderHourlyRate,y.orderHourlyRate,false,false],['送り状期限達成率',od.rate,op.rate,oy.rate,false,true],['出荷件数',c.shipments,p.shipments,y.shipments,false,false],['誤出荷PPM（低いほど良い）',c.ppm,p.ppm,y.ppm,true,false],['48H以内入庫率',n(m.receiving_rate),n(pm.receiving_rate),n(ym.receiving_rate),false,true],['発送費合計',c.shipNet,p.shipNet,y.shipNet,true,false],['発送費/件',c.shipPer,p.shipPer,y.shipPer,true,false],['資材費',n(m.material_cost),n(pm.material_cost),n(ym.material_cost),true,false],['タイミー費',n(m.timee_cost),n(pm.timee_cost),n(ym.timee_cost),true,false],['OPLH',c.oplh,p.oplh,y.oplh,false,false]];
 $('compareBody').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[5]?pct(r[1]):fmt(r[1],1)}</td><td>${r[5]?pct(r[2]):fmt(r[2],1)}</td><td>${diff(r[1],r[2],r[4],r[5])}</td><td>${r[5]?pct(r[3]):fmt(r[3],1)}</td><td>${diff(r[1],r[3],r[4],r[5])}</td></tr>`).join('');
 if(!fiscalMeta?.endYm||!fiscalCurrent){$('fiscalPeriodNote').textContent='今年度の確定済み月はまだありません。';$('fiscalCompareBody').innerHTML='<tr><td colspan="4">年度集計データはありません。</td></tr>';renderFiscalMonthly();return}
 const endMonth=Number(fiscalMeta.endYm.split('-')[1]),monthsLabel='3〜'+endMonth+'月度';
 $('fiscalCurrentHead').textContent=fiscalMeta.fy+'年度 '+monthsLabel;
 $('fiscalPriorHead').textContent=fiscalMeta.priorFy+'年度 '+monthsLabel;
 $('fiscalPeriodNote').textContent=fiscalMeta.fy+'年度 '+fiscalMeta.startYm.replace('-','/')+'〜'+fiscalMeta.endYm.replace('-','/')+'（確定済み '+fiscalCurrent.months+'か月）';
 const fc=fiscalCurrent,fp=fiscalPrior||{};
 const fyRows=[
  ['受注件数',fc.orders,fp.orders,false,'number',!fc.ordersComplete,!fp.ordersComplete],
  ['受注処理能力（件/h）',fc.orderHourlyRate,fp.orderHourlyRate,false,'number',false,false],
  ['送り状期限達成率',fc.deadlineRate,fp.deadlineRate,false,'percent',false,false],
  ['出荷件数',fc.shipments,fp.shipments,false,'number',false,false],
  ['誤出荷PPM（低いほど良い）',fc.ppm,fp.ppm,true,'number',false,false],
  ['48H以内入庫率（平均）',fc.receivingAvg,fp.receivingAvg,false,'percent',fc.receivingCount<fc.months,fp.receivingCount<fp.months],
  ['発送費合計',fc.shipNet,fp.shipNet,true,'yen',false,false],
  ['発送費/件',fc.shipPer,fp.shipPer,true,'yen',false,false],
  ['資材費',fc.materialCost,fp.materialCost,true,'yen',!fc.materialComplete,!fp.materialComplete],
  ['タイミー費',fc.timeeCost,fp.timeeCost,true,'yen',!fc.timeeComplete,!fp.timeeComplete],
  ['OPLH',fc.oplh,fp.oplh,false,'number',false,false]
 ];
 $('fiscalCompareBody').innerHTML=fyRows.map(r=>`<tr><td>${r[0]}</td><td>${fiscalValue(r[1],r[4],r[5])}</td><td>${fiscalValue(r[2],r[4],r[6])}</td><td>${diff(r[1],r[2],r[3],r[4]==='percent')}</td></tr>`).join('');
 renderFiscalMonthly()
}
function renderFiscalMonthly(){
 const fy=fiscalMeta?.fy||fiscalStartYear(companyMonthToday()),rows=fiscalMonthlyBundles||[];
 $('fiscalMonthlyNote').textContent=fy+'年度（'+fy+'年3月度～'+(fy+1)+'年2月度）';
 $('fiscalMonthlyBody').innerHTML=rows.map(b=>{
  const m=b.monthly||{},c=metrics(b),d=orderDeadlineStats(b),exists=!!b.monthly,status=!exists?'未入力':(m.status==='confirmed'?'確定済':'運用中');
  const badgeClass=!exists?'missing':(m.status==='confirmed'?'confirmed':'open');
  const monthNum=Number(b.ym.split('-')[1]);
  return `<tr>
   <td><b>${monthNum}月度</b></td>
   <td><span class="badge ${badgeClass}">${status}</span></td>
   <td>${fmt(n(m.orders))}</td>
   <td>${c.orderHourlyRate!=null?fmt(c.orderHourlyRate,1)+'件/h':'—'}</td>
   <td>${c.pickingHourlyRate!=null?fmt(c.pickingHourlyRate,1)+'件/h':'—'}</td>
   <td>${pct(d.rate)}</td>
   <td>${c.shipments?fmt(c.shipments):'—'}</td>
   <td class="${c.ppm!=null?(c.ppm<=100?'good':'bad'):''}">${fmt(c.ppm,1)}</td>
   <td>${pct(n(m.receiving_rate))}</td>
   <td>${c.shipPer!=null?yen(c.shipPer,2):'—'}</td>
   <td>${fmt(c.oplh,2)}</td>
  </tr>`
 }).join('')
}
async function unlockMonth(){
 const m=currentBundle.monthly||{};if(m.status!=='confirmed')return;
 if(!confirm(currentBundle.ym+'月度のロックを解除しますか？\nデータは変更せず、編集可能な状態にします。修正後は「月度確定」で再ロックしてください。'))return;
 const body={status:'open',confirmed_at:null,updated_at:new Date().toISOString()};
 await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${currentBundle.ym}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});
 await loadAll()
}
async function confirmMonth(){const m=currentBundle.monthly||{};if(m.status==='confirmed')return;if(m.origin==='legacy_spreadsheet'){if(!confirm(currentBundle.ym+'月度を再確定してロックしますか？'))return;const body={status:'confirmed',confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()};await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${currentBundle.ym}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});await loadAll();return}const c=metrics(currentBundle);const missing=[];if(m.orders==null)missing.push('受注件数');if(m.complaint_count==null)missing.push('クレーム件数');if(m.receiving_rate==null)missing.push('48H以内入庫率');if(m.material_cost==null)missing.push('資材費');if(!currentBundle.td.length)missing.push('TimeDesigner');if(!currentBundle.pt.length)missing.push('物流PT');if(currentBundle.shipping.filter(x=>['yamato','sagawa','japanpost'].includes(x.carrier)&&x.adopted_count!=null&&x.net_cost!=null).length<3)missing.push('発送費3社');if(orderDeadlineStats(currentBundle).total===0)missing.push('送り状○/×判定');if(missing.length){alert('未完了: '+missing.join('、'));return}if(!confirm(currentBundle.ym+'月度を確定しますか？'))return;const body={status:'confirmed',confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()};await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${currentBundle.ym}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});await loadAll()}
async function initApp(){$('monthPick').value=companyMonthToday();await loadAll()}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));['dashboard','monthly','shipping','timedesigner','work','comparison'].forEach(t=>$(t+'Tab').classList.toggle('hidden',b.dataset.tab!==t))});
$('loginBtn').onclick=login;$('logoutBtn').onclick=logout;$('reloadBtn').onclick=async()=>{await flushOrderAutoSave();await loadAll()};$('monthPick').onchange=async()=>{await flushOrderAutoSave();await loadAll()};$('prevMonthBtn').onclick=async()=>{await flushOrderAutoSave();$('monthPick').value=shiftYm($('monthPick').value,-1);await loadAll()};$('nextMonthBtn').onclick=async()=>{await flushOrderAutoSave();$('monthPick').value=shiftYm($('monthPick').value,1);await loadAll()};$('saveMonthlyBtn').onclick=saveMonthly;$('unlockBtn').onclick=unlockMonth;$('confirmBtn').onclick=confirmMonth;$('tdImportBtn').onclick=importTimeDesigner;$('autoPackImportBtn').onclick=importAutoPacking;$('sagawaImportBtn').onclick=importSagawa;$('yamatoImportBtn').onclick=importYamato;$('japanPostImportBtn').onclick=importJapanPost;
async function restoreLogin(){session=loadSession();if(session?.refresh_token){try{if(!session?.access_token||accessTokenNearExpiry())await refreshSession();user=await req('/auth/v1/user');showApp();await initApp();return}catch(e){console.warn('session restore failed',e)}}saveSession(null);session=null;user=null;showApp()}
setInterval(()=>{if(session?.refresh_token&&accessTokenNearExpiry())refreshSession()},5*60*1000);
window.addEventListener('online',()=>{if(session?.refresh_token)refreshSession()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session?.refresh_token&&accessTokenNearExpiry())refreshSession()});
restoreLogin();