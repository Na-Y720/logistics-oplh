const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const nodes=new Map(),tabs=['today','monthly','admin','timee'].map(tab=>({dataset:{tab},classList:{toggle(){}}}));
function get(id){if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',innerHTML:'',classList:{hidden:false,toggle(k,v){this[k]=v}},querySelectorAll(selector){if(selector==='[data-timee-edit]'){this.editButtons=[...this.innerHTML.matchAll(/data-timee-edit="([^"]+)"/g)].map(m=>({dataset:{timeeEdit:m[1]}}));return this.editButtons}return []},reset(){},disabled:false});return nodes.get(id)}
get('timeeMonthMode').value='closing';
const rows=[{id:'a',work_date:'2026-11-21',worker_code:'800001',worker_name:'A',first_start:'09:00',first_end:'10:00',picking_minutes:60,paid_minutes:240},{id:'b',work_date:'2026-11-22',worker_code:'800001',worker_name:'B',first_start:'09:00',first_end:'11:00',picking_minutes:120,paid_minutes:240}];
let queries=[],writes=[];
const ctx=vm.createContext({console,Date,Set,Map,TimeeModel:require('../timee-model'),$:get,document:{querySelectorAll:()=>tabs},user:null,localDateISO:(d=new Date(2026,10,23))=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),companyMonthToday:(d=new Date(2026,10,23))=>new Date(Date.UTC(d.getFullYear(),d.getMonth()+(d.getDate()>20?1:0),1)).toISOString().slice(0,7),fmtMin:n=>Math.floor(n/60)+':'+String(n%60).padStart(2,'0'),esc:x=>String(x),renderTimeeHistory(){},showApp(){},loadToday(){throw Error('must not share part input')},loadMonth(){},loadImportStatus(){},rest:async(table,q,opt)=>{queries.push(q);if(opt){writes.push(JSON.parse(opt.body));return [JSON.parse(opt.body)]}if(table==='logistics_timee_wms_history')return [];return table==='logistics_timee_work_time'?rows:[{work_date:'2026-11-21',worker_code:'800001',activity_key:'picking',action_count:100},{work_date:'2026-11-22',worker_code:'800001',activity_key:'picking',action_count:300}]}});
vm.runInContext(fs.readFileSync(__dirname+'/../timee.js','utf8'),ctx);
(async()=>{
ctx.user={id:'owner'};await tabs[3].onclick();
assert.equal(get('todayTab').classList.hidden,true);assert.equal(get('timeeTab').classList.hidden,false);
assert.ok(queries[0].includes('work_date=gte.2026-11-21&work_date=lte.2026-12-20'));
assert.ok(get('timeeBody').innerHTML.includes('2026/11/21'));assert.ok(get('timeeBody').innerHTML.includes('2026/11/22'));
assert.ok(get('timeeBody').innerHTML.includes('<td>100</td><td>100.0</td>'));assert.ok(get('timeeBody').innerHTML.includes('<td>300</td><td>150.0</td>'));
assert.ok(get('timeeNames').innerHTML.includes('value="A"'));assert.ok(get('timeeNames').innerHTML.includes('value="B"'));assert.ok(get('timeeSummary').textContent.includes('梱包 5:00'));assert.ok(get('timeeSummary').textContent.includes('登録 2件'));assert.ok(get('timeeSummary').textContent.includes('ピッキング 3:00'));
get('timeeName').value='C';get('timeeCode').value='800001';get('timeeStart1').value='09:00';get('timeeEnd1').value='10:00';get('timeeHours').value='4';get('timeeMinutes').value='0';get('timeeNote').value='';
await get('timeeForm').onsubmit({preventDefault(){}});assert.equal(writes.length,1);assert.equal(writes[0].work_date,'2026-11-23');
get('timeeBody').editButtons[0].onclick();assert.equal(get('timeeDate').readOnly,false);
assert.equal(get('timeeCode').value,'800001');assert.equal(get('timeeCode').readOnly,true);
get('timeeDate').value='2026-11-22';get('timeeDate').onchange();assert.equal(get('timeeCode').value,'800002');await get('timeeForm').onsubmit({preventDefault(){}});assert.equal(writes.length,2);assert.equal(writes[1].worker_code,'800002');assert.ok(queries.some(q=>q.includes('id=eq.a')));
get('timeeDate').value='2026-11-24';get('timeeDate').onchange();assert.equal(get('timeeCode').value,'800001');
get('timeeMonth').value='2026-02';get('timeeMonthMode').value='calendar';await get('timeeMonthMode').onchange();await new Promise(r=>setImmediate(r));assert.ok(queries.some(q=>q.includes('work_date=gte.2026-02-01&work_date=lte.2026-02-28')));
const html=fs.readFileSync(__dirname+'/../worktime.html','utf8');assert.ok(html.indexOf('id="timeePanel"')>html.indexOf('id="timeeTab"'));assert.equal((html.match(/id="timeeReload"/g)||[]).length,1);
console.log('PASS: dedicated tab, monthly date bounds, separate daily WMS matching, monthly totals, same code on another day, calendar February');
})().catch(e=>{console.error(e);process.exitCode=1});
