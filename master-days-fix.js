(function(){
  const $=id=>document.getElementById(id);
  async function syncMonth(staffId,ym,days){
    if(!staffId||!ym)return;
    const planMonth=ym+'-01';
    const rows=await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&staff_id=eq.${staffId}&plan_month=eq.${planMonth}&select=*`);
    const now=new Date().toISOString();
    if(rows?.length){
      await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&staff_id=eq.${staffId}&plan_month=eq.${planMonth}`,{method:'PATCH',body:JSON.stringify({work_days:days,updated_at:now})});
      return;
    }
    const defs=await rest('logistics_staff_defaults',`owner_id=eq.${user.id}&staff_id=eq.${staffId}&select=*`);
    const d=defs?.[0]||{};
    await rest('logistics_monthly_staffing','on_conflict=owner_id%2Cstaff_id%2Cplan_month',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({owner_id:user.id,staff_id:staffId,plan_month:planMonth,work_days:days,included:true,start_time:d.start_time||null,end_time:d.end_time||null,break_start:d.break_start||null,break_end:d.break_end||null,updated_at:now})});
  }
  async function resolveStaffId(beforeId,name){
    if(beforeId)return beforeId;
    if(!name)return null;
    const q=await rest('logistics_staff',`owner_id=eq.${user.id}&name=eq.${encodeURIComponent(name)}&select=id,created_at&order=created_at.desc&limit=1`);
    return q?.[0]?.id||null;
  }
  function install(){
    const form=$('staffForm');
    if(!form?.onsubmit||form.dataset.masterDaysFix==='1')return;
    const base=form.onsubmit;
    form.onsubmit=async function(e){
      const beforeId=typeof editingStaff!=='undefined'?editingStaff:null;
      const name=$('fName')?.value.trim()||'';
      const days=Number($('fDays')?.value)||0;
      const months=[...new Set([$('month')?.value,$('shiftMonth')?.value].filter(Boolean))];
      await base.call(this,e);
      if($('staffDlg')?.open)return;
      try{
        const id=await resolveStaffId(beforeId,name);
        if(id){
          for(const ym of months)await syncMonth(id,ym,days);
          if(typeof loadMonth==='function'&&$('month')?.value)await loadMonth();
          const refresh=$('shiftRefreshBtn');if(refresh?.onclick)await refresh.onclick();
          const n=$('shiftNotice');if(n){n.textContent=`従業員マスタの日数 ${days}日を選択月度へ反映しました。`;n.className='notice shift-note good'}
        }
      }catch(err){console.error('master days sync failed',err);alert('出勤日数の月度反映に失敗しました: '+(err?.message||err));}
    };
    form.dataset.masterDaysFix='1';
  }
  install();
})();
