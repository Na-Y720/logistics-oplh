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
function recalcFuture(){
 calculateAutoRules();const productivity=getRule('productivity','shipments_per_person',180)||180,sag=getRule('carrier_share','sagawa',.403),nek=getRule('carrier_share','nekopos',.382);
 for(const r of rows){if(Number(r.actual_total)>0)continue;const wg=getRule('weekday_growth',r.weekday,1),ef=r.event_type==='通常'?1:getRule('event_multiplier',r.event_type,1);r.system_forecast=Math.max(0,Math.round(Number(r.prior_year_actual||0)*wg*ef));r.final_forecast=Math.max(0,r.system_forecast+Number(r.manual_adjustment||0));r.required_people=Math.ceil(r.final_forecast/productivity);r.forecast_sagawa=Math.round(r.final_forecast*sag);r.forecast_nekopos=Math.round(r.final_forecast*nek);r.forecast_yupack=Math.max(0,r.final_forecast-r.forecast_sagawa-r.forecast_nekopos);r.data_state='forecast';r.updated_at=new Date().toISOString()}
 saveLocal()
}
async function persistRecalculation(){
 recalcFuture();if(storageMode!=='cloud')return;
 const now=new Date().toISOString(),future=rows.filter(r=>!(Number(r.actual_total)>0)).map(r=>({owner_id:user.id,forecast_date:r.forecast_date,weekday:r.weekday,event_type:r.event_type,prior_year_actual:r.prior_year_actual,data_state:'forecast',system_forecast:r.system_forecast,manual_adjustment:r.manual_adjustment||0,final_forecast:r.final_forecast,required_people:r.required_people,forecast_sagawa:r.forecast_sagawa,forecast_nekopos:r.forecast_nekopos,forecast_yupack:r.forecast_yupack,updated_at:now}));
 for(let i=0;i<future.length;i+=80)await rest('forecast365_daily','on_conflict=owner_id%2Cforecast_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(future.slice(i,i+80))});
 const rr=rules.map(r=>({owner_id:user.id,rule_group:r.rule_group,rule_key:r.rule_key,rule_value:r.rule_value,sample_count:r.sample_count||0,auto_calculated:!!r.auto_calculated,source_period_start:'2026-02-21',source_period_end:latestActualDate(),updated_at:now}));for(let i=0;i<rr.length;i+=80)await rest('forecast365_rules','on_conflict=owner_id%2Crule_group%2Crule_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rr.slice(i,i+80))})
}
function latestActualDate(){const a=rows.filter(r=>Number(r.actual_total)>0).map(r=>r.forecast_date).sort();return a.at(-1)||'2026-02-21'}

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
