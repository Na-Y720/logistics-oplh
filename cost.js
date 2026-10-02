const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='logistics_monthly_oplh_session_v1';
const $=id=>document.getElementById(id);
let session=null,user=null,currentBundle=null,prevBundle=null,yearBundle=null,refreshPromise=null;

function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
async function refreshSession(){if(refreshPromise)return refreshPromise;if(!session?.refresh_token)return false;refreshPromise=(async()=>{try{const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});const d=await res.json().catch(()=>null);if(!res.ok||!d?.access_token)return false;saveSession(d);user=d.user||user;return true}catch{return false}finally{refreshPromise=null}})();return refreshPromise}
async function req(path,opt={}){const{skipRefresh=false,...fo}=opt,headers={apikey:SB_KEY,'Content-Type':'application/json',...(fo.headers||{})};if(session?.access_token)headers.Authorization='Bearer '+session.access_token;let res=await fetch(SB_URL+path,{...fo,headers});if(res.status===401&&!skipRefresh&&session?.refresh_token&&!path.includes('grant_type=')){if(await refreshSession())return req(path,{...fo,skipRefresh:true})}const txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||('HTTP '+res.status));return data}
async function rest(table,params='',opt={}){return req('/rest/v1/'+table+(params?'?'+params:''),opt)}
function localDateISO(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return y+'-'+m+'-'+day}
function companyMonthToday(d=new Date()){let y=d.getFullYear(),m=d.getMonth()+1;if(d.getDate()>=21){m++;if(m===13){y++;m=1}}return y+'-'+String(m).padStart(2,'0')}
function monthRange(ym){const[y,m]=ym.split('-').map(Number),end=new Date(y,m-1,20),start=new Date(y,m-2,21);return[localDateISO(start),localDateISO(end)]}
function previousYm(ym){let[y,m]=ym.split('-').map(Number);m--;if(m===0){m=12;y--}return y+'-'+String(m).padStart(2,'0')}
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
  rest('logistics_work_time',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&select=picking_minutes,total_picking_minutes,pass_sort_minutes,sorting_minutes,hand_pack_minutes,auto_pack_minutes,stock_move_minutes`).catch(()=>[]),
  rest('oplh_timedesigner_daily',`owner_id=eq.${user.id}&work_date=gte.${start}&work_date=lte.${end}&select=activity_key,activity_label,work_minutes`).catch(()=>[]),
  rest('logistics_cost_import_batches',`owner_id=eq.${user.id}&month_ym=eq.${ym}&select=source,source_filename,source_rows,imported_at,metadata&order=imported_at.desc`).catch(()=>[])
 ]);
 return{ym,monthly,shipping:shipping||[],pt:pt||[],td:td||[],imports:imports||[],start,end}
}

function sum(obj,key){return(obj||[]).reduce((a,r)=>a+(Number(r[key])||0),0)}
function tdTotals(rows){const out={};for(const r of rows||[]){const key=r.activity_key||r.activity_label||'';out[key]=(out[key]||0)+(Number(r.work_minutes)||0)}return out}
function tdMinutes(rows,keys=[],labels=[]){return(rows||[]).reduce((a,r)=>{const key=r.activity_key||'',label=r.activity_label||'';return a+((keys.includes(key)||labels.includes(label))?(Number(r.work_minutes)||0):0)},0)}
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

 const empOrderPickMin=tdMinutes(tdRows,['picking'],['オーダーピッキング（送り状ピッキング）','オーダーピッキング']);
 const empPassMin=tdMinutes(tdRows,['pass_sort'],['パスソート']);
 const empTotalPickMin=tdMinutes(tdRows,['total_picking'],['トータルピッキング（トータル回収作業）','トータルピッキング']);
 const empCheckMin=tdMinutes(tdRows,['shipping_check'],['出荷検品（複数ピッキング）','出荷検品']);
 const empHandPackMin=tdMinutes(tdRows,['hand_pack'],['手動梱包']);
 const empAutoPackMin=tdMinutes(tdRows,['auto_pack'],['自動梱包機']);
 const empReceivingMin=tdMinutes(tdRows,['receiving'],['入庫']);
 const empStockMoveMin=tdMinutes(tdRows,['stock_move'],['在庫移動']);

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
     ptOrderPick:ptOrderPickMin/60,ptPass:ptPassMin/60,ptTotalPick:ptTotalPickMin/60,ptSorting:ptSortingMin/60,
     ptHandPack:ptHandPackMin/60,ptAutoPack:ptAutoPackMin/60,ptStockMove:ptStockMoveMin/60
   }}
}
function diff(now,old,betterLow=false,percent=false){if(now==null||old==null||Number(old)===0)return '—';const delta=Number(now)-Number(old),rate=(Number(now)/Number(old)-1)*100;let cls='neutral';if(delta!==0)cls=((betterLow?delta<0:delta>0)?'good':'bad');return `<span class="${cls}">${delta>=0?'+':''}${percent?(delta*100).toFixed(1)+'pt':fmt(delta,1)} (${rate>=0?'+':''}${rate.toFixed(1)}%)</span>`}

async function loadAll(){const ym=$('monthPick').value||companyMonthToday();$('monthPick').value=ym;const[start,end]=monthRange(ym);$('monthRange').textContent=`${start} ～ ${end}（21日～翌20日）`;try{
 [currentBundle,prevBundle,yearBundle]=await Promise.all([loadBundle(ym,{create:true}),loadBundle(previousYm(ym)),loadBundle(priorYearYm(ym))]);
 renderAll()
 }catch(e){console.error(e);alert('読み込みに失敗しました: '+e.message)}
}
function renderAll(){renderStatus();renderDashboard();renderMonthly();renderShipping();renderWork();renderComparison()}
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
 const status=[
  ['月次手入力',mth.orders!=null&&mth.complaint_count!=null&&mth.receiving_rate!=null&&mth.material_cost!=null,'受注・品質・資材'],
  ['TimeDesigner',currentBundle.td.length>0,'社員作業時間＋受注処理'],
  ['物流PT',currentBundle.pt.length>0,'物流PT作業時間管理'],
  ['発送費',ship.filter(x=>['yamato','sagawa','japanpost'].includes(x.carrier)&&x.adopted_count!=null&&x.net_cost!=null).length===3,'ヤマト・佐川・日本郵便']
 ];
 $('sourceStatus').innerHTML=status.map(x=>`<div class="source-row"><div><strong>${x[0]}</strong><small>${x[2]}</small></div><span class="badge ${x[1]?'auto':'missing'}">${x[1]?'取得済':'未完了'}</span></div>`).join('')
}
function setInput(id,v,percent=false){$(id).value=v==null?'':(percent?Number(v)*100:v)}
function renderMonthly(){const m=currentBundle.monthly||{},locked=m.status==='confirmed'||m.origin==='legacy_spreadsheet';setInput('mOrders',m.orders);setInput('mComplaints',m.complaint_count);setInput('mReceiving',m.receiving_rate,true);setInput('mShippingWork',m.shipping_work_count);setInput('mPickComplaints',m.picking_complaint_count);setInput('mMaterialCost',m.material_cost);setInput('mSilverCost',m.silver_cost);setInput('mTimeeCost',m.timee_cost);setInput('mTimeePick',m.timee_picking_hours);setInput('mTimeePack',m.timee_packing_hours);setInput('m955Ok',m.label_955_ok_days);setInput('m955Total',m.label_955_total_days);
 ['mOrders','mComplaints','mReceiving','mShippingWork','mPickComplaints','mMaterialCost','mSilverCost','mTimeeCost','mTimeePick','mTimeePack','m955Ok','m955Total'].forEach(id=>$(id).disabled=locked);$('saveMonthlyBtn').disabled=locked;$('legacyNotice').classList.toggle('hidden',m.origin!=='legacy_spreadsheet');$('legacyNotice').textContent=m.origin==='legacy_spreadsheet'?'旧スプレッドシートから移行した確定値です。過去実績としてロックしています。':''}
function inputNum(id,divide=1){const v=$(id).value.trim();return v===''?null:Number(v)/divide}
async function saveMonthly(){const m=currentBundle.monthly;if(m.status==='confirmed'||m.origin==='legacy_spreadsheet')return;const body={owner_id:user.id,month_ym:currentBundle.ym,period_start:currentBundle.start,period_end:currentBundle.end,status:'open',origin:'app',orders:inputNum('mOrders'),complaint_count:inputNum('mComplaints'),receiving_rate:inputNum('mReceiving',100),shipping_work_count:inputNum('mShippingWork'),picking_complaint_count:inputNum('mPickComplaints'),material_cost:inputNum('mMaterialCost'),silver_cost:inputNum('mSilverCost'),timee_cost:inputNum('mTimeeCost'),timee_picking_hours:inputNum('mTimeePick'),timee_packing_hours:inputNum('mTimeePack'),label_955_ok_days:inputNum('m955Ok'),label_955_total_days:inputNum('m955Total'),updated_at:new Date().toISOString()};
 try{await rest('logistics_cost_monthly','on_conflict=owner_id%2Cmonth_ym',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(body)});$('monthlyMessage').className='message ok';$('monthlyMessage').textContent='保存しました。';await loadAll()}catch(e){$('monthlyMessage').className='message bad';$('monthlyMessage').textContent=e.message}}
function renderShipping(){const c=metrics(currentBundle),rows=['yamato','sagawa','japanpost'].map(car=>currentBundle.shipping.find(x=>x.carrier===car)||{carrier:car});const labels={yamato:'ヤマト運輸',sagawa:'佐川急便',japanpost:'日本郵便'};$('shippingBody').innerHTML=rows.map(r=>{const count=n(r.adopted_count),net=n(r.net_cost),gross=n(r.gross_cost),unit=count&&net?net/count:null;return `<tr><td>${labels[r.carrier]}</td><td>${fmt(count)}</td><td>${fmt(n(r.invoice_count))}</td><td>${yen(gross)}</td><td>${yen(net)}</td><td>${yen(unit,2)}</td><td>${c.shipments&&count?pct(count/c.shipments):'—'}</td><td>${r.source_kind==='legacy_spreadsheet'?'旧スプレッド':(r.source_filename?esc(r.source_filename):'—')}</td></tr>`}).join('');$('shipNetTotal').textContent=yen(c.shipNet);$('shipUnitTotal').textContent=yen(c.shipPer,2)}
function renderWork(){const c=metrics(currentBundle),d=c.detail;$('wPick').textContent=hours(c.pickHours);$('wPack').textContent=hours(c.packHours);$('wTotal').textContent=hours(c.totalHours);$('wOplh').textContent=fmt(c.oplh,2);
 const rows=[
  ['ピッキング','オーダーピッキング',d.empOrderPick,d.ptOrderPick,0,true],
  ['ピッキング','パスソート',d.empPass,d.ptPass,0,true],
  ['ピッキング','トータルピッキング',d.empTotalPick,d.ptTotalPick,0,true],
  ['ピッキング','出荷検品',d.empCheck,0,0,true],
  ['ピッキング','タイミー ピッキング',0,0,c.timeePickHours,true],
  ['梱包','手動梱包',d.empHandPack,d.ptHandPack,0,true],
  ['梱包','自動梱包機',d.empAutoPack,d.ptAutoPack,0,true],
  ['梱包','タイミー 梱包',0,0,c.timeePackHours,true],
  ['その他','仕分け',0,d.ptSorting,0,false],
  ['在庫','入庫',d.empReceiving,0,0,false],
  ['在庫','在庫移動 / 入庫＆在庫移動',d.empStockMove,d.ptStockMove,0,false]
 ];
 $('workDetailBody').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${hours(r[2])}</td><td>${hours(r[3])}</td><td>${hours(r[4])}</td><td><b>${hours(r[2]+r[3]+r[4])}</b></td><td><span class="badge ${r[5]?'auto':''}">${r[5]?'含む':'対象外'}</span></td></tr>`).join('');
 const packs=[
  ['手動梱包',d.empHandPack,d.ptHandPack,0],
  ['自動梱包機',d.empAutoPack,d.ptAutoPack,0],
  ['タイミー梱包',0,0,c.timeePackHours]
 ];
 $('packingDetailBody').innerHTML=packs.map(r=>`<tr><td>${r[0]}</td><td>${hours(r[1])}</td><td>${hours(r[2])}</td><td>${hours(r[3])}</td><td><b>${hours(r[1]+r[2]+r[3])}</b></td><td><span class="badge auto">含む</span></td></tr>`).join('')
}
function renderComparison(){const c=metrics(currentBundle),p=metrics(prevBundle),y=metrics(yearBundle),m=currentBundle.monthly||{},pm=prevBundle.monthly||{},ym=yearBundle.monthly||{};const rows=[['受注件数',n(m.orders),n(pm.orders),n(ym.orders),false,false],['出荷件数',c.shipments,p.shipments,y.shipments,false,false],['誤出荷PPM（低いほど良い）',c.ppm,p.ppm,y.ppm,true,false],['48H以内入庫率',n(m.receiving_rate),n(pm.receiving_rate),n(ym.receiving_rate),false,true],['発送費合計',c.shipNet,p.shipNet,y.shipNet,true,false],['発送費/件',c.shipPer,p.shipPer,y.shipPer,true,false],['資材費',n(m.material_cost),n(pm.material_cost),n(ym.material_cost),true,false],['タイミー費',n(m.timee_cost),n(pm.timee_cost),n(ym.timee_cost),true,false],['OPLH',c.oplh,p.oplh,y.oplh,false,false]];$('compareBody').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[5]?pct(r[1]):fmt(r[1],1)}</td><td>${r[5]?pct(r[2]):fmt(r[2],1)}</td><td>${diff(r[1],r[2],r[4],r[5])}</td><td>${r[5]?pct(r[3]):fmt(r[3],1)}</td><td>${diff(r[1],r[3],r[4],r[5])}</td></tr>`).join('')}
async function confirmMonth(){const m=currentBundle.monthly||{};if(m.origin==='legacy_spreadsheet'||m.status==='confirmed')return;const c=metrics(currentBundle);const missing=[];if(m.orders==null)missing.push('受注件数');if(m.complaint_count==null)missing.push('クレーム件数');if(m.receiving_rate==null)missing.push('48H以内入庫率');if(m.material_cost==null)missing.push('資材費');if(!currentBundle.td.length)missing.push('TimeDesigner');if(!currentBundle.pt.length)missing.push('物流PT');if(currentBundle.shipping.filter(x=>['yamato','sagawa','japanpost'].includes(x.carrier)&&x.adopted_count!=null&&x.net_cost!=null).length<3)missing.push('発送費3社');if(missing.length){alert('未完了: '+missing.join('、'));return}if(!confirm(currentBundle.ym+'月度を確定しますか？'))return;const body={status:'confirmed',confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()};await rest('logistics_cost_monthly',`owner_id=eq.${user.id}&month_ym=eq.${currentBundle.ym}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(body)});await loadAll()}
async function initApp(){$('monthPick').value=companyMonthToday();await loadAll()}

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));['dashboard','monthly','shipping','work','comparison'].forEach(t=>$(t+'Tab').classList.toggle('hidden',b.dataset.tab!==t))});
$('loginBtn').onclick=login;$('logoutBtn').onclick=logout;$('reloadBtn').onclick=loadAll;$('monthPick').onchange=loadAll;$('saveMonthlyBtn').onclick=saveMonthly;$('confirmBtn').onclick=confirmMonth;
(async()=>{session=loadSession();if(session?.access_token){try{user=await req('/auth/v1/user');showApp();await initApp()}catch{saveSession(null);session=null;user=null;showApp()}}else showApp()})();