/* The only employee source is logistics_staff. This page never writes to it. */
(() => {
  'use strict';
  const B=window.StaffBoard, $=id=>document.getElementById(id);
  const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
  const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
  const SESSION_KEY='logistics_monthly_oplh_session_v1';
  let session=null,user=null,employees=[],rows=[],busy=false,ready=false,refreshPromise=null;
  let selected=null,drag=null,suppressClick=false,loadedDate='';
  const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function savedSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
  function setSession(value){session=value;if(value)localStorage.setItem(SESSION_KEY,JSON.stringify(value));else localStorage.removeItem(SESSION_KEY)}
  async function refresh(){
    if(refreshPromise)return refreshPromise;
    refreshPromise=(async()=>{
      const latest=savedSession();
      if(latest?.access_token && latest.access_token!==session?.access_token){session=latest;return true}
      if(!session?.refresh_token)return false;
      const res=await fetch(SB_URL+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:SB_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
      const data=await res.json();
      if(!res.ok||!data.access_token)return false;
      setSession(data);return true;
    })().finally(()=>{refreshPromise=null});
    return refreshPromise;
  }
  async function req(path, options={}, retry=true){
    let res=await fetch(SB_URL+path,{...options,headers:{apikey:SB_KEY,'Content-Type':'application/json',...(session?.access_token?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}});
    if(res.status===401&&retry&&!path.includes('/token')&&await refresh())return req(path,options,false);
    const text=await res.text();let data;try{data=text?JSON.parse(text):null}catch{data=null}
    if(!res.ok)throw new Error(data?.message||data?.error_description||`接続エラー (${res.status})`);
    return data;
  }
  async function list(table,query){
    const result=[];
    for(let offset=0;;offset+=500){
      const page=await req(`/rest/v1/${table}?${query}&limit=500&offset=${offset}`);
      result.push(...page);if(page.length<500)return result;
    }
  }
  function message(text=''){$('message').textContent=text}
  function lock(value){
    busy=value;
    ['date','previous','next','today','reload','logout'].forEach(id=>$(id).disabled=value);
    document.querySelectorAll('.magnet').forEach(el=>el.disabled=value||el.dataset.inactive==='true');
  }
  function showAuth(){
    const on=!!user;
    $('auth').hidden=on;$('app').hidden=!on;$('logout').hidden=!on;
  }
  function clearState(){ready=false;employees=[];rows=[];selected=null;render()}
  async function load(silent=false){
    if(busy||!user||drag||$('moveDialog').open)return;
    lock(true);ready=false;
    const date=$('date').value,owner=user.id;
    if(!silent)$('saveStatus').textContent='読み込み中…';
    try{
      const [staff,placements]=await Promise.all([
        list('logistics_staff',`owner_id=eq.${owner}&select=id,name,employment_type,is_active,retirement_date&order=id.asc`),
        list('logistics_board_assignments',`owner_id=eq.${owner}&work_date=eq.${date}&select=*&order=staff_id.asc`)
      ]);
      if(user?.id!==owner)return;
      employees=staff;rows=placements;loadedDate=date;ready=true;
      selected=null;render();message();
      $('saveStatus').textContent='✓ 最新の配置を表示';
    }catch(error){
      // Never leave an old day's cards editable under a new date.
      clearState();$('saveStatus').textContent='読み込み失敗';
      message('読み込めませんでした。「最新の配置を読み込む」で再試行してください。 '+error.message);
    }finally{lock(false)}
  }
  function card(staff,slot=null,invalid=false){
    const el=document.createElement('button');el.type='button';el.className='magnet';
    el.dataset.staff=staff.id;el.dataset.slot=slot||'';el.dataset.type=staff.employment_type||'';
    el.dataset.inactive=String(invalid);el.disabled=busy||invalid;
    if(invalid)el.classList.add('inactive');
    const name=document.createElement('strong');name.textContent=B.cleanName(staff.name);
    const type=document.createElement('small');type.textContent=(staff.employment_type||'区分未設定')+(invalid?' / 在籍要確認':'');
    el.append(name,type);el.setAttribute('aria-label',`${name.textContent} ${slot==='ALL'?'全日':slot||'新しく配置'} 配置先を選択`);
    return el;
  }
  function render(){
    const board=$('board');board.replaceChildren();
    const head=board.createTHead().insertRow();
    ['時間帯',...B.places].forEach(p=>{const th=document.createElement('th');th.scope='col';th.textContent=p;head.append(th)});
    const body=board.createTBody();
    ['AM','ALL','PM'].forEach(slot=>{
      const tr=body.insertRow(),th=document.createElement('th');th.scope='row';th.textContent=slot==='ALL'?'全日':slot;tr.append(th);
      B.places.forEach(place=>{
        const td=tr.insertCell();td.dataset.slot=slot;td.dataset.place=place;
        rows.forEach(row=>{
          if(!B.cards(row).some(c=>c.slot===slot&&c.place===place))return;
          const staff=employees.find(s=>s.id===row.staff_id);
          td.append(card(staff||{id:row.staff_id,name:'マスタ参照不可'},slot,!B.eligible(staff,loadedDate)));
        });
        if(!td.children.length){const hint=document.createElement('span');hint.className='cell-hint';hint.textContent='＋ 配置';td.append(hint)}
      });
    });
    renderRoster();
    const count=new Set(rows.filter(r=>r.am||r.pm).map(r=>r.staff_id)).size;
    $('summary').textContent=`配置 ${count}人 / 在籍 ${employees.filter(s=>B.eligible(s,loadedDate)).length}人`;
  }
  function renderRoster(){
    const roster=$('roster');roster.replaceChildren();
    const query=$('search').value.trim().toLocaleLowerCase();
    employees.filter(s=>B.eligible(s,loadedDate)&&`${s.name} ${s.employment_type}`.toLocaleLowerCase().includes(query))
      .sort((a,b)=>a.name.localeCompare(b.name,'ja')).forEach(s=>roster.append(card(s)));
    if(!roster.children.length)roster.textContent=ready?'対象の従業員がいません。':'データを読み込むと従業員を表示します。';
  }
  async function placeSelection(slot,place){
    if(!selected||busy||!ready)return;
    const selection=selected,staff=employees.find(s=>s.id===selection.id);
    if(!B.eligible(staff,loadedDate)){message('この日の在籍状況を確認してください。');return}
    const old=rows.find(r=>r.staff_id===staff.id);
    if(old?.full_day&&selection.from===null&&slot!=='ALL'){
      message('全日カードを移動するか、全日配置を変更してください。');return;
    }
    const next=B.move(old,selection.from,slot,place);
    const existing=old&&B.cards(old).filter(c=>c.slot!==selection.from);
    if(existing?.some(c=>slot==='ALL'||c.slot===slot||c.slot==='ALL')){
      if(!confirm(`${B.cleanName(staff.name)}さんの既存の配置を置き換えますか？`))return;
    }
    lock(true);$('saveStatus').textContent='保存中…';message();
    const payload={owner_id:user.id,staff_id:staff.id,work_date:loadedDate,...next,revision:old?old.revision+1:1};
    try{
      // Compare-and-swap: a stale board must not overwrite another operator's change.
      const query=old?`owner_id=eq.${user.id}&staff_id=eq.${staff.id}&work_date=eq.${loadedDate}&revision=eq.${old.revision}`:'';
      const saved=await req('/rest/v1/logistics_board_assignments'+(query?'?'+query:''),{
        method:old?'PATCH':'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(payload)
      });
      if(!saved?.length)throw Error('別の端末で配置が変更されています。最新の配置を読み込んでください。');
      rows=rows.filter(r=>r.staff_id!==staff.id).concat(saved[0]);selected=null;render();
      $('saveStatus').textContent='✓ 自動保存済み';
    }catch(error){
      // A timeout can occur after the server committed. Require a fresh read before any retry.
      ready=false;$('saveStatus').textContent='保存結果を確認してください';
      message('変更は画面に反映していません。最新の配置を読み込んで保存結果を確認してください。 '+error.message);
    }finally{lock(false)}
  }
  function openMove(el){
    if(busy||!ready||el.disabled)return;
    selected={id:el.dataset.staff,from:el.dataset.slot||null};
    $('moveTitle').textContent=B.cleanName(employees.find(s=>s.id===selected.id)?.name)+' の配置';
    $('slot').value=selected.from||'AM';$('moveDialog').showModal();
  }
  document.addEventListener('click',event=>{
    if(suppressClick){event.preventDefault();return}
    const el=event.target.closest('.magnet');if(el)openMove(el);
  });
  document.addEventListener('pointerdown',event=>{
    const el=event.target.closest('.magnet');
    if(!el||el.disabled||busy||!ready||event.button!==0)return;
    drag={el,id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,ghost:null};
    el.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
    event.preventDefault();
    if(!drag.moved){drag.moved=true;drag.ghost=drag.el.cloneNode(true);drag.ghost.classList.add('ghost');drag.ghost.setAttribute('aria-hidden','true');document.body.append(drag.ghost)}
    drag.ghost.style.left=(event.clientX-45)+'px';drag.ghost.style.top=(event.clientY-25)+'px';
    document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
    document.elementFromPoint(event.clientX,event.clientY)?.closest('td[data-place]')?.classList.add('drop-target');
    const scroll=document.querySelector('.board-scroll'),rect=scroll.getBoundingClientRect();
    if(event.clientY>=rect.top&&event.clientY<=rect.bottom){
      if(event.clientX>rect.right-55)scroll.scrollLeft+=20;
      if(event.clientX<rect.left+55)scroll.scrollLeft-=20;
      if(event.clientY>rect.bottom-35)scroll.scrollTop+=12;
      if(event.clientY<rect.top+35)scroll.scrollTop-=12;
    }
  },{passive:false});
  function endDrag(event,cancel=false){
    if(!drag||drag.id!==event.pointerId)return;
    const current=drag;drag=null;current.ghost?.remove();
    document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));
    if(!current.moved)return;
    suppressClick=true;setTimeout(()=>{suppressClick=false},100);
    if(cancel)return;
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('td[data-place]');
    if(target){selected={id:current.el.dataset.staff,from:current.el.dataset.slot||null};void placeSelection(target.dataset.slot,target.dataset.place)}
  }
  document.addEventListener('pointerup',e=>endDrag(e));
  document.addEventListener('pointercancel',e=>endDrag(e,true));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag)endDrag({pointerId:drag.id},true)});
  B.places.forEach(p=>{const option=document.createElement('option');option.value=p;option.textContent=p;$('place').append(option)});
  $('moveForm').onsubmit=e=>{e.preventDefault();$('moveDialog').close();void placeSelection($('slot').value,$('place').value)};
  $('cancelMove').onclick=()=>$('moveDialog').close();
  $('search').oninput=renderRoster;
  $('date').value=today();
  $('date').onchange=()=>{if(!$('date').value)$('date').value=loadedDate||today();void load()};
  function changeDate(days){const date=new Date($('date').value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);$('date').value=date.toISOString().slice(0,10);void load()}
  $('previous').onclick=()=>changeDate(-1);$('next').onclick=()=>changeDate(1);
  $('today').onclick=()=>{$('date').value=today();void load()};
  $('reload').onclick=()=>load();
  $('loginForm').onsubmit=async e=>{
    e.preventDefault();$('login').disabled=true;$('authError').textContent='';
    try{const data=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:$('email').value.trim(),password:$('password').value})},false);setSession(data);user=data.user;$('password').value='';showAuth();await load()}
    catch(error){$('authError').textContent=error.message}finally{$('login').disabled=false}
  };
  $('logout').onclick=async()=>{
    if(busy)return;
    lock(true);
    try{await req('/auth/v1/logout',{method:'POST'})}catch{}
    setSession(null);user=null;clearState();showAuth();lock(false);
  };
  async function sync(){if(user&&!document.hidden)await load(true)}
  window.addEventListener('focus',sync);
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('storage',event=>{
    if(event.key===SESSION_KEY){
      const latest=savedSession();
      if(!latest||latest.user?.id!==user?.id){location.reload();return}
      session=latest;
    }
    if(event.key==='logistics_staff_changed_v1')void sync();
  });
  if('BroadcastChannel' in window){const channel=new BroadcastChannel('logistics_staff_v1');channel.onmessage=sync}
  setInterval(sync,30000);
  (async()=>{
    session=savedSession();
    if(session?.access_token){try{user=await req('/auth/v1/user');showAuth();await load()}catch{$('authError').textContent='ログイン状態を確認できませんでした。再ログインしてください。';user=null;showAuth()}}
    else showAuth();
  })();
})();

