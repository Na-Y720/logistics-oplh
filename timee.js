(()=>{
 let saved=[],wms=[],generation=0,editing=null,busy=false;
 const form=$('timeeForm'),date=$('timeeDate'),body=$('timeeBody'),message=$('timeeMessage');
 date.value=localDateISO();
 const say=(s,bad=false)=>{message.textContent=s;message.className='message '+(bad?'bad':'ok')};
 async function all(table,query){let result=[];for(let offset=0;;offset+=1000){const page=await rest(table,query+'&limit=1000&offset='+offset);result.push(...page);if(page.length<1000)return result}}
 function counts(code){return wms.filter(r=>r.worker_code===code&&r.activity_key==='picking'&&!String(r.worker_key).startsWith('BI_SUPPLEMENT:')).reduce((n,r)=>n+Number(r.action_count||0),0)}
 function clear(){editing=null;form.reset();$('timeeHours').value='4';$('timeeMinutes').value='0';$('timeeCode').readOnly=false;$('timeePreview').textContent='開始・終了を入力すると時間を計算します。'}
 async function load(){if(!user)return;const seq=++generation,d=date.value;say('読込中…');try{const [s,w]=await Promise.all([all('logistics_timee_work_time',`owner_id=eq.${user.id}&work_date=eq.${d}&select=*&order=worker_code.asc`),all('oplh_wms_daily',`owner_id=eq.${user.id}&work_date=eq.${d}&select=worker_code,worker_key,activity_key,action_count&order=id.asc`)]);if(seq!==generation)return;saved=s;wms=w;render();say('')}catch(e){if(seq===generation){saved=[];wms=[];render();say('読込失敗：'+e.message,true)}}}
 function render(){const codes=[...new Set(wms.map(r=>r.worker_code).filter(c=>TimeeModel.validCode(c,date.value)))];$('timeeCodes').innerHTML=codes.map(c=>`<option value="${esc(c)}"></option>`).join('');
 body.innerHTML=saved.map(r=>{const count=counts(r.worker_code),p=Number(r.picking_minutes);return `<tr><td>${esc(r.worker_name)}</td><td>${esc(r.worker_code)}</td><td>${esc(r.first_start.slice(0,5))}〜${esc(r.first_end.slice(0,5))}</td><td>${r.second_start?esc(r.second_start.slice(0,5))+'〜'+esc(r.second_end.slice(0,5)):'—'}</td><td>${fmtMin(p)}</td><td>${fmtMin(r.paid_minutes)}</td><td>${fmtMin(r.paid_minutes-p)}</td><td>${count||'未取込'}</td><td>${count&&p?(count*60/p).toFixed(1):'—'}</td><td><button type="button" data-timee-edit="${esc(r.worker_code)}">編集</button></td></tr>`}).join('')||'<tr><td colspan="10">この日のタイミー入力はありません。</td></tr>';
 body.querySelectorAll('[data-timee-edit]').forEach(b=>b.onclick=()=>{const r=saved.find(x=>x.worker_code===b.dataset.timeeEdit);editing={...r};for(const [id,key] of [['timeeName','worker_name'],['timeeCode','worker_code'],['timeeStart1','first_start'],['timeeEnd1','first_end'],['timeeStart2','second_start'],['timeeEnd2','second_end'],['timeeNote','note']])$(id).value=r[key]??'';$('timeeHours').value=Math.floor(r.paid_minutes/60);$('timeeMinutes').value=r.paid_minutes%60;$('timeeCode').readOnly=true;preview()});
 }
 function read(){const h=Number($('timeeHours').value),m=Number($('timeeMinutes').value);if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||m<0||m>59)throw Error('実働時間の時・分を正しく入力してください。');return {owner_id:user.id,work_date:date.value,worker_name:$('timeeName').value.trim(),worker_code:$('timeeCode').value.trim(),first_start:$('timeeStart1').value,first_end:$('timeeEnd1').value,second_start:$('timeeStart2').value||null,second_end:$('timeeEnd2').value||null,paid_minutes:h*60+m,note:$('timeeNote').value.trim(),updated_at:new Date().toISOString()}}
 function preview(){try{const r=read(),v=TimeeModel.calculate(r),n=counts(r.worker_code);$('timeePreview').textContent=`ピッキング ${fmtMin(v.picking)} ／ その他 ${fmtMin(v.other)} ／ WMS ${n||'未取込'}件${n?' ／ '+(n*60/v.picking).toFixed(1)+'件/時':''}`}catch(e){$('timeePreview').textContent=e.message}}
 form.oninput=preview;form.onsubmit=async e=>{e.preventDefault();if(busy)return;try{const r=read();TimeeModel.calculate(r);if(!editing&&saved.some(x=>x.worker_code===r.worker_code))throw Error('同じ日・WMS番号が保存済みです。一覧の「編集」から修正してください。');busy=true;form.querySelectorAll('input,button').forEach(x=>x.disabled=true);date.disabled=true;
 if(editing){const result=await rest('logistics_timee_work_time',`owner_id=eq.${user.id}&id=eq.${editing.id}&updated_at=eq.${encodeURIComponent(editing.updated_at)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(r)});if(!result.length)throw Error('別の画面で更新されています。再読込して確認してください。')}
 else await rest('logistics_timee_work_time','',{method:'POST',body:JSON.stringify(r)});
 clear();await load();say('保存しました。WMS作業分析の再読み込みで時間・件/時に反映されます。');
 }catch(e){say(e.message,true)}finally{busy=false;form.querySelectorAll('input,button').forEach(x=>x.disabled=false);date.disabled=false}};
 date.onchange=()=>{clear();load()};$('timeeReload').onclick=()=>{clear();load()};$('timeeClear').onclick=clear;
 const previousLoad=loadToday;loadToday=async function(){await previousLoad();if(!busy){date.value=selectedWorkDate;clear();await load()}};
 const previousShow=showApp;showApp=function(){previousShow();if(!user){generation++;saved=[];wms=[];clear();body.innerHTML=''}};
 if(user)load();
})();
