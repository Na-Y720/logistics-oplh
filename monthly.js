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
    const sagawaTotal=list.reduce((z,r)=>z+(r.actual_sagawa==null?0:Number(r.actual_sagawa)),0);
    const nekoposTotal=list.reduce((z,r)=>z+(r.actual_nekopos==null?0:Number(r.actual_nekopos)),0);
    const yupackTotal=list.reduce((z,r)=>z+(r.actual_yupack==null?0:Number(r.actual_yupack)),0);
    const outlook=list.reduce((z,r)=>z+Number(r.actual_total!=null?r.actual_total:(r.final_forecast||0)),0);
    const avg=completed.length?completed.reduce((z,r)=>z+toMinutes(r.completed_at),0)/completed.length:null;
    const onTime=completed.length?completed.filter(r=>toMinutes(r.completed_at)<=15*60+30).length/completed.length:null;
    return {actualTotal,sagawaTotal,nekoposTotal,yupackTotal,actualDays:actual.length,outlook,avg,completedDays:completed.length,onTime};
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
    $('monthlySagawa').textContent=fmtInt(s.sagawaTotal)+'件';
    $('monthlyNekopos').textContent=fmtInt(s.nekoposTotal)+'件';
    $('monthlyYupack').textContent=fmtInt(s.yupackTotal)+'件';
    $('monthlyAvgTime').textContent=formatTime(s.avg);
    $('monthlyAvgDays').textContent=s.completedDays?`${s.completedDays}日平均`:'完了時間未入力';
    $('monthlyOnTime').textContent=s.onTime==null?'—':(s.onTime*100).toFixed(1)+'%';
    body.innerHTML=keys.map(k=>{
      const mrows=rows.filter(r=>closeMonthKey(r.forecast_date)===k),x=summarize(mrows);
      return `<tr class="${k===selected?'today-row':''}"><td><button class="linkdate" data-month="${k}">${closeMonthLabel(k)}</button></td><td>${periodLabel(mrows)}</td><td class="num">${fmtInt(x.actualTotal)}</td><td class="num">${fmtInt(x.sagawaTotal)}</td><td class="num">${fmtInt(x.nekoposTotal)}</td><td class="num">${fmtInt(x.yupackTotal)}</td><td class="num">${x.actualDays}</td><td class="num">${fmtInt(x.outlook)}</td><td class="num">${formatTime(x.avg)}</td><td class="num">${x.onTime==null?'—':(x.onTime*100).toFixed(1)+'%'}</td></tr>`;
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
})();

// 実績入力は担当者・入力タイミングが異なるため、項目ごとの追記保存を許可する。
(()=>{
  const carrierIds=['dSagawa','dNekopos','dYupack'];
  const totalEl=$('dActual');
  if(!totalEl)return;

  totalEl.readOnly=true;
  totalEl.removeAttribute('required');
  totalEl.placeholder='配送3便から自動計算';
  carrierIds.forEach(id=>$(id)?.removeAttribute('required'));

  const readNum=id=>{
    const el=$(id);if(!el||el.value==='')return null;
    const n=Number(el.value);return Number.isFinite(n)?n:null;
  };

  function partialUpdateDaySum(){
    const values=carrierIds.map(readNum),entered=values.filter(v=>v!==null).length;
    if(entered===3){
      const sum=values.reduce((z,v)=>z+v,0);
      totalEl.value=sum;
      $('deliverySum').textContent=`配送3便 合計 ${fmtInt(sum)}件（自動計算）`;
      $('deliverySum').className='sumcheck ok';
    }else{
      totalEl.value='';
      $('deliverySum').textContent=entered?`配送件数 ${entered}/3便入力済み　残りは後から追記できます`:'各項目は別々のタイミングで保存できます';
      $('deliverySum').className='sumcheck';
    }
  }
  updateDaySum=partialUpdateDaySum;
  carrierIds.forEach(id=>{if($(id))$(id).oninput=partialUpdateDaySum});

  const keepOrNumber=(value,current)=>value===''||value==null?(current??null):Number(value);
  const keepOrText=(value,current)=>value===''||value==null?(current??null):value;

  saveActual=async function(input){
    const r=rows.find(x=>x.forecast_date===input.forecast_date);
    if(!r)throw new Error('対象日が見つかりません。');

    const before={s:r.actual_sagawa,n:r.actual_nekopos,y:r.actual_yupack,total:r.actual_total};
    const sag=keepOrNumber(input.actual_sagawa,r.actual_sagawa);
    const nek=keepOrNumber(input.actual_nekopos,r.actual_nekopos);
    const yu=keepOrNumber(input.actual_yupack,r.actual_yupack);
    const carriersComplete=[sag,nek,yu].every(v=>v!==null&&Number.isFinite(Number(v)));
    const total=carriersComplete?Number(sag)+Number(nek)+Number(yu):(r.actual_total??null);
    const now=new Date().toISOString();

    const patch={
      actual_sagawa:sag,
      actual_nekopos:nek,
      actual_yupack:yu,
      actual_total:total,
      actual_staff:keepOrNumber(input.actual_staff,r.actual_staff),
      temp_staff:keepOrNumber(input.temp_staff,r.temp_staff),
      completed_at:keepOrText(input.completed_at,r.completed_at),
      note:keepOrText(input.note,r.note),
      updated_at:now
    };
    if(total!==null)patch.data_state='actual';

    Object.assign(r,patch);
    saveLocal();
    if(storageMode==='cloud'){
      await rest('forecast365_daily',`owner_id=eq.${user.id}&forecast_date=eq.${r.forecast_date}`,{method:'PATCH',body:JSON.stringify(patch)});
    }

    const carrierChanged=before.s!==r.actual_sagawa||before.n!==r.actual_nekopos||before.y!==r.actual_yupack||before.total!==r.actual_total;
    if(r.actual_total!==null&&carrierChanged)await persistRecalculation();
    else renderAll();
    return {recalculated:r.actual_total!==null&&carrierChanged};
  };

  submitDay=async function(e){
    e.preventDefault();
    const b=$('saveDayBtn');b.disabled=true;b.textContent='保存中…';
    try{
      const result=await saveActual({
        forecast_date:$('dayDate').value,
        actual_total:$('dActual').value,
        actual_sagawa:$('dSagawa').value,
        actual_nekopos:$('dNekopos').value,
        actual_yupack:$('dYupack').value,
        actual_staff:$('dStaff').value,
        temp_staff:$('dTemp').value,
        completed_at:$('dCompleted').value,
        note:$('dNote').value
      });
      $('dayDlg').close();
      toast(result.recalculated?'実績を保存し、未来予測を再計算しました。':'入力内容を保存しました。未入力項目は後から追記できます。');
    }catch(err){alert(err.message)}finally{b.disabled=false;b.textContent='実績を保存'}
  };
  $('dayForm').onsubmit=submitDay;
})();
