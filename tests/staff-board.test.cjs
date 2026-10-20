const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../staff-board-core.js');
test('area order matches the board',()=>assert.deepEqual(B.areas,['A','B','C','D','E','F','G','H','I','J','梱包','パスソート','配送佐川','配送南郵便局']));
test('retirement date is inclusive; former staff remain usable on historical dates',()=>{
  assert.equal(B.eligible({name:'test',is_active:false,retirement_date:'2026-10-20'},'2026-10-20'),true);
  assert.equal(B.eligible({name:'test',is_active:true,retirement_date:'2026-10-20'},'2026-10-21'),false);
  assert.equal(B.eligible({name:'test',is_active:false},'2026-10-20'),false);
  assert.equal(B.eligible({name:'__internal',is_active:true},'2026-10-20'),false);
});
test('move between areas and periods without retaining the source',()=>{
  const a=B.move(null,null,'AM','A'),b=B.move(a,'AM','PM','G');
  assert.deepEqual(B.cards(b),[{slot:'PM',place:'G'}]);
  assert.deepEqual(B.cards(a),[{slot:'AM',place:'A'}]);
});
test('AM and PM can differ; full day replaces both atomically',()=>{
  const row=B.move(B.move(null,null,'AM','A'),null,'PM','B');
  assert.equal(B.cards(row).length,2);
  const all=B.move(row,'AM','ALL','C');
  assert.deepEqual(B.cards(all),[{slot:'ALL',place:'C'}]);
  assert.equal(all.am,all.pm);
  assert.deepEqual(B.cards(B.move(all,'ALL','PM','休憩 11:30')),[{slot:'PM',place:'休憩 11:30'}]);
});
test('invalid targets are rejected and name formatting does not change ID',()=>{
  assert.throws(()=>B.move(null,null,'night','A'));
  assert.throws(()=>B.move(null,null,'AM','unknown'));
  assert.equal(B.cleanName('123456 テスト 氏名'),'テスト 氏名');
});
test('attendance keeps unregistered distinct from off and paid leave',()=>{
  assert.equal(B.attendance(undefined).key,'unknown');
  assert.equal(B.attendance({assignment:'work'}).working,true);
  assert.equal(B.attendance({assignment:'off',lock_type:'manual_off'}).key,'off');
  assert.equal(B.attendance({assignment:'off',lock_type:'paid_leave'}).key,'leave');
  assert.equal(B.attendance({assignment:'work',lock_type:'paid_leave'}).working,false);
});
test('shift-derived cards are virtual and respect existing half-day placements',()=>{
  const work={assignment:'work'},off={assignment:'off'};
  assert.deepEqual(B.pendingCards(null,work),[{slot:'ALL',place:'未配置'}]);
  assert.deepEqual(B.pendingCards(null,off),[{slot:'ALL',place:'欠勤'}]);
  assert.deepEqual(B.pendingCards(null,null),[]);
  const row={am:'A',pm:null,full_day:false};
  assert.deepEqual(B.pendingCards(row,work),[{slot:'PM',place:'未配置'}]);
  assert.deepEqual(row,{am:'A',pm:null,full_day:false});
  assert.deepEqual(B.pendingCards({am:'A',pm:'A',full_day:true},work),[]);
});

test('working hours follow the company month and keep unset monthly values',()=>{
  assert.equal(B.planMonth('2026-10-20'),'2026-10-01');
  assert.equal(B.planMonth('2026-10-21'),'2026-11-01');
  assert.equal(B.planMonth('2026-12-21'),'2027-01-01');
  const defaults={start_time:'08:15:00',end_time:'17:15:00'};
  assert.equal(B.workHours(null,defaults),'08:15～17:15');
  assert.equal(B.workHours({start_time:'09:00:00',end_time:'15:00:00'},defaults),'09:00～15:00');
  assert.equal(B.workHours({start_time:null,end_time:null},defaults),'時間未設定');
  for(const place of ['J','梱包','パスソート','配送佐川','配送南郵便局'])assert.equal(B.move(null,null,'ALL',place).am,place);
});

