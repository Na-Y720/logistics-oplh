(function (root) {
  'use strict';
  const areas = ['A','B','C','G','H','I','D','E','F'];
  const extras = ['未配置','休憩 11:30','休憩 12:00','休憩 12:30','応援','補充','予備','欠勤'];
  const places = [...areas, ...extras];
  function eligible(staff, date) {
    return !!staff && !String(staff.name).startsWith('__') &&
      (staff.retirement_date ? date <= staff.retirement_date : staff.is_active === true);
  }
  function cards(row) {
    if (row.full_day) return [{slot:'ALL', place:row.am}];
    return ['AM','PM'].filter(s=>row[s.toLowerCase()]).map(s=>({slot:s,place:row[s.toLowerCase()]}));
  }
  function move(row, from, to, place) {
    if (!['AM','ALL','PM'].includes(to) || !places.includes(place) ||
        (from !== null && !['AM','ALL','PM'].includes(from))) throw Error('配置先が不正です');
    const next = {am:row?.am ?? null, pm:row?.pm ?? null, full_day:!!row?.full_day};
    if (from === 'ALL') { next.am=null; next.pm=null; next.full_day=false; }
    else if (from) { next[from.toLowerCase()]=null; next.full_day=false; }
    if (to === 'ALL') { next.am=place; next.pm=place; next.full_day=true; }
    else { next[to.toLowerCase()]=place; next.full_day=false; }
    return next;
  }
  function cleanName(name) {
    return String(name ?? '').replace(/^(?:\d{6}|LEGACY-S\d+)[\s\u00a0]+/,'');
  }
  function attendance(shift) {
    if (shift?.lock_type === 'paid_leave') return {key:'leave',label:'有給',working:false};
    if (shift?.assignment === 'work') return {key:'work',label:'出勤予定',working:true};
    if (shift?.assignment === 'off') return {key:'off',label:'休み',working:false};
    return {key:'unknown',label:'シフト未登録',working:false};
  }
  function pendingCards(row, shift) {
    const state=attendance(shift);
    if(state.key==='unknown')return [];
    if(row?.full_day)return [];
    const place=state.working?'未配置':'欠勤';
    if(!row?.am&&!row?.pm)return [{slot:'ALL',place}];
    return ['AM','PM'].filter(slot=>!row?.[slot.toLowerCase()]).map(slot=>({slot,place}));
  }
  const api={areas,extras,places,eligible,cards,move,cleanName,attendance,pendingCards};
  if (typeof module !== 'undefined') module.exports=api;
  else root.StaffBoard=api;
})(globalThis);
