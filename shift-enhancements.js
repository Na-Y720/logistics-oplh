(function(){
  const $=id=>document.getElementById(id);
  let masterDirty=false;

  function periodForMonth(ym){
    const [y,m]=String(ym).split('-').map(Number);
    const pad=v=>String(v).padStart(2,'0');
    const fmt=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
    const start=new Date(Date.UTC(y,m-2,21));
    const end=new Date(Date.UTC(y,m-1,20));
    return {start:fmt(start),end:fmt(end)};
  }

  function installFitStyles(){
    if($('shiftFitStyles'))return;
    const s=document.createElement('style');
    s.id='shiftFitStyles';
    s.textContent=`
      #shiftTab{width:calc(100vw - 24px);margin-left:calc(50% - 50vw + 12px)}
      .shift-tablewrap{overflow-x:hidden!important;max-height:68vh}
      .shift-table{min-width:0!important;width:100%!important;table-layout:fixed!important}
      .shift-table th,.shift-table td{padding:3px 1px!important;font-size:10px!important;line-height:1.1}
      .shift-name-col{width:120px!important;min-width:120px!important;max-width:120px!important}
      .shift-name-col b{font-size:10px}.shift-name-col .small{font-size:8px;line-height:1.1;white-space:normal}
      .shift-type-col{width:46px!important;min-width:46px!important;max-width:46px!important;font-size:9px!important}
      .shift-days-col{width:48px!important;min-width:48px!important;max-width:48px!important;font-size:9px!important}
      .shift-day-head,.shift-cell-td{width:auto!important;min-width:0!important;max-width:none!important}
      .shift-date{font-size:9px}.shift-week{font-size:9px!important;margin-top:1px!important}
      .shift-need,.shift-assign{font-size:8px!important;margin-top:1px!important}
      .shift-cell{width:100%!important;min-width:0!important;height:28px!important;padding:0!important;border-radius:5px!important;font-size:9px!important}
      @media(max-width:1100px){.shift-name-col{width:100px!important;min-width:100px!important;max-width:100px!important}.shift-type-col{width:38px!important;min-width:38px!important;max-width:38px!important}.shift-days-col{width:42px!important;min-width:42px!important;max-width:42px!important}.shift-table th,.shift-table td{font-size:9px!important}.shift-cell{font-size:8px!important}}
    `;
    document.head.appendChild(s);
  }

  async function clearAll(){
    const ym=$('shiftMonth')?.value;
    if(!ym)return;
    const p=periodForMonth(ym);
    if(!confirm(`${p.start} ～ ${p.end} のシフトを全クリアします。\n休み希望・出勤固定・自動作成結果もすべて「未作成」に戻ります。よろしいですか？`))return;
    const b=$('shiftClearBtn');
    if(b){b.disabled=true;b.textContent='クリア中…'}
    try{
      await rest('logistics_daily_shifts',`owner_id=eq.${user.id}&shift_date=gte.${p.start}&shift_date=lte.${p.end}`,{method:'DELETE'});
      const refresh=$('shiftRefreshBtn');
      if(refresh?.onclick)await refresh.onclick();
      const notice=$('shiftNotice');
      if(notice){notice.textContent='対象月度のシフトを全クリアしました。すべて未作成状態です。';notice.className='notice shift-note good'}
    }catch(e){
      const notice=$('shiftNotice');
      if(notice){notice.textContent='全クリアに失敗しました: '+(e?.message||e);notice.className='notice shift-note bad'}
    }finally{
      if(b){b.disabled=false;b.textContent='全クリア'}
    }
  }

  function installClearButton(){
    if($('shiftClearBtn'))return;
    const auto=$('shiftAutoBtn');
    if(!auto)return;
    const b=document.createElement('button');
    b.id='shiftClearBtn';b.type='button';b.className='danger';b.textContent='全クリア';b.onclick=clearAll;
    auto.parentElement.insertBefore(b,auto);
  }

  function installMasterRefresh(){
    const form=$('staffForm');
    if(form?.onsubmit&&!form.dataset.shiftRefreshWrapped){
      const base=form.onsubmit;
      form.onsubmit=async function(e){
        await base.call(this,e);
        if(!$('staffDlg')?.open)masterDirty=true;
      };
      form.dataset.shiftRefreshWrapped='1';
    }
    const tab=document.querySelector('.tab[data-tab="shift"]');
    if(tab?.onclick&&!tab.dataset.shiftRefreshWrapped){
      const base=tab.onclick;
      tab.onclick=async function(e){
        await base.call(this,e);
        if(masterDirty){
          masterDirty=false;
          const refresh=$('shiftRefreshBtn');
          if(refresh?.onclick)await refresh.onclick();
        }
      };
      tab.dataset.shiftRefreshWrapped='1';
    }
  }

  installFitStyles();
  installClearButton();
  installMasterRefresh();
})();
