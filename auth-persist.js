(function(){
  const baseReq=window.req;
  const baseSaveSession=window.saveSession;
  let preserveStoredSessionOnce=false;

  function accessTokenNearExpiry(){
    const exp=Number(session?.expires_at||0);
    return !!(exp && Date.now() >= (exp*1000-60000));
  }

  window.req=async function(path,opt={}){
    const skipRefresh=!!opt.skipRefresh;
    if(!skipRefresh && session?.refresh_token && (!session?.access_token || accessTokenNearExpiry())){
      try{await refreshSession()}catch{}
    }
    try{
      return await baseReq(path,opt);
    }catch(e){
      const msg=String(e?.message||'');
      if(msg.includes('Supabaseへ接続できません')){
        preserveStoredSessionOnce=true;
        throw e;
      }
      if(!skipRefresh && session?.refresh_token){
        try{
          if(await refreshSession())return await baseReq(path,{...opt,skipRefresh:true});
        }catch{}
      }
      throw e;
    }
  };

  window.saveSession=function(s){
    if(!s && preserveStoredSessionOnce){
      preserveStoredSessionOnce=false;
      session=null;
      return;
    }
    return baseSaveSession(s);
  };
})();
