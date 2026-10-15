(function(){
  const $=id=>document.getElementById(id);
  let masterDirty=false;
  const pad=v=>String(v).padStart(2,'0');
  function periodForMonth(ym){const[y,m]=String(ym).split('-').map(Number),fmt=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()),start=new Date(Date.UTC(y,m-2,21)),end=new Date(Date.UTC(y,m-1,20));return{start:fmt(start),end:fmt(end)}}
  function addDays(ymd,n){const d=new Date(ymd+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
  function daysBetween(a,b){return Math.round((new Date(b+'T00:00:00Z')-new Date(a+'T00:00:00Z'))/86400000)+1}
  function normalizeName(v){return String(v||'').normalize('NFKC').replace(/^\s*(?:WP)?\d+\s*/i,'').replace(/[\s\u00a0]+/g,'').trim()}
  function setNotice(text,type='warn'){const n=$('shiftNotice');if(n){n.textContent=text;n.className='notice shift-note '+type}}

  function installFitStyles(){
    if($('shiftFitStyles'))return;
    const s=document.createElement('style');s.id='shiftFitStyles';s.textContent=`
      #shiftTab{width:calc(100vw - 24px);margin-left:calc(50% - 50vw + 12px)}
      .shift-tablewrap{overflow-x:hidden!important;max-height:68vh}
      .shift-table{min-width:0!important;width:100%!important;table-layout:fixed!important}
      .shift-table th,.shift-table td{padding:3px 1px!important;font-size:10px!important;line-height:1.1}
      .shift-name-col{width:120px!important;min-width:120px!important;max-width:120px!important}
      .shift-name-col b{font-size:10px}.shift-name-col .small{font-size:8px;line-height:1.1;white-space:normal}
      .shift-type-col{width:46px!important;min-width:46px!important;max-width:46px!important;font-size:9px!important}
      .shift-days-col{width:48px!important;min-width:48px!important;max-width:48px!important;font-size:9px!important}
      .shift-day-head,.shift-cell-td{width:auto!important;min-width:0!important;max-width:none!important}
      .shift-date{font-size:9px}.shift-week{font-size:9px!important;margin-top:1px!important}.shift-need,.shift-assign{font-size:8px!important;margin-top:1px!important}
      .shift-cell{width:100%!important;min-width:0!important;height:28px!important;padding:0!important;border-radius:5px!important;font-size:9px!important}
      @media(max-width:1100px){.shift-name-col{width:100px!important;min-width:100px!important;max-width:100px!important}.shift-type-col{width:38px!important;min-width:38px!important;max-width:38px!important}.shift-days-col{width:42px!important;min-width:42px!important;max-width:42px!important}.shift-table th,.shift-table td{font-size:9px!important}.shift-cell{font-size:8px!important}}
    `;document.head.appendChild(s)
  }

  async function clearAll(){
    if(window.isShiftLocked?.()){setNotice('シフトがロック中です。ロック解除後に全クリアしてください。','warn');return}
    const ym=$('shiftMonth')?.value;if(!ym)return;const p=periodForMonth(ym);
    if(!confirm(`${p.start} ～ ${p.end} のシフトを全クリアします。\n休み希望・出勤固定・自動作成結果もすべて「未作成」に戻ります。よろしいですか？`))return;
    const b=$('shiftClearBtn');if(b){b.disabled=true;b.textContent='クリア中…'}
    try{await rest('logistics_daily_shifts',`owner_id=eq.${user.id}&shift_date=gte.${p.start}&shift_date=lte.${p.end}`,{method:'DELETE'});const r=$('shiftRefreshBtn');if(r?.onclick)await r.onclick();setNotice('対象月度のシフトを全クリアしました。すべて未作成状態です。','good')}
    catch(e){setNotice('全クリアに失敗しました: '+(e?.message||e),'bad')}
    finally{if(b){b.disabled=!!window.isShiftLocked?.();b.textContent='全クリア'}}
  }

  function parseKotHtml(text){
    const doc=new DOMParser().parseFromString(text,'text/html'),table=doc.querySelector('table.htBlock-hrCalendarTableA_main');if(!table)throw new Error('KING OF TIMEのスケジュール表を確認できませんでした。');
    const heading=[...doc.querySelectorAll('.htBlock-mainContents h2')].map(x=>x.textContent||'').join(' '),m=heading.match(/(\d{4})\/(\d{2})\/(\d{2})[\s\S]*?～[\s\S]*?(\d{4})\/(\d{2})\/(\d{2})/);if(!m)throw new Error('ファイルから表示期間を取得できませんでした。');
    const start=`${m[1]}-${m[2]}-${m[3]}`,end=`${m[4]}-${m[5]}-${m[6]}`,count=daysBetween(start,end);if(count<28||count>31)throw new Error('表示期間の日数が想定外です。');
    const rows=[];for(const tr of table.querySelectorAll('tbody > tr')){const cells=[...tr.children].map(c=>(c.textContent||'').replace(/\s+/g,' ').trim());if(cells.length<5+count)continue;const rawName=cells[2],name=normalizeName(rawName);if(!name)continue;const offs=[],values=[];for(let i=0;i<count;i++){const date=addDays(start,i),value=cells[5+i]||'';values.push({date,value});if(value==='--')offs.push(date)}rows.push({rawName,name,offs,values})}return{start,end,rows}
  }

  async function importKotFile(file){
    if(window.isShiftLocked?.()){setNotice('シフトがロック中です。ロック解除後にKOT取込してください。','warn');const inp=$('shiftKotFile');if(inp)inp.value='';return}
    const ym=$('shiftMonth')?.value;if(!ym){setNotice('先に対象月度を選択してください。','bad');return}const b=$('shiftKotImportBtn');if(b){b.disabled=true;b.textContent='取込中…'}
    try{const text=await file.text(),parsed=parseKotHtml(text),p=periodForMonth(ym);if(parsed.start!==p.start||parsed.end!==p.end)throw new Error(`ファイル期間 ${parsed.start}～${parsed.end} と、選択中の対象期間 ${p.start}～${p.end} が一致しません。`);
      const slist=await rest('logistics_staff',`owner_id=eq.${user.id}&is_active=eq.true&select=id,name,employment_type,retirement_date`),byName=new Map((slist||[]).filter(s=>!s.retirement_date||String(s.retirement_date).slice(0,10)>=p.start).map(s=>[normalizeName(s.name),s])),planMonth=ym+'-01',now=new Date().toISOString(),out=[],matched=new Set(),unmatched=[];
      for(const r of parsed.rows){const s=byName.get(r.name);if(!s){unmatched.push(r.rawName);continue}if(String(s.employment_type||'').trim()==='派遣')continue;matched.add(s.id);for(const d of r.offs)out.push({owner_id:user.id,staff_id:s.id,plan_month:planMonth,shift_date:d,assignment:'off',lock_type:'manual_off',updated_at:now})}
      if(!out.length)throw new Error('登録済み従業員に一致する「--」がありませんでした。');for(let i=0;i<out.length;i+=300)await rest('logistics_daily_shifts','on_conflict=owner_id%2Cstaff_id%2Cshift_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(out.slice(i,i+300))});const refresh=$('shiftRefreshBtn');if(refresh?.onclick)await refresh.onclick();const extra=unmatched.length?` アプリ未登録または氏名不一致 ${unmatched.length}名は無視しました。`:'';setNotice(`KING OF TIMEから ${matched.size}名・${out.length}件の休みを「休★」として取り込みました。${extra}`,'good')}
    catch(e){setNotice('KING OF TIME休み取込に失敗しました: '+(e?.message||e),'bad')}
    finally{if(b){b.disabled=!!window.isShiftLocked?.();b.textContent='KOT休み取込'}const inp=$('shiftKotFile');if(inp)inp.value=''}
  }

  async function importDispatchFile(file){
    if(window.isShiftLocked?.()){setNotice('シフトがロック中です。ロック解除後に派遣取込してください。','warn');const inp=$('shiftDispatchFile');if(inp)inp.value='';return}
    const ym=$('shiftMonth')?.value;if(!ym){setNotice('先に対象月度を選択してください。','bad');return}const b=$('shiftDispatchImportBtn');if(b){b.disabled=true;b.textContent='取込中…'}
    try{
      const text=await file.text(),parsed=parseKotHtml(text),p=periodForMonth(ym);if(parsed.start!==p.start||parsed.end!==p.end)throw new Error(`ファイル期間 ${parsed.start}～${parsed.end} と、選択中の対象期間 ${p.start}～${p.end} が一致しません。`);
      const slist=await rest('logistics_staff',`owner_id=eq.${user.id}&is_active=eq.true&select=id,name,employment_type,retirement_date`),dispatch=(slist||[]).filter(s=>String(s.employment_type||'').trim()==='派遣'&&(!s.retirement_date||String(s.retirement_date).slice(0,10)>=p.start)),byName=new Map(dispatch.map(s=>[normalizeName(s.name),s])),matched=new Set(),out=[],now=new Date().toISOString(),planMonth=ym+'-01';
      for(const r of parsed.rows){const s=byName.get(r.name);if(!s)continue;matched.add(s.id);for(const x of r.values||[]){if(!x.value||x.value==='--')continue;out.push({owner_id:user.id,staff_id:s.id,plan_month:planMonth,shift_date:x.date,assignment:'work',lock_type:'dispatch_work',updated_at:now})}}
      if(!matched.size)throw new Error('ファイル内に従業員マスタの「派遣」と一致する人がいませんでした。');
      const ids=[...matched];for(const id of ids)await rest('logistics_daily_shifts',`owner_id=eq.${user.id}&staff_id=eq.${id}&shift_date=gte.${p.start}&shift_date=lte.${p.end}&lock_type=eq.dispatch_work`,{method:'DELETE'});
      for(let i=0;i<out.length;i+=300)await rest('logistics_daily_shifts','on_conflict=owner_id%2Cstaff_id%2Cshift_date',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(out.slice(i,i+300))});
      const refresh=$('shiftRefreshBtn');if(refresh?.onclick)await refresh.onclick();setNotice(`派遣 ${matched.size}名・${out.length}勤務日を確定取込しました。取込日のみ配置人数・人時へ加算します。`,'good')
    }catch(e){setNotice('KOT派遣取込に失敗しました: '+(e?.message||e),'bad')}
    finally{if(b){b.disabled=!!window.isShiftLocked?.();b.textContent='KOT派遣取込'}const inp=$('shiftDispatchFile');if(inp)inp.value=''}
  }

  function installToolbarButtons(){const auto=$('shiftAutoBtn');if(!auto)return;if(!$('shiftKotFile')){const inp=document.createElement('input');inp.id='shiftKotFile';inp.type='file';inp.accept='.xls,.html,text/html,application/vnd.ms-excel';inp.style.display='none';inp.onchange=()=>{const f=inp.files?.[0];if(f)importKotFile(f)};auto.parentElement.insertBefore(inp,auto)}if(!$('shiftDispatchFile')){const inp=document.createElement('input');inp.id='shiftDispatchFile';inp.type='file';inp.accept='.xls,.html,text/html,application/vnd.ms-excel';inp.style.display='none';inp.onchange=()=>{const f=inp.files?.[0];if(f)importDispatchFile(f)};auto.parentElement.insertBefore(inp,auto)}if(!$('shiftKotImportBtn')){const b=document.createElement('button');b.id='shiftKotImportBtn';b.type='button';b.textContent='KOT休み取込';b.title='KING OF TIMEの月別スケジュール.xlsから「--」だけを休み固定として取り込みます（派遣は除外）';b.onclick=()=>{if(window.isShiftLocked?.()){setNotice('シフトがロック中です。','warn');return}$('shiftKotFile')?.click()};auto.parentElement.insertBefore(b,auto)}if(!$('shiftDispatchImportBtn')){const b=document.createElement('button');b.id='shiftDispatchImportBtn';b.type='button';b.textContent='KOT派遣取込';b.title='KING OF TIMEの月別スケジュール.xlsから派遣の確定勤務日だけを取り込みます';b.onclick=()=>{if(window.isShiftLocked?.()){setNotice('シフトがロック中です。','warn');return}$('shiftDispatchFile')?.click()};auto.parentElement.insertBefore(b,auto)}if(!$('shiftClearBtn')){const b=document.createElement('button');b.id='shiftClearBtn';b.type='button';b.className='danger';b.textContent='全クリア';b.onclick=clearAll;auto.parentElement.insertBefore(b,auto)}window.applyShiftLockState?.()}

  async function syncMasterDaysToSelectedMonth(staffId,days){
    const ym=$('shiftMonth')?.value||$('month')?.value;if(!staffId||!ym)return null;
    const p=periodForMonth(ym),s=(typeof staff!=='undefined'?staff.find(x=>x.id===staffId):null);if(s?.retirement_date&&String(s.retirement_date).slice(0,10)<p.start)return null;
    const planMonth=ym+'-01',now=new Date().toISOString(),rows=await rest('logistics_monthly_staffing',`owner_id=eq.${user.id}&staff_id=eq.${staffId}&plan_month=eq.${planMonth}&select=*`),cur=rows?.[0]||null,d=(typeof defaults!=='undefined'?defaults.find(x=>x.staff_id===staffId):null)||{};
    const body={owner_id:user.id,staff_id:staffId,plan_month:planMonth,work_days:days,included:cur?!!cur.included:true,start_time:cur?cur.start_time:(d.start_time||null),end_time:cur?cur.end_time:(d.end_time||null),break_start:cur?cur.break_start:(d.break_start??null),break_end:cur?cur.break_end:(d.break_end??null),updated_at:now};
    await rest('logistics_monthly_staffing','on_conflict=owner_id%2Cstaff_id%2Cplan_month',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify(body)});return ym
  }

  function installMasterRefresh(){
    const form=$('staffForm');if(form?.onsubmit&&!form.dataset.shiftRefreshWrapped){const base=form.onsubmit;form.onsubmit=async function(e){const beforeId=typeof editingStaff!=='undefined'?editingStaff:null,savedName=$('fName')?.value.trim()||'',savedDays=Number($('fDays')?.value)||0;await base.call(this,e);if($('staffDlg')?.open)return;try{let id=beforeId;if(!id&&savedName){const q=await rest('logistics_staff',`owner_id=eq.${user.id}&name=eq.${encodeURIComponent(savedName)}&select=id,created_at&order=created_at.desc&limit=1`);id=q?.[0]?.id||null}if(id){const ym=await syncMasterDaysToSelectedMonth(id,savedDays);if(ym&&$('month')?.value===ym&&typeof loadMonth==='function')await loadMonth();const refresh=$('shiftRefreshBtn');if(refresh?.onclick)await refresh.onclick()}masterDirty=false}catch(err){masterDirty=true;alert('月度への出勤日数反映に失敗しました: '+(err?.message||err))}};form.dataset.shiftRefreshWrapped='1'}
    const tab=document.querySelector('.tab[data-tab="shift"]');if(tab?.onclick&&!tab.dataset.shiftRefreshWrapped){const base=tab.onclick;tab.onclick=async function(e){await base.call(this,e);if(masterDirty){masterDirty=false;const refresh=$('shiftRefreshBtn');if(refresh?.onclick)await refresh.onclick()}};tab.dataset.shiftRefreshWrapped='1'}
  }

  installFitStyles();installToolbarButtons();installMasterRefresh();
})();
