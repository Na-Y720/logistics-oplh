const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'cs.js'),'utf8').split("\ndocument.querySelectorAll('.tab')")[0],context);
vm.runInContext(fs.readFileSync(path.join(root,'cs-trends.js'),'utf8').split('\n(()=>{')[0],context);
const run=code=>JSON.parse(JSON.stringify(vm.runInContext(code,context)));

test('fiscal-year rollover on February 21',()=>{
  assert.deepEqual(run("csFiscalYear('2026-02-20')"),{start:'2025-02-21',end:'2026-02-20'});
  assert.deepEqual(run("csFiscalYear('2026-02-21')"),{start:'2026-02-21',end:'2027-02-20'});
});
test('each mode covers every fiscal-year day once, including leap day',()=>{
  for(const today of ['2026-10-13','2024-02-20','2024-02-21'])for(const mode of ['week','company','calendar']){
    const buckets=run(`csTrendBuckets('${today}','${mode}')`),fy=run(`csFiscalYear('${today}')`);
    assert.equal(buckets[0].start,fy.start);assert.equal(buckets.at(-1).end,fy.end);
    buckets.forEach((b,i)=>{
      assert.ok(b.start<=b.end);
      if(i)assert.equal(b.start,run(`addDays('${buckets[i-1].end}',1)`));
      if(mode==='week'){
        if(i)assert.equal(new Date(b.start+'T00:00:00').getDay(),1);
        if(i<buckets.length-1)assert.equal(new Date(b.end+'T00:00:00').getDay(),0);
      }
    });
    if(mode==='company')assert.equal(buckets.length,12);
    if(mode==='calendar')assert.equal(buckets.length,13);
  }
});
test('sum numerators/denominators across days and staff; retain recorded zeros and missing gaps',()=>{
  const result=run(`csAggregateTrends('2026-10-13','company',[
    {report_date:'2026-02-21',phone_customer_count:1,phone_first_resolution_count:1,mail_site_return_count:2,site_return_first_resolution_count:2},
    {report_date:'2026-02-22',phone_customer_count:99,phone_first_resolution_count:9,mail_site_return_count:98,site_return_first_resolution_count:18,mail_first_resolution_count:999},
    {report_date:'2026-03-21',phone_customer_count:10,phone_first_resolution_count:0},
    {report_date:'2026-02-20',phone_customer_count:999},
    {report_date:'2026-10-14',phone_customer_count:999}
  ],[
    {report_date:'2026-02-21',order_count:100},{report_date:'2026-02-22',order_count:200},
    {report_date:'2026-03-21',order_count:0},{report_date:'2026-10-14',order_count:999}
  ])`);
  assert.equal(result[0].phoneRate,10);assert.equal(result[0].mailRate,20);assert.equal(result[0].orders,300);
  assert.equal(result[1].phoneRate,0);assert.equal(result[1].mailRate,null);assert.equal(result[1].orders,0);
  assert.equal(result[2].phoneRate,null);assert.equal(result[2].orders,null);assert.equal(result[7].orders,null);
});
test('boundary records are excluded or placed in clipped week/calendar buckets',()=>{
  for(const mode of ['week','calendar']){
    const result=run(`csAggregateTrends('2027-02-20','${mode}',[],[
      {report_date:'2026-02-20',order_count:999},{report_date:'2026-02-21',order_count:2},
      {report_date:'2027-02-20',order_count:3},{report_date:'2027-02-21',order_count:999}
    ])`);
    assert.equal(result[0].orders,2);assert.equal(result.at(-1).orders,3);
    assert.equal(result.reduce((sum,b)=>sum+(b.orders||0),0),5);
  }
});
test('pagination follows actual returned rows even with a smaller server cap',async()=>{
  const offsets=[];
  context.rest=async(table,query)=>{
    const p=new URLSearchParams(query);assert.equal(p.get('owner_id'),'eq.owner');
    assert.equal(p.get('order'),'report_date.asc,id.asc');
    const offset=Number(p.get('offset'));offsets.push(offset);
    return Array.from({length:Math.min(200,1205-offset)},(_,i)=>({id:offset+i}));
  };
  const rows=await context.csReadTrendRows('cs_daily_reports','owner','2026-02-21','2026-10-13','report_date',()=>true);
  assert.equal(rows.length,1205);assert.deepEqual(offsets,[0,200,400,600,800,1000,1200,1205]);
});
