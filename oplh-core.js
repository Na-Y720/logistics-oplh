const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const SESSION_KEY='logistics_performance_session_v1';
const $=id=>document.getElementById(id);
let session=null,user=null,staff=[];

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function fmt(v,d=1){return Number.isFinite(v)?Number(v).toLocaleString('ja-JP',{minimumFractionDigits:d,maximumFractionDigits:d}):'—'}
function normName(v){return String(v??'').normalize('NFKC').replace(/[\s　]+/g,'').trim()}
function saveSession(v){session=v;if(v)localStorage.setItem(SESSION_KEY,JSON.stringify(v));else localStorage.removeItem(SESSION_KEY)}
function loadSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}

async function req(path,opt={}){
 const headers={'apikey':SB_KEY,'Content-Type':'application/json',...(opt.headers||{})};
 if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
 let res;
 try{res=await fetch(SB_URL+path,{...opt,headers})}catch{throw new Error('Supabaseへ接続できません。')}
 if(res.status===401&&session?.refresh_token&&!opt._retried){
  const ok=await refreshSession();
  if(ok)return req(path,{...opt,_retried:true});
 }
 const text=await res.text();
 let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
 if(!res.ok)throw new Error(data?.message||data?.error_description||data?.error||('HTTP '+res.status));
 return data;
}
async function refreshSession(){
 try{
  const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
  const data=await res.json();
  if(!res.ok||!data?.access_token)return false;
  saveSession(data);user=data.user||user;return true;
 }catch{return false}
}
async function rest(table,params='',opt={}){
 const o={...opt};delete o._retried;
 return req('/rest/v1/'+table+(params?'?'+params:''),o);
}
async function restAll(table,params){
 const out=[];let from=0;const size=1000;
 while(true){
  const rows=await rest(table,params,{headers:{Range:from+'-'+(from+size-1)}});
  if(!Array.isArray(rows))break;
  out.push(...rows);
  if(rows.length<size)break;
  from+=size;
 }
 return out;
}
async function chunkUpsert(table,rows,conflict,size=400){
 for(let i=0;i<rows.length;i+=size){
  const part=rows.slice(i,i+size);
  await rest(table,'on_conflict='+encodeURIComponent(conflict),{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(part)});
  setImportStatus('保存中… '+Math.min(i+size,rows.length).toLocaleString()+' / '+rows.length.toLocaleString()+'件');
 }
}
function planPeriod(ym){
 const [y,m]=String(ym).split('-').map(Number),pad=n=>String(n).padStart(2,'0');
 const start=new Date(Date.UTC(y,m-2,21)),end=new Date(Date.UTC(y,m-1,20));
 const f=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
 return{start:f(start),end:f(end)};
}
function jpDate(v){return String(v||'').replaceAll('-','/')}
function currentYm(){return new Date().toISOString().slice(0,7)}

async function login(){
 const email=$('email').value.trim(),password=$('password').value;
 $('authError').textContent='';
 if(!email||!password){$('authError').textContent='メールアドレスとパスワードを入力してください。';return}
 const b=$('loginBtn');b.disabled=true;b.textContent='ログイン中…';
 try{
  const data=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
  saveSession(data);user=data.user;showApp();await bootApp();
 }catch(e){$('authError').textContent=e.message}
 finally{b.disabled=false;b.textContent='ログイン'}
}
async function logout(){
 try{if(session?.access_token)await req('/auth/v1/logout',{method:'POST'})}catch{}
 saveSession(null);user=null;showApp();
}
function showApp(){
 const on=!!session?.access_token;
 $('authView').classList.toggle('hidden',on);
 $('appView').classList.toggle('hidden',!on);
 $('logoutBtn').classList.toggle('hidden',!on);
 $('userLabel').textContent=user?.email||'';
}

(async()=>{
 $('loginBtn').onclick=login;$('logoutBtn').onclick=logout;
 session=loadSession();
 if(session?.access_token){
  try{user=await req('/auth/v1/user');showApp();await bootApp();return}catch{saveSession(null);session=null;user=null}
 }
 showApp();
})();