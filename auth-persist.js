(()=>{
  // ログイン状態を長期間維持するための補助処理。
  // Supabase の refresh token は core.js が保持しているため、
  // 一時的な通信断ではログイン画面へ戻さず、復帰時に自動再接続する。
  const baseReq=req;

  function cachedUser(){
    return session?.user || user || null;
  }

  function tokenExpMs(){
    try{
      const token=session?.access_token;
      if(!token)return 0;
      const part=token.split('.')[1];
      if(!part)return 0;
      const normalized=part.replace(/-/g,'+').replace(/_/g,'/');
      const padded=normalized+'='.repeat((4-normalized.length%4)%4);
      const payload=JSON.parse(atob(padded));
      return Number(payload.exp||0)*1000;
    }catch{return 0}
  }

  async function refreshIfNeeded(force=false){
    if(!session?.refresh_token)return false;
    const exp=tokenExpMs();
    const nearExpiry=!exp || exp-Date.now()<10*60*1000;
    if(!force&&!nearExpiry)return true;
    return await refreshSession();
  }

  // /auth/v1/user の取得時、一時的な通信断なら保存済みユーザーで継続する。
  // 401 は core.js 側で refresh token による更新を試した後に返るため、その場合は通常どおり再ログインへ進む。
  req=async function(path,opt={}){
    if(session?.access_token && !String(path).includes('grant_type=')){
      await refreshIfNeeded(false);
    }
    try{
      return await baseReq(path,opt);
    }catch(e){
      if(path==='/auth/v1/user' && !e?.status && cachedUser()){
        console.warn('Supabase一時接続エラー: 保存済みログイン情報で継続します。',e);
        return cachedUser();
      }
      throw e;
    }
  };

  async function resumeSession(){
    if(!session?.refresh_token)return;
    try{
      await refreshIfNeeded(false);
      if(user && typeof loadCloud==='function'){
        await loadCloud();
        storageMode='cloud';
        updateModeBadge();
        if(typeof renderAll==='function')renderAll();
      }
    }catch(e){
      console.warn('Supabase再接続待ち',e);
    }
  }

  window.addEventListener('focus',resumeSession);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeSession()});
  setInterval(()=>{if(document.visibilityState==='visible')refreshIfNeeded(false)},15*60*1000);
})();
