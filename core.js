const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='forecast365_session_v1';
const LOCAL_DATA_KEY='forecast365_local_data_v1';
const LOCAL_RULES_KEY='forecast365_local_rules_v1';
const $=id=>document.getElementById(id);
let session=null,user=null,rows=[],rules=[],storageMode='local',activeTab='dashboard';
let refreshPromise=null;

const fmtInt=v=>Number.isFinite(Number(v))?Math.round(Number(v)).toLocaleString('ja-JP'):'—';
const fmt1=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('ja-JP',{minimumFractionDigits:1,maximumFractionDigits:1}):'—';
const pct=v=>Number.isFinite(Number(v))?(Number(v)*100).toFixed(1)+'%':'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const todayISO=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
const monthKey=d=>String(d).slice(0,7);
const ymdLabel=d=>{const x=new Date(d+'T00:00:00+09:00');return `${x.getMonth()+1}/${x.getDate()}`};
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

function saveSession(s){session=s;if(s)localStorage.setItem(SESSION_KEY,JSON.stringify(s));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function saveLocal(){localStorage.setItem(LOCAL_DATA_KEY,JSON.stringify(rows));localStorage.setItem(LOCAL_RULES_KEY,JSON.stringify(rules))}
function loadLocal(){
 try{rows=JSON.parse(localStorage.getItem(LOCAL_DATA_KEY)||'null')||structuredClone(window.FORECAST365_SEED||[])}catch{rows=structuredClone(window.FORECAST365_SEED||[])}
 try{rules=JSON.parse(localStorage.getItem(LOCAL_RULES_KEY)||'null')||structuredClone(window.FORECAST365_RULES||[])}catch{rules=structuredClone(window.FORECAST365_RULES||[])}
}
function resetLocal(){localStorage.removeItem(LOCAL_DATA_KEY);localStorage.removeItem(LOCAL_RULES_KEY);loadLocal();saveLocal()}

async function refreshSession(){
 if(refreshPromise)return refreshPromise;if(!session?.refresh_token)return false;
 refreshPromise=(async()=>{try{const r=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});const d=await r.json().catch(()=>null);if(!r.ok||!d?.access_token)return false;saveSession(d);user=d.user||user;return true}catch{return false}finally{refreshPromise=null}})();
 return refreshPromise
}
async function req(path,opt={}){
 const{skipRefresh=false,...fo}=opt;const headers={'apikey':SB_KEY,'Content-Type':'application/json',...(fo.headers||{})};if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
 let res;try{res=await fetch(SB_URL+path,{...fo,headers})}catch{throw new Error('Supabaseへ接続できません。')}
 if(res.status===401&&!skipRefresh&&session?.refresh_token&&!path.includes('grant_type=')){if(await refreshSession())return req(path,{...fo,skipRefresh:true})}
 const txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
 if(!res.ok){const e=new Error(data?.message||data?.hint||data?.error_description||data?.error||('HTTP '+res.status));e.status=res.status;e.code=data?.code;e.details=data;throw e}return data
}
async function rest(table,params='',opt={}){return req('/rest/v1/'+table+(params?'?'+params:''),opt)}

async function login(){
 const em=$('email').value.trim(),pw=$('password').value;if(!em||!pw){$('authError').textContent='メールアドレスとパスワードを入力してください。';return}
 const b=$('loginBtn');b.disabled=true;b.textContent='ログイン中…';$('authError').textContent='';
 try{const d=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:em,password:pw}),skipRefresh:true});saveSession(d);user=d.user;await initialize()}catch(e){$('authError').textContent=e.message}finally{b.disabled=false;b.textContent='ログイン'}
}
async function logout(){try{if(session?.access_token)await req('/auth/v1/logout',{method:'POST'})}catch{}saveSession(null);session=null;user=null;showAuth()}
function showAuth(){
 const on=!!session?.access_token;$('authView').classList.toggle('hidden',on);$('appView').classList.toggle('hidden',!on);$('logoutBtn').classList.toggle('hidden',!on);$('userLabel').textContent=on?(user?.email||''):'連携済みSupabase';
}

async function initialize(){
 showAuth();loadLocal();storageMode='local';
 if(session?.access_token&&user){
  try{await loadCloud();storageMode='cloud'}catch(e){console.warn('forecast365 cloud unavailable',e);storageMode='local'}
 }
 updateModeBadge();renderAll()
}
async function loadCloud(){
 let cloudRows=await rest('forecast365_daily',`owner_id=eq.${user.id}&select=*&order=forecast_date.asc`);
 let cloudRules=await rest('forecast365_rules',`owner_id=eq.${user.id}&select=*&order=rule_group.asc,rule_key.asc`);
 if(!cloudRows?.length){await seedCloud();cloudRows=await rest('forecast365_daily',`owner_id=eq.${user.id}&select=*&order=forecast_date.asc`);cloudRules=await rest('forecast365_rules',`owner_id=eq.${user.id}&select=*&order=rule_group.asc,rule_key.asc`)}
 rows=(cloudRows||[]).map(normalizeRow);rules=(cloudRules||[]).map(normalizeRule)
}
function normalizeRow(r){return {...r,prior_year_actual:Number(r.prior_year_actual||0),system_forecast:Number(r.system_forecast||0),manual_adjustment:Number(r.manual_adjustment||0),final_forecast:Number(r.final_forecast||0),required_people:Number(r.required_people||0),forecast_sagawa:Number(r.forecast_sagawa||0),forecast_nekopos:Number(r.forecast_nekopos||0),forecast_yupack:Number(r.forecast_yupack||0),actual_total:r.actual_total==null?null:Number(r.actual_total),actual_sagawa:r.actual_sagawa==null?null:Number(r.actual_sagawa),actual_nekopos:r.actual_nekopos==null?null:Number(r.actual_nekopos),actual_yupack:r.actual_yupack==null?null:Number(r.actual_yupack),actual_staff:r.actual_staff==null?null:Number(r.actual_staff),temp_staff:r.temp_staff==null?null:Number(r.temp_staff)}}
function normalizeRule(r){return {...r,rule_value:Number(r.rule_value),sample_count:Number(r.sample_count||0)}}
async function seedCloud(){
 const now=new Date().toISOString();
 for(let i=0;i<window.FORECAST365_SEED.length;i+=80){const batch=window.FORECAST365_SEED.slice(i,i+80).map(x=>({...x,owner_id:user.id,updated_at:now}));await rest('forecast365_daily','',{method:'POST',body:JSON.stringify(batch)})}
 const rr=window.FORECAST365_RULES.map(x=>({...x,owner_id:user.id,source_period_start:'2026-02-21',source_period_end:'2026-09-13',updated_at:now}));await rest('forecast365_rules','',{method:'POST',body:JSON.stringify(rr)})
 const hist=window.FORECAST365_SEED.filter(x=>x.forecast_date>='2026-09-14').map(x=>({owner_id:user.id,forecast_date:x.forecast_date,captured_on:'2026-09-14',system_forecast:x.system_forecast,manual_adjustment:x.manual_adjustment||0,final_forecast:x.final_forecast,source:'initial_import',details:{method:'weekday_growth_event_adjustment'}}));
 for(let i=0;i<hist.length;i+=80)await rest('forecast365_history','',{method:'POST',body:JSON.stringify(hist.slice(i,i+80))})
}
function updateModeBadge(){const b=$('modeBadge');if(!b)return;b.textContent=storageMode==='cloud'?'Supabase保存':'ローカルプレビュー';b.className='mode '+(storageMode==='cloud'?'cloud':'local');$('setupNotice').classList.toggle('hidden',storageMode==='cloud')}

function getRule(group,key,def=1){const r=rules.find(x=>x.rule_group===group&&x.rule_key===key);return r?Number(r.rule_value):def}
function setRuleLocal(group,key,value,auto=false,sample=0){let r=rules.find(x=>x.rule_group===group&&x.rule_key===key);if(r){r.rule_value=Number(value);r.auto_calculated=auto;r.sample_count=sample;r.updated_at=new Date().toISOString()}else rules.push({rule_group:group,rule_key:key,rule_value:Number(value),auto_calculated:auto,sample_count:sample})}
function calculateAutoRules(){
 const actual=rows.filter(r=>Number(r.actual_total)>0&&Number(r.prior_year_actual)>0);
 const weekdayKeys=['月','火','水','木','金','土','日'];const weekday={};
 for(const wd of weekdayKeys){const s=actual.filter(r=>r.event_type==='通常'&&r.weekday===wd);const a=s.reduce((z,r)=>z+Number(r.actual_total||0),0),p=s.reduce((z,r)=>z+Number(r.prior_year_actual||0),0);weekday[wd]=p?a/p:getRule('weekday_growth',wd,1);setRuleLocal('weekday_growth',wd,weekday[wd],true,s.length)}
 const events=[...new Set(actual.map(r=>r.event_type).filter(x=>x&&x!=='通常'))];
 for(const ev of events){const s=actual.filter(r=>r.event_type===ev);const a=s.reduce((z,r)=>z+Number(r.actual_total||0),0),b=s.reduce((z,r)=>z+Number(r.prior_year_actual||0)*(weekday[r.weekday]||1),0);if(b)setRuleLocal('event_multiplier',ev,a/b,true,s.length)}
 const sag=actual.reduce((z,r)=>z+Number(r.actual_sagawa||0),0),nek=actual.reduce((z,r)=>z+Number(r.actual_nekopos||0),0),yu=actual.reduce((z,r)=>z+Number(r.actual_yupack||0),0),t=sag+nek+yu;if(t){setRuleLocal('carrier_share','sagawa',sag/t,true,actual.length);setRuleLocal('carrier_share','nekopos',nek/t,true,actual.length);setRuleLocal('carrier_share','yupack',yu/t,true,actual.length)}
 return rules
}
function forecastRecalibrationRatio(r){
 const active=rules.some(x=>x.rule_group==='forecast_recalibration');
 if(!active)return null;
 const validUntil=Math.round(getRule('forecast_recalibration','valid_until',0));
 const ymd=Number(String(r.forecast_date||'').replaceAll('-',''));
 if(!validUntil||!ymd||ymd>validUntil)return null;
 if(r.event_type==='休止日')return 0;
 const normal=getRule('forecast_recalibration','通常',1);
 return getRule('forecast_recalibration',r.event_type||'通常',normal);
}

// 2026-11-12 review. Weather effects are conservative scenarios, not fitted elasticities.
const FORECAST365_REVIEW = {
 version:'tokyo_rakuten_v3_payday_20261112', start:'2026-11-13', end:'2026-12-30',
 weatherSources:['https://www.jma.go.jp/bosai/season/','https://weathernews.jp/news/202611/060031/','https://news.livedoor.com/article/detail/32799443/'],
 calendarSource:'User-provided November/December 2026 Rakuten calendar; BF corroborated by Rakuten announcement',
 // Shift the prior-year event phase, separately preserving the 5/0 next-day effect.
 donors:{'2026-11-20':'2026-11-21','2026-11-21':'2026-11-22','2026-11-22':'2026-11-23','2026-11-23':'2026-11-24','2026-11-24':'2026-11-25','2026-11-25':'2026-11-27','2026-11-26':'2026-11-28','2026-12-24':'2026-12-26','2026-12-25':'2026-12-27'},
 removedPriorEventDates:['2026-11-27','2026-11-28','2026-12-26'],
};
function reviewShiftDate(d,n){return new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10)}
function reviewPayday(d){const previous=Number(reviewShiftDate(d,-1).slice(-2));return previous%5===0}
function reviewWeather(d){
 // Tokyo/Kanto 60%, rest of Japan 40%; planning weights, not customer-location shares.
 // Shipping lags demand by roughly one day. Recent cold-driven uplift is in recent actuals.
 if(d>='2026-11-13'&&d<='2026-11-14')return 1;
 if(d>='2026-11-15'&&d<='2026-11-17')return .6*.97+.4*.98;
 if(d>='2026-11-18'&&d<='2026-11-21')return .6*1.03+.4*1.02;
 if(d>='2026-11-22'&&d<='2026-12-06')return .99;
 return 1; // Do not invent daily weather beyond the available forecast horizon.
}
function reviewForecast(r,all,asOf){
 if(r.forecast_date<FORECAST365_REVIEW.start||r.forecast_date>FORECAST365_REVIEW.end)return null;
 if(r.event_type==='休止日')return {forecast:0,version:FORECAST365_REVIEW.version,reason:'closed'};
 const eligible=all.filter(x=>x.actual_total!=null&&x.prior_year_actual>0&&x.forecast_date<=asOf&&x.forecast_date<r.forecast_date);
 const recent=(days,type)=>eligible.filter(x=>x.forecast_date>=reviewShiftDate(asOf,1-days)&&(!type||x.event_type===type));
 const ratio=(s,fallback=1)=>{const p=s.reduce((z,x)=>z+x.prior_year_actual,0);return p?s.reduce((z,x)=>z+x.actual_total,0)/p:fallback};
 const kind=r.event_type.startsWith('SS')?'通常':(r.event_type==='5/0翌日'?'5/0翌日':'通常');
 const thirty=recent(30,kind),seven=recent(7,kind),r30=ratio(thirty),r7=ratio(seven,r30);
 const horizon=Math.max(1,(Date.parse(r.forecast_date)-Date.parse(asOf))/86400000);
 const recentWeight=.3+.3*Math.exp(-(horizon-1)/14);
 let trend=r30+(r7-r30)*recentWeight;
 if(r.event_type.startsWith('SS')){
   const ss=eligible.filter(x=>x.event_type===r.event_type);
   // Shrink sparse SS evidence toward the rolling normal-day trend.
   trend=trend+(ratio(ss,r30)-r30)*ss.length/(ss.length+5);
 }
 // Estimate the prior-year 5/0 increment on recent data, excluding SS.
 const priorMean=s=>s.length?s.reduce((z,x)=>z+x.prior_year_actual,0)/s.length:0;
 const payRows=recent(30,'5/0翌日'),normalRows=recent(30,'通常');
 const payEffect=clamp(priorMean(payRows)/(priorMean(normalRows)||1),1,2.5);
 const donorDate=FORECAST365_REVIEW.donors[r.forecast_date];
 let baseline=r.prior_year_actual,baselineSource=r.forecast_date;
 if(donorDate){
  const donor=all.find(x=>x.forecast_date===donorDate);
  if(donor&&reviewPayday(donorDate)===reviewPayday(r.forecast_date)){baseline=reviewPayday(r.forecast_date)?Math.max(r.prior_year_actual,donor.prior_year_actual):Math.min(r.prior_year_actual,donor.prior_year_actual);baselineSource=donorDate}
 }else if(FORECAST365_REVIEW.removedPriorEventDates.includes(r.forecast_date)){
  // Replace last year's now-missing sale phase using nearby ordinary, non-payday days.
  const dates=r.forecast_date.startsWith('2026-11')?['2026-11-13','2026-11-14','2026-11-17','2026-11-18','2026-11-19','2026-11-29','2026-11-30','2026-12-02','2026-12-03']:['2026-12-17','2026-12-18','2026-12-19','2026-12-27','2026-12-28','2026-12-29'];
  const pool=all.filter(x=>dates.includes(x.forecast_date)&&x.prior_year_actual>0);
  if(pool.length){baseline=reviewPayday(r.forecast_date)?Math.max(r.prior_year_actual,priorMean(pool)*payEffect):priorMean(pool);baselineSource='nearby_non_event_mean'}
 }
 const weather=reviewWeather(r.forecast_date);
 let forecast=Math.max(0,Math.round(baseline*trend*weather)),paydayFloor=0;
 if(reviewPayday(r.forecast_date)){
  // Business constraint: sale phase shifts must never erase the 5/0 next-day peak.
  // Only recurse into ordinary non-paydays, so this cannot form a cycle.
  const peers=all.filter(x=>x.event_type==='通常'&&!reviewPayday(x.forecast_date)&&Math.abs(Date.parse(x.forecast_date)-Date.parse(r.forecast_date))<=3*86400000);
  const estimates=peers.map(x=>({date:x.forecast_date,value:reviewForecast(x,all,asOf)?.forecast})).filter(x=>Number.isFinite(x.value)&&x.value>0);
  const sorted=estimates.map(x=>x.value).sort((a,b)=>a-b);
  const typical=sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:0;
  const meanActual=s=>s.length?s.reduce((z,x)=>z+x.actual_total,0)/s.length:0;
  const observed=normalRows.length&&payRows.length?meanActual(payRows)/meanActual(normalRows):payEffect;
  const uplift=clamp(observed,1.25,2.5);
  const adjacent=estimates.filter(x=>Math.abs(Date.parse(x.date)-Date.parse(r.forecast_date))===86400000);
  paydayFloor=Math.ceil(Math.max(r.prior_year_actual*trend*weather,typical*uplift,...adjacent.map(x=>x.value*1.1)));
  forecast=Math.max(forecast,paydayFloor);
 }
 return {forecast,paydayFloor,version:FORECAST365_REVIEW.version,asOf,baseline,baselineSource,payEffect,trend,r30,r7,recentWeight,weather,samples30:thirty.length,samples7:seven.length};
}

function recalcFuture(){
 calculateAutoRules();const productivity=getRule('productivity','shipments_per_person',180)||180,sag=getRule('carrier_share','sagawa',.403),nek=getRule('carrier_share','nekopos',.382);
 const asOf=rows.filter(r=>r.actual_total!=null&&r.forecast_date<=todayISO()).map(r=>r.forecast_date).sort().at(-1)||todayISO();
 for(const r of rows){
  if(r.actual_total!=null)continue;
  const revised=reviewForecast(r,rows,asOf);
  const rr=forecastRecalibrationRatio(r);
  if(revised)r.system_forecast=revised.forecast;
  else if(rr!=null)r.system_forecast=Math.max(0,Math.round(Number(r.prior_year_actual||0)*rr));
  else{const wg=getRule('weekday_growth',r.weekday,1),ef=r.event_type==='通常'?1:getRule('event_multiplier',r.event_type,1);r.system_forecast=Math.max(0,Math.round(Number(r.prior_year_actual||0)*wg*ef))}
  r.final_forecast=Math.max(0,r.system_forecast+Number(r.manual_adjustment||0));r.required_people=Math.ceil(r.final_forecast/productivity);r.forecast_sagawa=Math.round(r.final_forecast*sag);r.forecast_nekopos=Math.round(r.final_forecast*nek);r.forecast_yupack=Math.max(0,r.final_forecast-r.forecast_sagawa-r.forecast_nekopos);r.data_state='forecast';r.updated_at=new Date().toISOString()
 }
 saveLocal()
}
async function persistRecalculation(){
 // Capture old predictions before any recalculation write; fail closed if history cannot be saved.
 if(storageMode==='cloud'){
  const history=rows.filter(r=>r.actual_total==null&&r.forecast_date>=FORECAST365_REVIEW.start&&r.forecast_date<=FORECAST365_REVIEW.end).map(r=>({owner_id:user.id,forecast_date:r.forecast_date,captured_on:todayISO(),system_forecast:r.system_forecast,manual_adjustment:r.manual_adjustment||0,final_forecast:r.final_forecast,source:'before_'+FORECAST365_REVIEW.version,details:{row:r,model:FORECAST365_REVIEW}}));
  if(history.length)await rest('forecast365_history','',{method:'POST',body:JSON.stringify(history)});
 }
 recalcFuture();if(storageMode!=='cloud')return;
 const now=new Date().toISOString(),future=rows.filter(r=>r.actual_total==null).map(r=>({owner_id:user.id,forecast_date:r.forecast_date,weekday:r.weekday,event_type:r.event_type,prior_year_actual:r.prior_year_actual,data_state:'forecast',system_forecast:r.system_forecast,manual_adjustment:r.manual_adjustment||0,final_forecast:r.final_forecast,required_people:r.required_people,forecast_sagawa:r.forecast_sagawa,forecast_nekopos:r.forecast_nekopos,forecast_yupack:r.forecast_yupack,updated_at:now}));
 for(let i=0;i<future.length;i+=80)await rest('forecast365_daily','on_conflict=owner_id%2Cforecast_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(future.slice(i,i+80))});
 const rr=rules.map(r=>({owner_id:user.id,rule_group:r.rule_group,rule_key:r.rule_key,rule_value:r.rule_value,sample_count:r.sample_count||0,auto_calculated:!!r.auto_calculated,source_period_start:r.rule_group==='forecast_recalibration'?(r.source_period_start||'2026-10-13'):'2026-02-21',source_period_end:r.rule_group==='forecast_recalibration'?(r.source_period_end||'2026-11-11'):latestActualDate(),updated_at:now}));for(let i=0;i<rr.length;i+=80)await rest('forecast365_rules','on_conflict=owner_id%2Crule_group%2Crule_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rr.slice(i,i+80))})
}
function latestActualDate(){const a=rows.filter(r=>r.actual_total!=null).map(r=>r.forecast_date).sort();return a.at(-1)||'2026-02-21'}

async function saveActual(input){
 const r=rows.find(x=>x.forecast_date===input.forecast_date);if(!r)throw new Error('対象日が見つかりません。');
 const total=Number(input.actual_total||0),sag=Number(input.actual_sagawa||0),nek=Number(input.actual_nekopos||0),yu=Number(input.actual_yupack||0);if(total!==sag+nek+yu)throw new Error(`配送3便の合計 ${fmtInt(sag+nek+yu)}件 と実績出荷数 ${fmtInt(total)}件 が一致していません。`);
 Object.assign(r,{actual_total:total,actual_sagawa:sag,actual_nekopos:nek,actual_yupack:yu,actual_staff:input.actual_staff===''?null:Number(input.actual_staff),temp_staff:input.temp_staff===''?null:Number(input.temp_staff),completed_at:input.completed_at||null,note:input.note||null,data_state:'actual',updated_at:new Date().toISOString()});
 saveLocal();
 if(storageMode==='cloud'){await rest('forecast365_daily',`owner_id=eq.${user.id}&forecast_date=eq.${r.forecast_date}`,{method:'PATCH',body:JSON.stringify({actual_total:r.actual_total,actual_sagawa:r.actual_sagawa,actual_nekopos:r.actual_nekopos,actual_yupack:r.actual_yupack,actual_staff:r.actual_staff,temp_staff:r.temp_staff,completed_at:r.completed_at,note:r.note,data_state:'actual',updated_at:r.updated_at})})}
 await persistRecalculation();renderAll()
}
async function saveManualForecast(dateStr,adjustment){const r=rows.find(x=>x.forecast_date===dateStr);if(!r)return;r.manual_adjustment=Number(adjustment||0);r.final_forecast=Math.max(0,r.system_forecast+r.manual_adjustment);const prod=getRule('productivity','shipments_per_person',180)||180,sag=getRule('carrier_share','sagawa',.403),nek=getRule('carrier_share','nekopos',.382);r.required_people=Math.ceil(r.final_forecast/prod);r.forecast_sagawa=Math.round(r.final_forecast*sag);r.forecast_nekopos=Math.round(r.final_forecast*nek);r.forecast_yupack=r.final_forecast-r.forecast_sagawa-r.forecast_nekopos;saveLocal();if(storageMode==='cloud'){await rest('forecast365_daily',`owner_id=eq.${user.id}&forecast_date=eq.${dateStr}`,{method:'PATCH',body:JSON.stringify({manual_adjustment:r.manual_adjustment,final_forecast:r.final_forecast,required_people:r.required_people,forecast_sagawa:r.forecast_sagawa,forecast_nekopos:r.forecast_nekopos,forecast_yupack:r.forecast_yupack,updated_at:new Date().toISOString()})});await rest('forecast365_history','',{method:'POST',body:JSON.stringify({owner_id:user.id,forecast_date:dateStr,captured_on:todayISO(),system_forecast:r.system_forecast,manual_adjustment:r.manual_adjustment,final_forecast:r.final_forecast,source:'manual_adjustment',details:{}})})}renderAll()}
async function saveProductivity(v){const x=Math.max(1,Number(v||180));setRuleLocal('productivity','shipments_per_person',x,false,0);await persistRecalculation();renderAll()}

function rowError(r){if(!Number(r.actual_total)||!Number(r.final_forecast))return null;return Number(r.actual_total)-Number(r.final_forecast)}
function rowErrorRate(r){if(!Number(r.actual_total)||!Number(r.final_forecast))return null;return Math.abs(Number(r.actual_total)-Number(r.final_forecast))/Number(r.actual_total)}
