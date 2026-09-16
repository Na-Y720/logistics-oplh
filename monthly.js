(()=>{
  const closeMonthKey=dateStr=>{
    const [y,m,d]=String(dateStr).split('-').map(Number);
    if(d<=20)return `${y}-${String(m).padStart(2,'0')}`;
    const next=new Date(Date.UTC(y,m,1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}`;
  };
  const closeMonthLabel=key=>{const [y,m]=key.split('-').map(Number);return `${y}年${m}月度`};
  const periodLabel=list=>list.length?`${list[0].forecast_date.replaceAll('-','/')} ～ ${list.at(-1).forecast_date.replaceAll('-','/')}`:'—';
  const toMinutes=value=>{
    if(!value)return null;
    const p=String(value).split(':').map(Number);
    if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))return null;
    return p[0]*60+p[1]+(Number.isFinite(p[2])?p[2]/60:0);
  };
  const formatTime=minutes=>{
    if(!Number.isFinite(minutes))return '—';
    let n=Math.round(minutes);const h=Math.floor(n/60)%24,m=n%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  };
  const summarize=list=>{
    const actual=list.filter(r=>r.actual_total!=null);
    const completed=list.filter(r=>toMinutes(r.completed_at)!=null);
    const actualTotal=actual.reduce((z,r)=>z+Number(r.actual_total||0),0);
    const outlook=list.reduce((z,r)=>z+Number(r.actual_total!=null?r.actual_total:(r.final_forecast||0)),0);
    const avg=completed.length?completed.reduce((z,r)=>z+toMinutes(r.completed_at),0)/completed.length:null;
    const onTime=completed.length?completed.filter(r=>toMinutes(r.completed_at)<=15*60+30).length/completed.length:null;
    return {actualTotal,actualDays:actual.length,outlook,avg,completedDays:completed.length,onTime};
  };
  function ensureOptions(){
    const select=$('monthlyPeriod');if(!select||!rows.length)return [];
    const keys=[...new Set(rows.map(r=>closeMonthKey(r.forecast_date)))];
    if(select.dataset.ready!=='1'){
      select.innerHTML=keys.map(k=>`<option value="${k}">${closeMonthLabel(k)}</option>`).join('');
      const current=closeMonthKey(todayISO());select.value=keys.includes(current)?current:keys.at(-1);
      select.dataset.ready='1';
    }
    return keys;
  }
  function renderMonthly(){
    const select=$('monthlyPeriod'),body=$('monthlyBody');if(!select||!body||!rows.length)return;
    const keys=ensureOptions();const selected=select.value||keys.at(-1);
    const list=rows.filter(r=>closeMonthKey(r.forecast_date)===selected),s=summarize(list);
    $('monthlyPeriodText').textContent=periodLabel(list);
    $('monthlyActual').textContent=fmtInt(s.actualTotal)+'件';
    $('monthlyActualDays').textContent=s.actualDays+'日';
    $('monthlyOutlook').textContent=fmtInt(s.outlook)+'件';
    $('monthlyAvgTime').textContent=formatTime(s.avg);
    $('monthlyAvgDays').textContent=s.completedDays?`${s.completedDays}日平均`:'完了時間未入力';
    $('monthlyOnTime').textContent=s.onTime==null?'—':(s.onTime*100).toFixed(1)+'%';
    body.innerHTML=keys.map(k=>{
      const mrows=rows.filter(r=>closeMonthKey(r.forecast_date)===k),x=summarize(mrows);
      return `<tr class="${k===selected?'today-row':''}"><td><button class="linkdate" data-month="${k}">${closeMonthLabel(k)}</button></td><td>${periodLabel(mrows)}</td><td class="num">${fmtInt(x.actualTotal)}</td><td class="num">${x.actualDays}</td><td class="num">${fmtInt(x.outlook)}</td><td class="num">${formatTime(x.avg)}</td><td class="num">${x.onTime==null?'—':(x.onTime*100).toFixed(1)+'%'}</td></tr>`;
    }).join('');
    body.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{select.value=b.dataset.month;renderMonthly()});
  }

  const originalRenderDashboard=renderDashboard;
  renderDashboard=function(){
    originalRenderDashboard();
    const today=todayISO(),current=rows.find(r=>r.forecast_date===today)||rows.find(r=>r.forecast_date>=today)||rows.at(-1);if(!current)return;
    const key=closeMonthKey(current.forecast_date),list=rows.filter(r=>closeMonthKey(r.forecast_date)===key);
    $('kpiMonth').textContent=fmtInt(summarize(list).outlook)+'件';
  };
  const originalRenderAll=renderAll;
  renderAll=function(){originalRenderAll();renderMonthly()};
  const select=$('monthlyPeriod');if(select)select.onchange=renderMonthly;
  window.renderMonthly=renderMonthly;

  // 実績出荷件数は、佐川・ネコポス・ゆうパックの3便合計から自動入力する。
  const totalInput=$('dActual');
  if(totalInput){
    totalInput.readOnly=true;
    totalInput.setAttribute('aria-readonly','true');
    totalInput.style.background='#f2f4f7';
    const label=totalInput.closest('label');
    if(label&&label.firstChild&&label.firstChild.nodeType===Node.TEXT_NODE){
      label.firstChild.nodeValue='実績出荷件数（自動合計）';
    }
  }
  function syncActualTotal(){
    if(!totalInput)return;
    const inputs=['dSagawa','dNekopos','dYupack'].map(id=>$(id)).filter(Boolean);
    const hasAny=inputs.some(el=>el.value!=='');
    const sum=inputs.reduce((z,el)=>z+Number(el.value||0),0);
    totalInput.value=hasAny?String(sum):'';
    if(typeof updateDaySum==='function')updateDaySum();
  }
  ['dSagawa','dNekopos','dYupack'].forEach(id=>{const el=$(id);if(el)el.addEventListener('input',syncActualTotal)});
})();
