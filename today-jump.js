(()=>{
  const originalRenderForecastTable=renderForecastTable;

  renderForecastTable=function(){
    originalRenderForecastTable();
    document.querySelectorAll('#forecastBody tr').forEach(tr=>{
      const dateButton=tr.querySelector('[data-open]');
      if(dateButton)tr.dataset.date=dateButton.dataset.open;
    });
  };

  function jumpToToday(){
    const today=todayISO();
    const month=monthKey(today);
    const monthFilter=$('monthFilter');
    const stateFilter=$('stateFilter');

    if(monthFilter){
      const exists=[...monthFilter.options].some(o=>o.value===month);
      monthFilter.value=exists?month:'';
    }
    if(stateFilter)stateFilter.value='all';

    renderForecastTable();
    requestAnimationFrame(()=>{
      const row=document.querySelector(`#forecastBody tr[data-date="${today}"]`);
      if(row){
        row.scrollIntoView({behavior:'smooth',block:'center'});
        row.classList.add('today-row');
      }else{
        toast('今日の日付は予測期間外です。');
      }
    });
  }

  const button=$('jumpTodayBtn');
  if(button)button.onclick=jumpToToday;
})();
