(function(root){
 const minutes=v=>{const m=String(v||'').match(/^(\d{2}):([0-5]\d)(?::00)?$/);return m&&Number(m[1])<24?Number(m[1])*60+Number(m[2]):NaN};
 const validCode=(code,date)=>/^800\d{3}$/.test(code)||(date<'2026-10-07'&&/^90000[1-5]$/.test(code));
 function calculate(r){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.work_date)||Number.isNaN(Date.parse(r.work_date)))throw Error('作業日を入力してください。');
  if(!validCode(r.worker_code,r.work_date))throw Error('WMS番号は800001などを入力してください。旧900001〜900005は2026/10/6以前のみ使用できます。');
  if(!r.worker_name.trim()||r.worker_name.length>100)throw Error('氏名を入力してください（100文字以内）。');
  const start=minutes(r.first_start),end=minutes(r.first_end);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('①の開始・終了時刻を正しく入力してください。');
  let pick=end-start;
  if(r.second_start||r.second_end){const s=minutes(r.second_start),e=minutes(r.second_end);if(!Number.isFinite(s)||!Number.isFinite(e)||s<end||e<=s)throw Error('②は①の終了以降で、開始・終了を両方入力してください。');pick+=e-s}
  if(!Number.isInteger(r.paid_minutes)||r.paid_minutes<pick||r.paid_minutes>1440)throw Error('実働時間はピッキング時間以上、24時間以内で入力してください。');
  return {picking:pick,packing:r.paid_minutes-pick};
 }
 const api={minutes,validCode,calculate};if(typeof module!=='undefined')module.exports=api;else root.TimeeModel=api;
})(globalThis);
