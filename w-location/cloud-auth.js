(function(root){
'use strict';
const URL='https://qfcgxefymdodjrprhfvu.supabase.co',KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m',SESSION='wloc_cloud_session_v1';
let session=null,refreshing=null,generation=0;
const el=id=>document.getElementById(id);
function save(s){session=s;if(s)localStorage.setItem(SESSION,JSON.stringify(s));else localStorage.removeItem(SESSION);}
async function request(path,options={},retry=true){
 if(session?.refresh_token&&session.expires_at*1000<Date.now()+60000&&!path.startsWith('/auth/'))await refresh();
 const res=await fetch(URL+path,{...options,headers:{apikey:KEY,'Content-Type':'application/json',...(session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}});
 const data=await res.json().catch(()=>null);
 if(res.status===401&&retry&&session?.refresh_token&&!path.startsWith('/auth/')){await refresh();return request(path,options,false);}
 if(!res.ok)throw Error(data?.message||data?.msg||data?.error_description||'通信エラー '+res.status);
 return data;
}
async function refresh(){
 if(refreshing)return refreshing;
 const token=session?.refresh_token,g=generation;if(!token)throw Error('再ログインしてください');
 refreshing=(async()=>{const data=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:token})},false);if(g!==generation)throw Error('ログイン状態が変更されました');save(data);})().finally(()=>refreshing=null);return refreshing;
}
async function verify(){const data=await request('/auth/v1/user');if(!data?.id)throw Error('再ログインしてください');const members=await request('/rest/v1/wloc_members?select=user_id&user_id=eq.'+encodeURIComponent(data.id));if(!members?.length)throw Error('このアカウントはWロケ共有データの利用対象ではありません。既存の物流アプリ用アカウントでログインしてください。');return data;}
function show(on){el('authView').hidden=on;el('workspace').hidden=!on;el('logout').hidden=!on;el('cloudUser').textContent=on?session?.user?.email||'ログイン済み':'';}
async function activate(){await verify();show(true);await root.WLocApp.restore();}
function init(){
 el('loginForm').onsubmit=async e=>{e.preventDefault();el('loginButton').disabled=true;el('authError').textContent='';try{const data=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:el('email').value.trim(),password:el('password').value})},false);generation++;save(data);await activate();el('password').value='';}catch(e){show(false);el('authError').textContent=e.message;}finally{el('loginButton').disabled=false;}};
 el('logout').onclick=async()=>{generation++;const previous=session;save(null);show(false);root.WLocApp.clear();if(previous?.access_token)fetch(URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+previous.access_token}}).catch(()=>{});};
 try{session=JSON.parse(localStorage.getItem(SESSION)||'null');}catch{}
 if(session?.access_token)activate().catch(e=>{show(false);el('authError').textContent=e.message;});else show(false);
}
root.WLocCloud={request,init,isLoggedIn:()=>!!session?.access_token};
})(window);
