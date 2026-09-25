(function(){
  const state={month:'',planMonth:'',start:'',end:'',dates:[],staff:[],shifts:new Map(),loaded:false};
  const jpWeek=['日','月','火','水','木','金','土'];
  const holidayCache=new Map();
  const key=(sid,d)=>sid+'|'+d;
  const pad=v=>String(v).padStart(2,'0');

  function utcYmd(d){return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
  function addUtcDays(s,x){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+x);return utcYmd(d)}
  function periodForMonth(ym){
    const [y,m]=String(ym).split('-').map(Number);
    const start=new Date(Date.UTC(y,m-2,21)),end=new Date(Date.UTC(y,m-1,20)),dates=[];
    for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1))dates.push(utcYmd(d));
    return{start:utcYmd(start),end:utcYmd(end),dates,planMonth:y+'-'+pad(m)+'-01'};
  }
  function companyMonthToday(){
    const d=new Date(),y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate();
    if(day<21)return y+'-'+pad(m);
    const n=new Date(y,m,1);
    return n.getFullYear()+'-'+pad(n.getMonth()+1);
  }
  function shiftYm(ym,delta){
    const [y,m]=ym.split('-').map(Number),d=new Date(y,m-1+delta,1);
    return d.getFullYear()+'-'+pad(d.getMonth()+1);
  }
  function dateInfo(date){
    const d=new Date(date+'T00:00:00Z');
    return{md:(d.getUTCMonth()+1)+'/'+d.getUTCDate(),weekday:jpWeek[d.getUTCDay()],dow:d.getUTCDay(),weekend:d.getUTCDay()===0||d.getUTCDay()===6};
  }
  function nthMonday(y,m,n){
    const d=new Date(Date.UTC(y,m-1,1)),first=1+((8-d.getUTCDay())%7);
    return y+'-'+pad(m)+'-'+pad(first+(n-1)*7);
  }
  function japanHolidays(y){
    if(holidayCache.has(y))return holidayCache.get(y);
    const s=new Set(),add=(m,d)=>s.add(y+'-'+pad(m)+'-'+pad(d));
    add(1,1);s.add(nthMonday(y,1,2));add(2,11);if(y>=2020)add(2,23);
    add(3,Math.floor(20.8431+0.242194*(y-1980)-Math.floor((y-1980)/4)));
    add(4,29);add(5,3);add(5,4);add(5,5);s.add(nthMonday(y,7,3));add(8,11);s.add(nthMonday(y,9,3));
    add(9,Math.floor(23.2488+0.242194*(y-1980)-Math.floor((y-1980)/4)));
    s.add(nthMonday(y,10,2));add(11,3);add(11,23);
    for(const h of [...s].sort()){
      const d=new Date(h+'T00:00:00Z');
      if(d.getUTCDay()===0){let x=addUtcDays(h,1);while(s.has(x))x=addUtcDays(x,1);s.add(x)}
    }
    let changed=true;
    while(changed){
      changed=false;
      for(let d=new Date(Date.UTC(y,0,2));d<=new Date(Date.UTC(y,11,30));d.setUTCDate(d.getUTCDate()+1)){
        const x=utcYmd(d);
        if(s.has(x)||d.getUTCDay()===0)continue;
        if(s.has(addUtcDays(x,-1))&&s.has(addUtcDays(x,1))){s.add(x);changed=true}
      }
    }
    holidayCache.set(y,s);return s;
  }
  function isHoliday(date){return japanHolidays(Number(date.slice(0,4))).has(date)}
  function visibleInPeriod(s,start){return s.is_active&&(!s.retirement_date||String(s.retirement_date).slice(0,10)>=start)}
  function afterRetirement(sid,date){
    const s=state.staff.find(x=>x.id===sid),r=s?.retirement_date?String(s.retirement_date).slice(0,10):'';
    return !!r&&date>r;
  }
  function getCell(sid,date){
    const k=key(sid,date);let c=state.shifts.get(k);
    if(!c){c={owner_id:user.id,staff_id:sid,plan_month:state.planMonth,shift_date:date,assignment:'off',lock_type:'auto',exists:false};state.shifts.set(k,c)}
    return c;
  }
  function isWork(sid,date){return !afterRetirement(sid,date)&&getCell(sid,date).assignment==='work'}
  function isPaid(sid,date){return !afterRetirement(sid,date)&&getCell(sid,date).assignment==='paid'}
  function assignedCount(date){let x=0;for(const s of state.staff)if(isWork(s.id,date))x++;return x}
  function assignedForStaff(sid){let x=0;for(const d of state.dates)if(isWork(sid,d))x++;return x}
  function paidForStaff(sid){let x=0;for(const d of state.dates)if(isPaid(sid,d))x++;return x}
  function creditedForStaff(sid){return assignedForStaff(sid)+paidForStaff(sid)}
  function targetDays(sid){
    const s=state.staff.find(x=>x.id===sid);
    if(!s)return 0;
    const base=Math.max(0,Math.round(n(s.default_work_days)));
    const available=state.dates.filter(d=>!afterRetirement(sid,d)).length;
    return Math.min(base,available);
  }
  function dayAllowed(sid,date){
    if(afterRetirement(sid,date))return false;
    const s=state.staff.find(x=>x.id===sid),inf=dateInfo(date);
    if(s?.no_weekends_holidays&&(inf.weekend||isHoliday(date)))return false;
    if(s?.no_sundays&&inf.dow===0)return false;
    return true;
  }
  function projectedStreak(sid,date){
    const i=state.dates.indexOf(date);if(i<0)return 1;
    let l=0,r=0;
    for(let x=i-1;x>=0&&isWork(sid,state.dates[x]);x--)l++;
    for(let x=i+1;x<state.dates.length&&isWork(sid,state.dates[x]);x++)r++;
    return l+1+r;
  }
  function autoAllowed(sid,date){
    if(!dayAllowed(sid,date))return false;
    const s=state.staff.find(x=>x.id===sid);
    if(s?.no_four_consecutive&&projectedStreak(sid,date)>=4)return false;
    return true;
  }
  function maxConsecutive(){
    let best=0;
    for(const s of state.staff){let run=0;for(const d of state.dates){if(isWork(s.id,d)){run++;best=Math.max(best,run)}else run=0}}
    return best;
  }
  function weekendCount(sid){let x=0;for(const d of state.dates)if(dateInfo(d).weekend&&isWork(sid,d))x++;return x}
  function stableTie(sid,date){let h=0;for(const ch of sid+date)h=(h*31+ch.charCodeAt(0))%997;return h/997}
  function conditionText(s){
    const a=[];
    if(s.no_weekends_holidays)a.push('土日祝不可');else if(s.no_sundays)a.push('日曜不可');
    if(s.no_four_consecutive)a.push('4連勤不可');
    return a.length?a.join('・'):'なし';
  }
  function setNotice(text,kind=''){
    const el=$('shiftNotice');if(!el)return;
    el.textContent=text;el.className='shift-notice'+(kind?' '+kind:'');
  }
  function setBusy(on,label='処理中…'){
    const a=$('shiftAutoBtn'),r=$('shiftReloadBtn'),c=$('shiftClearBtn');
    if(a){a.disabled=on;a.textContent=on?label:'自動作成'}
    if(r)r.disabled=on;if(c)c.disabled=on;
  }

  async function load(force=false){
    if(!user?.id)return;
    const ym=$('shiftMonth').value||companyMonthToday();
    if(state.loaded&&!force&&state.month===ym){render();return}
    setBusy(true,'読込中…');setNotice('CSシフトを読み込んでいます。');
    try{
      const p=periodForMonth(ym);
      const [slist,rows]=await Promise.all([
        rest('cs_staff',`owner_id=eq.${user.id}&select=*&order=display_order.asc,name.asc`),
        rest('cs_daily_shifts',`owner_id=eq.${user.id}&shift_date=gte.${p.start}&shift_date=lte.${p.end}&select=*`)
      ]);
      staff=slist||[];
      Object.assign(state,{month:ym,planMonth:p.planMonth,start:p.start,end:p.end,dates:p.dates,staff:(slist||[]).filter(s=>visibleInPeriod(s,p.start)),shifts:new Map(),loaded:true});
      for(const row of rows||[])state.shifts.set(key(row.staff_id,row.shift_date),{...row,exists:true});
      render();
      setNotice((rows||[]).length?`保存済みシフト ${rows.length}セルを読み込みました。`:'まだシフトは作成されていません。休み希望があれば先に固定してください。',(rows||[]).length?'good':'');
    }catch(e){console.error(e);setNotice('読み込みに失敗しました: '+(e?.message||e),'bad')}
    finally{setBusy(false)}
  }

  function metrics(){
    let assignedDays=0,target=0,locked=0;
    for(const s of state.staff){
      assignedDays+=creditedForStaff(s.id);target+=targetDays(s.id);
      for(const d of state.dates)if(getCell(s.id,d).lock_type!=='auto')locked++;
    }
    const counts=state.dates.map(assignedCount);
    return{assignedDays,target,locked,maxStreak:maxConsecutive(),min:counts.length?Math.min(...counts):0,max:counts.length?Math.max(...counts):0};
  }
  function render(){
    if(!state.loaded)return;
    $('shiftPeriod').textContent=state.start.slice(5).replace('-','/')+' ～ '+state.end.slice(5).replace('-','/');
    const m=metrics();
    $('shiftAssignedDays').textContent=m.assignedDays+'日';$('shiftTargetDays').textContent=m.target+'日';
    $('shiftLockedCount').textContent=m.locked+'件';$('shiftMaxStreak').textContent=m.maxStreak+'日';
    $('shiftMinPeople').textContent=m.min+'人';$('shiftMaxPeople').textContent=m.max+'人';

    const head=$('shiftHead');head.innerHTML='';
    const tr=document.createElement('tr');
    tr.innerHTML='<th>氏名</th><th>区分</th><th>日数<br>実/目</th>';
    for(const d of state.dates){
      const inf=dateInfo(d),holiday=isHoliday(d),th=document.createElement('th');
      th.title=d+' '+inf.weekday+(holiday?' 祝':'')+' / 配置 '+assignedCount(d)+'人';
      th.innerHTML='<div class="shift-date">'+inf.md+'</div><div class="shift-week '+(inf.weekend||holiday?'weekend':'')+'">'+(holiday?'祝':inf.weekday)+'</div><div class="shift-count">配'+assignedCount(d)+'</div>';
      tr.appendChild(th);
    }
    head.appendChild(tr);

    const body=$('shiftBody');body.innerHTML='';
    for(const s of state.staff){
      const actual=creditedForStaff(s.id),target=targetDays(s.id),row=document.createElement('tr');
      row.innerHTML='<td><b>'+esc(s.name)+'</b><div class="staff-condition">'+esc(conditionText(s))+'</div></td><td>'+esc(s.employment_type||'')+'</td><td class="'+(actual===target?'':'shift-days-warn')+'">'+actual+'/'+target+'</td>';
      for(const d of state.dates){
        const td=document.createElement('td'),b=document.createElement('button');b.type='button';
        if(afterRetirement(s.id,d)){b.className='shift-cell retired';b.textContent='退';b.disabled=true}
        else{
          const c=getCell(s.id,d);
          b.className='shift-cell '+cellClass(c);b.textContent=cellText(c);
          b.title=s.name+' / '+d+' / '+cellMode(c);
          b.onclick=()=>cycleCell(s.id,d);
        }
        td.appendChild(b);row.appendChild(td);
      }
      body.appendChild(row);
    }
  }
  function cellText(c){
    if(!c.exists&&c.lock_type==='auto')return '―';
    if(c.lock_type==='manual_off')return '休★';
    if(c.lock_type==='manual_work')return '出★';
    if(c.lock_type==='manual_paid')return '有';
    return c.assignment==='work'?'出':'休';
  }
  function cellClass(c){
    if(!c.exists&&c.lock_type==='auto')return 'unset';
    if(c.lock_type==='manual_off')return 'manual-off';
    if(c.lock_type==='manual_work')return 'manual-work';
    if(c.lock_type==='manual_paid')return 'manual-paid';
    return c.assignment==='work'?'work':'off';
  }
  function cellMode(c){
    if(c.lock_type==='manual_off')return '休み固定';
    if(c.lock_type==='manual_work')return '出勤固定';
    if(c.lock_type==='manual_paid')return '有給';
    return c.exists?'自動':'未作成';
  }
  async function saveCells(cells){
    if(!cells.length)return;
    const now=new Date().toISOString();
    const rows=cells.map(c=>({owner_id:user.id,staff_id:c.staff_id,plan_month:state.planMonth,shift_date:c.shift_date,assignment:c.assignment,lock_type:c.lock_type,updated_at:now}));
    for(let i=0;i<rows.length;i+=300){
      await rest('cs_daily_shifts','on_conflict=owner_id%2Cstaff_id%2Cshift_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rows.slice(i,i+300))});
    }
    for(const c of cells)c.exists=true;
  }
  async function cycleCell(sid,date){
    const c=getCell(sid,date),before={...c};
    try{
      if(c.lock_type==='manual_paid'){
        await rest('cs_daily_shifts',`owner_id=eq.${user.id}&staff_id=eq.${sid}&shift_date=eq.${date}`,{method:'DELETE'});
        state.shifts.delete(key(sid,date));render();setNotice('未作成状態に戻しました。','good');return;
      }
      if(c.lock_type==='auto'){c.lock_type='manual_off';c.assignment='off'}
      else if(c.lock_type==='manual_off'){c.lock_type='manual_work';c.assignment='work'}
      else if(c.lock_type==='manual_work'){c.lock_type='manual_paid';c.assignment='paid'}
      c.exists=true;c.plan_month=state.planMonth;c.updated_at=new Date().toISOString();
      render();await saveCells([c]);setNotice('固定を保存しました。','good');
    }catch(e){Object.assign(c,before);render();setNotice('固定の保存に失敗しました: '+e.message,'bad')}
  }

  function profileData(){
    return state.staff.map(s=>{
      const target=targetDays(s.id),manualWork=state.dates.filter(d=>getCell(s.id,d).lock_type==='manual_work').length,
        manualPaid=state.dates.filter(d=>getCell(s.id,d).lock_type==='manual_paid').length;
      return{s,target,remaining:Math.max(0,target-manualWork-manualPaid)};
    }).filter(x=>x.target>0||x.remaining>0);
  }
  function feasibleDates(p){
    return state.dates.filter(d=>{
      const c=getCell(p.s.id,d);
      return c.lock_type==='auto'&&c.assignment!=='work'&&autoAllowed(p.s.id,d);
    });
  }
  function chooseProfile(profiles){
    const candidates=profiles.filter(p=>p.remaining>0).map(p=>{
      const avail=feasibleDates(p).length;
      return{p,avail,urg:avail? p.remaining/avail : Infinity};
    }).filter(x=>x.avail>0);
    candidates.sort((a,b)=>(b.urg-a.urg)||(b.p.remaining-a.p.remaining)||a.p.s.display_order-b.p.s.display_order);
    return candidates[0]?.p||null;
  }
  function chooseDate(p){
    const dates=feasibleDates(p),weekends=weekendCount(p.s.id);
    let best=null,bestScore=Infinity;
    for(const d of dates){
      const inf=dateInfo(d),streak=projectedStreak(p.s.id,d);
      let score=assignedCount(d)*1000 + streak*25 + (inf.weekend?weekends*35:0) + stableTie(p.s.id,d);
      if(streak>=6)score+=5000;else if(streak>=5)score+=1000;
      if(score<bestScore){bestScore=score;best=d}
    }
    return best;
  }
  async function generate(){
    if(!state.loaded)await load(true);
    setBusy(true,'自動作成中…');setNotice('固定休・固定出勤と勤務条件を保持して自動配置しています。');
    try{
      for(const s of state.staff)for(const d of state.dates){
        if(afterRetirement(s.id,d))continue;
        const c=getCell(s.id,d);
        if(c.lock_type==='auto'){c.assignment='off';c.exists=true;c.plan_month=state.planMonth}
      }
      const profiles=profileData();
      let guard=0;
      while(guard++<5000){
        const p=chooseProfile(profiles);if(!p)break;
        const d=chooseDate(p);if(!d)break;
        const c=getCell(p.s.id,d);c.assignment='work';c.exists=true;p.remaining--;
      }
      const all=[];
      for(const s of state.staff)for(const d of state.dates)if(!afterRetirement(s.id,d))all.push(getCell(s.id,d));
      await saveCells(all);render();
      const unmet=profiles.filter(p=>p.remaining>0);
      if(unmet.length)setNotice('自動作成は保存しましたが、勤務条件または固定休により '+unmet.length+'名が標準出勤日数に届いていません。条件違反はさせていません。','bad');
      else setNotice('自動作成・保存完了。標準出勤日数と勤務条件を反映し、日別人数をできるだけ均等に配置しました。','good');
    }catch(e){console.error(e);setNotice('自動作成に失敗しました: '+(e?.message||e),'bad')}
    finally{setBusy(false)}
  }
  async function clearAll(){
    if(!state.loaded)return;
    if(!confirm('この月度のCSシフトをすべてクリアします。休み固定・出勤固定・有給も削除されます。よろしいですか？'))return;
    setBusy(true,'クリア中…');
    try{
      await rest('cs_daily_shifts',`owner_id=eq.${user.id}&shift_date=gte.${state.start}&shift_date=lte.${state.end}`,{method:'DELETE'});
      state.shifts=new Map();render();setNotice('この月度のシフトを全クリアしました。','good');
    }catch(e){setNotice('クリアに失敗しました: '+e.message,'bad')}
    finally{setBusy(false)}
  }
  function navMonth(delta){$('shiftMonth').value=shiftYm($('shiftMonth').value||companyMonthToday(),delta);state.loaded=false;load(true)}

  $('shiftMonth').value=companyMonthToday();
  $('shiftMonth').onchange=()=>{state.loaded=false;load(true)};
  $('shiftPrevMonth').onclick=()=>navMonth(-1);
  $('shiftNextMonth').onclick=()=>navMonth(1);
  $('shiftReloadBtn').onclick=()=>load(true);
  $('shiftAutoBtn').onclick=generate;
  $('shiftClearBtn').onclick=clearAll;

  window.csShiftLoad=load;
  window.csShiftInvalidate=()=>{state.loaded=false};
})();