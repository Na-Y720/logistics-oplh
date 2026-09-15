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
  function addDays(ymd,n){const d=new Date(ymd+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
  function daysBetween(a,b){return Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000)+1}
  function normalizeName(v){return String(v||'').normalize('NFKC').replace(/^\s*\d+\s*/,'').replace(/[\s\u00a0]+/g,'').trim()}
  function setNotice(text,type='warn'){const n=$('shiftNotice');if(n){n.textContent=text;n.className='notice shift-note '+type}}

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
      setNotice('対象月度のシフトを全クリアしました。すべて未作成状態です。','good');
    }catch(e){setNotice('全クリアに失敗しました: '+(e?.message||e),'bad')}
    finally{if(b){b.disabled=false;b.textContent='全クリア'}}
  }

  function parseKotHtml(text){
    const doc=new DOMParser().parseFromString(text,'text/html');
    const table=doc.querySelector('table.htBlock-hrCalendarTableA_main');
    if(!table)throw new Error('KING OF TIMEのスケジュール表を確認できませんでした。');
    const heading=[...doc.querySelectorAll('.htBlock-mainContents h2')].map(x=>x.textContent||'').join(' ');
    const m=heading.match(/(\d{4})\/(\d{2})\/(\d{2})[\s\S]*?～[\s\S]*?(\d{4})\/(\d{2})\/(\d{2})/);
    if(!m)throw new Error('ファイルから表示期間を取得できませんでした。');
    const start=`${m[1]}-${m[2]}-${m[3]}`,end=`${m[4]}-${m[5]}-${m[6]}`,count=daysBetween(start,end);
    if(count<28||count>31)throw new Error('表示期間の日数が想定外です。');
    const rows=[];
    for(const tr of table.querySelectorAll('tbody > tr')){
      const cells=[...tr.children].map(c=>(c.textContent||'').replace(/\s+/g,' ').trim());
      if(cells.length<5+count)continue;
      const rawName=cells[2],name=normalizeName(rawName);if(!name)continue;
      const offs=[];for(let i=0;i<count;i++)if(cells[5+i]==='--')offs.push(addDays(start,i));
      if(offs.length)rows.push({rawName,name,offs});
    }
    return{start,end,rows};
  }

  async function importKotFile(file){
    const ym=$('shiftMonth')?.value;if(!ym){setNotice('先に対象月度を選択してください。','bad');return}
    const b=$('shiftKotImportBtn');if(b){b.disabled=true;b.textContent='取込中…'}
    try{
      const text=await file.text(),parsed=parseKotHtml(text),p=periodForMonth(ym);
      if(parsed.start!==p.start||parsed.end!==p.end)throw new Error(`ファイル期間 ${parsed.start}～${parsed.end} と、選択中の対象期間 ${p.start}～${p.end} が一致しません。`);
      const slist=await rest('logistics_staff',`owner_id=eq.${user.id}&is_active=eq.true&select=id,name`);
      const byName=new Map((slist||[]).map(s=>[normalizeName(s.name),s]));
      const planMonth=ym+'-01',now=new Date().toISOString(),out=[],matched=new Set(),unmatched=[];
      for(const r of parsed.rows){
        const s=byName.get(r.name);if(!s){unmatched.push(r.rawName);continue}matched.add(s.id);
        for(const d of r.offs)out.push({owner_id:user.id,staff_id:s.id,plan_month:planMonth,shift_date:d,assignment:'off',lock_type:'manual_off',updated_at:now});
      }
      if(!out.length)throw new Error('登録済み従業員に一致する「--」がありませんでした。');
      for(let i=0;i<out.length;i+=300)await rest('logistics_daily_shifts','on_conflict=owner_id%2Cstaff_id%2Cshift_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(out.slice(i,i+300))});
      const refresh=$('shiftRefreshBtn');if(refresh?.onclick)await refresh.onclick();
      const extra=unmatched.length?` アプリ未登録または氏名不一致 ${unmatched.length}名は無視しました。`:'';
      setNotice(`KING OF TIMEから ${matched.size}名・${out.length}件の休みを「休★」として取り込みました。${extra}`,'good');
    }catch(e){setNotice('KING OF TIME休み取込に失敗しました: '+(e?.message||e),'bad')}
    finally{if(b){b.disabled=false;b.textContent='KOT休み取込'}const inp=$('shiftKotFile');if(inp)inp.value=''}
  }

  function installToolbarButtons(){
    const auto=$('shiftAutoBtn');if(!auto)return;
    if(!$('shiftKotFile')){const inp=document.createElement('input');inp.id='shiftKotFile';inp.type='file';inp.accept='.xls,.html,text/html,application/vnd.ms-excel';inp.style.display='none';inp.onchange=()=>{const f=inp.files?.[0];if(f)importKotFile(f)};auto.parentElement.insertBefore(inp,auto)}
    if(!$('shiftKotImportBtn')){const b=document.createElement('button');b.id='shiftKotImportBtn';b.type='button';b.textContent='KOT休み取込';b.title='KING OF TIMEの月別スケジュール.xlsから「--」だけを休み固定として取り込みます';b.onclick=()=>$('shiftKotFile')?.click();auto.parentElement.insertBefore(b,auto)}
    if(!$('shiftClearBtn')){const b=document.createElement('button');b.id='shiftClearBtn';b.type='button';b.className='danger';b.textContent='全クリア';b.onclick=clearAll;auto.parentElement.insertBefore(b,auto)}
  }

  async function syncMasterDaysToSelectedMonth(staffId,days){
    const ym=$('shiftMonth')?.value||$('month')?.value;
    if(!staffId||!ym)return;
    const planMonth=ym+'-01',now=new Date().toISOString();
    const rows=await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&staff_id=eq.${staffId}&plan_month=eq.${planMonth}&select=id`);
    if(rows?.length){
      await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&staff_id=eq.${staffId}&plan_month=eq.${planMonth}`,{method:'PATCH',body:JSON.stringify({work_days:days,updated_at:now})});
    }
  }

  function installMasterRefresh(){
    const form=$('staffForm');
    if(form?.onsubmit&&!form.dataset.shiftRefreshWrapped){
      const base=form.onsubmit;
      form.onsubmit=async function(e){
        const beforeId=typeof editingStaff!=='undefined'?editingStaff:null;
        const savedName=$('fName')?.value.trim()||'';
        const savedDays=Number($('fDays')?.value)||0;
        await base.call(this,e);
        if($('staffDlg')?.open)return;
        let id=beforeId;
        if(!id&&savedName){
          const q=await rest('logistics_staff',`owner_id=eq.${user.id}&name=eq.${encodeURIComponent(savedName)}&select=id,created_at&order=created_at.desc&limit=1`);
          id=q?.[0]?.id||null;
        }
        if(id)await syncMasterDaysToSelectedMonth(id,savedDays);
        masterDirty=true;
      };
      form.dataset.shiftRefreshWrapped='1';
    }
    const tab=document.querySelector('.tab[data-tab="shift"]');
    if(tab?.onclick&&!tab.dataset.shiftRefreshWrapped){
      const base=tab.onclick;
      tab.onclick=async function(e){await base.call(this,e);if(masterDirty){masterDirty=false;const refresh=$('shiftRefreshBtn');if(refresh?.onclick)await refresh.onclick()}};
      tab.dataset.shiftRefreshWrapped='1';
    }
  }

  installFitStyles();
  installToolbarButtons();
  installMasterRefresh();
})();
