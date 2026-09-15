(function(){
  const state={
    month:'', planMonth:'', start:'', end:'', dates:[], staff:[], defaults:[], staffing:[],
    forecast:new Map(), shifts:new Map(), targetOplh:32, bufferPct:0, planSource:'default', loaded:false
  };
  const gid=id=>document.getElementById(id);
  const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
  const key=(staffId,date)=>staffId+'|'+date;
  const pad=v=>String(v).padStart(2,'0');
  const jpWeek=['日','月','火','水','木','金','土'];

  function utcYmd(d){return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())}
  function periodForMonth(ym){
    const [y,m]=String(ym).split('-').map(Number);
    const start=new Date(Date.UTC(y,m-2,21)),end=new Date(Date.UTC(y,m-1,20));
    const dates=[];
    for(let d=new Date(start);d<=end;d.setUTCDate(d.getUTCDate()+1))dates.push(utcYmd(d));
    return{start:utcYmd(start),end:utcYmd(end),dates,planMonth:`${y}-${pad(m)}-01`};
  }
  function dateInfo(date){const d=new Date(date+'T00:00:00Z');return{md:(d.getUTCMonth()+1)+'/'+d.getUTCDate(),weekday:jpWeek[d.getUTCDay()],weekend:d.getUTCDay()===0||d.getUTCDay()===6}}
  function targetDays(staffId){
    const r=state.staffing.find(x=>x.staff_id===staffId);if(!r||!r.included||!r.start_time||!r.end_time)return 0;
    return Math.max(0,Math.round(num(r.work_days)));
  }
  function shipHoursDay(staffId){
    const r=state.staffing.find(x=>x.staff_id===staffId);if(!r||!r.included)return 0;
    return calcSchedule({...r,work_days:1}).shipDay;
  }
  function requiredPeople(date){return Math.max(0,Math.round(num(state.forecast.get(date)?.required_people)))}
  function requiredHours(date){const f=state.forecast.get(date);if(!f||state.targetOplh<=0)return 0;return num(f.final_forecast)/state.targetOplh*(1+state.bufferPct/100)}
  function getCell(staffId,date){
    const k=key(staffId,date);let c=state.shifts.get(k);
    if(!c){c={owner_id:user.id,staff_id:staffId,plan_month:state.planMonth,shift_date:date,assignment:'off',lock_type:'auto',exists:false};state.shifts.set(k,c)}
    return c;
  }
  function isWork(staffId,date){return getCell(staffId,date).assignment==='work'}
  function assignedCount(date){let c=0;for(const s of state.staff)if(isWork(s.id,date))c++;return c}
  function assignedHours(date){let h=0;for(const s of state.staff)if(isWork(s.id,date))h+=shipHoursDay(s.id);return h}
  function assignedForStaff(staffId){let c=0;for(const d of state.dates)if(isWork(staffId,d))c++;return c}
  function weekendForStaff(staffId){let c=0;for(const d of state.dates)if(dateInfo(d).weekend&&isWork(staffId,d))c++;return c}
  function projectedStreak(staffId,date){
    const i=state.dates.indexOf(date);if(i<0)return 1;let left=0,right=0;
    for(let x=i-1;x>=0&&isWork(staffId,state.dates[x]);x--)left++;
    for(let x=i+1;x<state.dates.length&&isWork(staffId,state.dates[x]);x++)right++;
    return left+1+right;
  }
  function maxConsecutive(){
    let max=0;
    for(const s of state.staff){let cur=0;for(const d of state.dates){if(isWork(s.id,d)){cur++;max=Math.max(max,cur)}else cur=0}}
    return max;
  }
  function stableTie(staffId,date){let h=0;const x=staffId+date;for(let i=0;i<x.length;i++)h=(h*31+x.charCodeAt(i))%997;return h/997}

  function buildUI(){
    const tabs=document.querySelector('.tabs');if(!tabs||gid('shiftTab'))return;
    const btn=document.createElement('button');btn.className='tab';btn.dataset.tab='shift';btn.textContent='シフト自動作成';tabs.appendChild(btn);
    const sec=document.createElement('section');sec.id='shiftTab';sec.className='hidden';
    sec.innerHTML=`
      <section class="panel">
        <div class="head">
          <div><b>シフト自動作成</b><div class="small">休み希望だけ固定し、365日出荷予測・出勤日数・出荷人時から残りを自動配置します。</div></div>
          <div class="toolbar"><button id="shiftRefreshBtn">再読込</button><button class="primary" id="shiftAutoBtn">自動作成</button></div>
        </div>
        <div class="shift-controls">
          <div><label>対象月度</label><input id="shiftMonth" type="month"></div>
          <div><label>対象期間</label><div id="shiftPeriod" class="readonly-box">—</div></div>
          <div><label>使用OPLH</label><div id="shiftOplh" class="readonly-box">—</div></div>
          <div><label>操作</label><div class="small shift-help">セルクリック：自動 → 休み固定 → 出勤固定 → 自動</div></div>
        </div>
        <div class="shift-kpis">
          <div class="kpi"><span class="lab">必要人数不足日</span><b id="shiftShortDays">—</b><div class="hint">人数または人時が不足する日</div></div>
          <div class="kpi"><span class="lab">配置出勤日数</span><b id="shiftAssignedDays">—</b><div class="hint">全員の出勤セル合計</div></div>
          <div class="kpi"><span class="lab">目標出勤日数</span><b id="shiftTargetDays">—</b><div class="hint">月間人時設定の合計</div></div>
          <div class="kpi"><span class="lab">手動固定</span><b id="shiftLockedCount">—</b><div class="hint">休み希望・出勤固定</div></div>
          <div class="kpi"><span class="lab">最大連勤</span><b id="shiftMaxStreak">—</b><div class="hint">7日以上は要確認</div></div>
        </div>
        <div id="shiftNotice" class="notice" style="margin-top:10px">シフトを読み込んでいます。</div>
        <div class="shift-legend small"><span class="legend auto-work">出＝自動出勤</span><span class="legend auto-off">休＝自動休み</span><span class="legend manual-off">休★＝休み固定</span><span class="legend manual-work">出★＝出勤固定</span><span class="legend unset">―＝未作成</span></div>
      </section>
      <section class="panel section">
        <div class="head"><div><b>月度シフト表</b><div class="small">縦＝物流部全員、横＝21日～翌20日。固定セルは自動作成しても変更されません。</div></div></div>
        <div class="tablewrap shift-tablewrap"><table id="shiftTable" class="shift-table"><thead id="shiftHead"></thead><tbody id="shiftBody"></tbody></table></div>
      </section>`;
    gid('masterTab').insertAdjacentElement('afterend',sec);
    gid('shiftMonth').value=gid('month')?.value||new Date().toISOString().slice(0,7);
    gid('shiftMonth').onchange=()=>loadShiftData(true);
    gid('shiftRefreshBtn').onclick=()=>loadShiftData(true);
    gid('shiftAutoBtn').onclick=generateSchedule;
    bindTabs();
  }

  function bindTabs(){
    document.querySelectorAll('.tab').forEach(b=>b.onclick=async()=>{
      document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));
      const tab=b.dataset.tab;
      gid('monthlyTab').classList.toggle('hidden',tab!=='monthly');
      gid('masterTab').classList.toggle('hidden',tab!=='master');
      gid('shiftTab').classList.toggle('hidden',tab!=='shift');
      if(tab==='shift'){
        if(!state.loaded&&gid('month')?.value)gid('shiftMonth').value=gid('month').value;
        await loadShiftData(false);
      }
    })
  }

  function setNotice(text,type='warn'){
    const el=gid('shiftNotice');if(!el)return;el.textContent=text;el.className='notice shift-note '+type;
  }
  function setBusy(on,label='処理中…'){
    const b=gid('shiftAutoBtn'),r=gid('shiftRefreshBtn');if(b){b.disabled=on;b.textContent=on?label:'自動作成'}if(r)r.disabled=on;
  }

  async function ensureStaffing(planMonth,slist,dlist){
    let rows=await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&plan_month=eq.${planMonth}&select=*`);
    const missing=slist.filter(s=>!(rows||[]).some(r=>r.staff_id===s.id));
    if(!missing.length)return rows||[];
    let prev=[];try{prev=await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&plan_month=lt.${planMonth}&select=*&order=plan_month.desc`)}catch{}
    const inserts=missing.map(s=>{
      const def=dlist.find(d=>d.staff_id===s.id),p=(prev||[]).find(x=>x.staff_id===s.id);
      return{owner_id:user.id,staff_id:s.id,plan_month:planMonth,work_days:p?num(p.work_days):num(def?.default_work_days),included:p?p.included:!!def,start_time:p?.start_time||def?.start_time||null,end_time:p?.end_time||def?.end_time||null,break_start:p?.break_start??def?.break_start??null,break_end:p?.break_end??def?.break_end??null};
    });
    if(inserts.length)await rest('logistics_monthly_staffing','',{method:'POST',body:JSON.stringify(inserts)});
    return await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&plan_month=eq.${planMonth}&select=*`)
  }

  async function loadShiftData(force=false){
    if(!user?.id||!gid('shiftMonth'))return;
    const ym=gid('shiftMonth').value||new Date().toISOString().slice(0,7);
    if(state.loaded&&!force&&state.month===ym){renderShift();return}
    setBusy(true,'読込中…');setNotice('シフト・出荷予測・月間人時を読み込んでいます。','warn');
    try{
      const period=periodForMonth(ym);
      const [slist,dlist,forecasts,existing,exactPlan,prevPlan]=await Promise.all([
        rest('logistics_staff',`owner_id=eq.${user.id}&is_active=eq.true&select=*&order=name.asc`),
        rest('logistics_staff_defaults',`owner_id=eq.${user.id}&select=*`),
        rest('forecast365_daily',`owner_id=eq.${user.id}&forecast_date=gte.${period.start}&forecast_date=lte.${period.end}&select=forecast_date,weekday,event_type,final_forecast,required_people&order=forecast_date.asc`),
        rest('logistics_daily_shifts',`owner_id=eq.${user.id}&shift_date=gte.${period.start}&shift_date=lte.${period.end}&select=*`),
        rest('logistics_monthly_plans',`owner_id=eq.${user.id}&plan_month=eq.${period.planMonth}&select=*`),
        rest('logistics_monthly_plans',`owner_id=eq.${user.id}&plan_month=lt.${period.planMonth}&select=*&order=plan_month.desc&limit=1`)
      ]);
      const active=(slist||[]).filter(x=>!String(x.name||'').startsWith('__'));
      const staffing=await ensureStaffing(period.planMonth,active,dlist||[]);
      const plan=exactPlan?.[0]||prevPlan?.[0];
      state.month=ym;state.planMonth=period.planMonth;state.start=period.start;state.end=period.end;state.dates=period.dates;
      state.staff=active;state.defaults=dlist||[];state.staffing=staffing||[];state.forecast=new Map((forecasts||[]).map(x=>[x.forecast_date,x]));
      state.shifts=new Map();
      for(const row of existing||[])state.shifts.set(key(row.staff_id,row.shift_date),{...row,exists:true});
      state.targetOplh=num(plan?.target_oplh)||32;state.bufferPct=num(plan?.safety_buffer_pct);state.planSource=exactPlan?.[0]?'current':(prevPlan?.[0]?'previous':'default');state.loaded=true;
      renderShift();
      const saved=(existing||[]).length;
      setNotice(saved?`保存済みシフト ${saved}セルを読み込みました。休み希望を固定してから「自動作成」を押すと固定部分を守って再配置します。`:'まだシフトは作成されていません。休み希望をセルで固定してから「自動作成」を押してください。',saved?'good':'warn');
    }catch(e){console.error(e);setNotice('シフトの読み込みに失敗しました: '+(e?.message||e),'bad')}
    finally{setBusy(false)}
  }

  function renderShift(){
    if(!state.loaded)return;
    gid('shiftPeriod').textContent=`${state.start.slice(5).replace('-','/')} ～ ${state.end.slice(5).replace('-','/')}`;
    const src=state.planSource==='current'?'当月設定':state.planSource==='previous'?'直近月設定を使用':'既定値';
    gid('shiftOplh').textContent=`${state.targetOplh.toFixed(2)}（${src}）`;
    const metrics=calcMetrics();
    gid('shiftShortDays').textContent=metrics.shortDays+'日';
    gid('shiftAssignedDays').textContent=metrics.assignedDays+'日';
    gid('shiftTargetDays').textContent=metrics.targetDays+'日';
    gid('shiftLockedCount').textContent=metrics.locked+'件';
    gid('shiftMaxStreak').textContent=metrics.maxStreak+'日';

    const head=gid('shiftHead');head.innerHTML='';const tr=document.createElement('tr');
    tr.innerHTML='<th class="shift-sticky shift-name-col">氏名</th><th class="shift-type-col">区分</th><th class="shift-days-col">出勤<br>実/目</th>';
    for(const d of state.dates){
      const inf=dateInfo(d),req=requiredPeople(d),ac=assignedCount(d),rh=requiredHours(d),ah=assignedHours(d),bad=ac<req||ah+0.01<rh,f=state.forecast.get(d);
      const th=document.createElement('th');th.className='shift-day-head '+(bad?'short':'ok');
      th.title=`${d} ${inf.weekday} / ${f?.event_type||'通常'} / 必要 ${req}人・${rh.toFixed(1)}h / 配置 ${ac}人・${ah.toFixed(1)}h`;
      th.innerHTML=`<div class="shift-date">${inf.md}</div><div class="shift-week ${inf.weekend?'weekend':''}">${inf.weekday}</div><div class="shift-need">必${req}</div><div class="shift-assign">配${ac}</div>`;tr.appendChild(th)
    }
    head.appendChild(tr);

    const body=gid('shiftBody');body.innerHTML='';
    for(const s of state.staff){
      const target=targetDays(s.id),actual=assignedForStaff(s.id),staffing=state.staffing.find(x=>x.staff_id===s.id),trb=document.createElement('tr');
      if(!staffing?.included)trb.classList.add('shift-row-off');
      const name=document.createElement('td');name.className='shift-sticky shift-name-col';name.innerHTML=`<b>${esc(s.name)}</b>`;trb.appendChild(name);
      const type=document.createElement('td');type.className='shift-type-col';type.textContent=s.employment_type||'';trb.appendChild(type);
      const days=document.createElement('td');days.className='shift-days-col num '+(actual===target?'':'shift-days-warn');days.textContent=`${actual}/${target}`;trb.appendChild(days);
      for(const d of state.dates){
        const c=getCell(s.id,d),td=document.createElement('td');td.className='shift-cell-td';
        const b=document.createElement('button');b.type='button';b.className='shift-cell '+cellClass(c);b.dataset.staff=s.id;b.dataset.date=d;b.textContent=cellText(c);b.title=cellTitle(c,d,s.name);b.onclick=()=>cycleCell(s.id,d);td.appendChild(b);trb.appendChild(td)
      }
      body.appendChild(trb)
    }
  }

  function cellText(c){if(!c.exists&&c.lock_type==='auto')return'―';if(c.lock_type==='manual_off')return'休★';if(c.lock_type==='manual_work')return'出★';return c.assignment==='work'?'出':'休'}
  function cellClass(c){if(!c.exists&&c.lock_type==='auto')return'shift-unset';if(c.lock_type==='manual_off')return'shift-manual-off';if(c.lock_type==='manual_work')return'shift-manual-work';return c.assignment==='work'?'shift-work':'shift-off'}
  function cellTitle(c,date,name){const mode=c.lock_type==='manual_off'?'休み固定':c.lock_type==='manual_work'?'出勤固定':(!c.exists?'未作成':'自動');return`${name} / ${date} / ${mode}。クリックで切替`}

  async function cycleCell(staffId,date){
    const c=getCell(staffId,date),before={...c};
    if(c.lock_type==='auto'){c.lock_type='manual_off';c.assignment='off'}
    else if(c.lock_type==='manual_off'){c.lock_type='manual_work';c.assignment='work'}
    else{c.lock_type='auto';c.assignment='work'}
    c.exists=true;c.plan_month=state.planMonth;c.updated_at=new Date().toISOString();renderShift();
    try{await saveCells([c]);setNotice('手動固定を保存しました。','good')}
    catch(e){Object.assign(c,before);renderShift();setNotice('固定の保存に失敗しました: '+e.message,'bad')}
  }

  async function saveCells(cells){
    if(!cells.length)return;const rows=cells.map(c=>({owner_id:user.id,staff_id:c.staff_id,plan_month:state.planMonth,shift_date:c.shift_date,assignment:c.assignment,lock_type:c.lock_type,updated_at:new Date().toISOString()}));
    for(let i=0;i<rows.length;i+=300){await rest('logistics_daily_shifts','on_conflict=owner_id%2Cstaff_id%2Cshift_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(rows.slice(i,i+300))})}
    for(const c of cells)c.exists=true;
  }

  function calcMetrics(){
    let shortDays=0,assignedDays=0,targetTotal=0,locked=0;
    for(const s of state.staff){targetTotal+=targetDays(s.id);assignedDays+=assignedForStaff(s.id);for(const d of state.dates)if(getCell(s.id,d).lock_type!=='auto')locked++}
    for(const d of state.dates)if(assignedCount(d)<requiredPeople(d)||assignedHours(d)+0.01<requiredHours(d))shortDays++;
    return{shortDays,assignedDays,targetDays:targetTotal,locked,maxStreak:maxConsecutive()}
  }

  function profileData(){
    return state.staff.map(s=>{
      const target=targetDays(s.id),manualWork=state.dates.filter(d=>{const c=getCell(s.id,d);return c.lock_type==='manual_work'}).length;
      const autoAvailable=state.dates.filter(d=>getCell(s.id,d).lock_type==='auto').length;
      return{s,target,manualWork,remaining:Math.max(0,target-manualWork),autoAvailable};
    }).filter(p=>p.target>0||p.manualWork>0)
  }

  function candidateStaff(date,profiles){
    const candidates=[];
    for(const p of profiles){
      if(p.remaining<=0)continue;const c=getCell(p.s.id,date);if(c.lock_type!=='auto'||c.assignment==='work')continue;
      const availableLeft=state.dates.filter(d=>{const x=getCell(p.s.id,d);return x.lock_type==='auto'&&x.assignment!=='work'}).length;
      const urgency=p.remaining/Math.max(1,availableLeft),streak=projectedStreak(p.s.id,date),weekends=weekendForStaff(p.s.id),actual=assignedForStaff(p.s.id);
      let score=urgency*10000+p.remaining*80-actual*5-weekends*(dateInfo(date).weekend?60:0)+stableTie(p.s.id,date);
      if(streak>6)score-=1000000;else if(streak>=5)score-=streak*150;
      candidates.push({p,score});
    }
    return candidates.sort((a,b)=>b.score-a.score)
  }

  function chooseFillDate(p){
    const options=[];
    for(const d of state.dates){const c=getCell(p.s.id,d);if(c.lock_type!=='auto'||c.assignment==='work')continue;
      const req=requiredPeople(d),assigned=assignedCount(d),gap=req-assigned,streak=projectedStreak(p.s.id,d),weekends=weekendForStaff(p.s.id),inf=dateInfo(d);
      let score=gap*10000+req*100-assigned*20-weekends*(inf.weekend?80:0)+stableTie(p.s.id,d);
      if(streak>6)score-=1000000;else if(streak>=5)score-=streak*200;
      options.push({d,score})}
    options.sort((a,b)=>b.score-a.score);return options[0]?.d||null
  }

  async function generateSchedule(){
    if(!state.loaded){await loadShiftData(true);if(!state.loaded)return}
    setBusy(true,'自動作成中…');setNotice('固定セルを保持してシフトを再計算しています。','warn');
    try{
      for(const s of state.staff)for(const d of state.dates){const c=getCell(s.id,d);if(c.lock_type==='auto'){c.assignment='off';c.exists=true;c.plan_month=state.planMonth}}
      const profiles=profileData();
      let guard=0;
      while(guard++<5000){
        const deficits=state.dates.map(d=>({d,gap:requiredPeople(d)-assignedCount(d),hourGap:requiredHours(d)-assignedHours(d)})).filter(x=>x.gap>0||x.hourGap>0.01).sort((a,b)=>(b.gap-a.gap)||(b.hourGap-a.hourGap)||requiredPeople(b.d)-requiredPeople(a.d));
        if(!deficits.length)break;let placed=false;
        for(const def of deficits){const cand=candidateStaff(def.d,profiles);if(!cand.length)continue;const pick=cand[0].p,c=getCell(pick.s.id,def.d);c.assignment='work';c.exists=true;pick.remaining--;placed=true;break}
        if(!placed)break;
      }
      profiles.sort((a,b)=>(b.remaining-a.remaining)||((a.autoAvailable-a.target)-(b.autoAvailable-b.target)));
      for(const p of profiles){while(p.remaining>0){const d=chooseFillDate(p);if(!d)break;const c=getCell(p.s.id,d);c.assignment='work';c.exists=true;p.remaining--}}
      const all=[];for(const s of state.staff)for(const d of state.dates)all.push(getCell(s.id,d));
      await saveCells(all);renderShift();
      const m=calcMetrics(),unmet=profiles.filter(p=>p.remaining>0).length;
      if(unmet)setNotice(`自動作成は保存しましたが、休み固定が多い等の理由で ${unmet}名が目標出勤日数に届いていません。表の「実/目」を確認してください。`,'bad');
      else if(m.shortDays)setNotice(`自動作成・保存完了。出勤日数は配置しましたが、必要人数または必要人時が不足する日が ${m.shortDays}日あります。赤い日付を確認してください。`,'warn');
      else setNotice('自動作成・保存完了。月間出勤日数、日別必要人数、必要人時を満たしています。','good');
    }catch(e){console.error(e);setNotice('自動作成または保存に失敗しました: '+(e?.message||e),'bad')}
    finally{setBusy(false)}
  }

  buildUI();
})();
