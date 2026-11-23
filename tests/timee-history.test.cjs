const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),M=require('../timee-history-model');
const e=(time,day='2026-11-07',code='800001')=>({work_date:day,worker_code:code,timestamp:day+' '+time});
let rows=M.build([e('10:00:00'),e('09:00:00'),e('09:29:59'),e('10:30:00'),e('10:45:00'),e('10:45:00'),e('09:00:00','2026-11-08'),e('09:00:00','2026-11-07','800004')]);
assert.equal(rows.length,2);assert.equal(rows[0].sessions.length,3);assert.equal(rows[0].picking_minutes,45);assert.equal(rows[1].picking_minutes,0);assert.equal(rows[0].action_count,6);
assert.throws(()=>M.build([e('not time')]));
// Exercise the production CSV parser, not just its helper.
const source=fs.readFileSync(__dirname+'/../cost.js','utf8');
const parser=source.slice(source.indexOf('async function parseWmsFile('),source.indexOf('function normalizeAutoLine('));
const lines=['業務日付,作業区分,実績数,作業者コード,作業者名,登録日時','2026-11-07,ピッキング,1,800001,タイミー1,2026-11-07 09:00:00','2026-11-07,ピッキング,2,800001,タイミー1,2026-11-07 09:20:00','2026-11-07,ピッキング,1,800001,タイミー1,2026-11-07 10:00:00','2026-11-07,ピッキング,2,800001,タイミー1,2026-11-07 10:10:00'];
const ctx=vm.createContext({TimeeHistory:M,currentBundle:{ym:'2026-11'},user:{id:'owner'},monthRange:()=>['2026-10-21','2026-11-20'],tdStaffMaps:async()=>({byCode:new Map(),byName:new Map()}),streamShiftJisLines:async(f,cb)=>lines.forEach(cb),csvLine:l=>l.split(','),normalizeHeader:x=>x,normalizeDateCell:x=>x,normalizeWorkerName:x=>x,WMS_ACTIVITY_MAP:{'ピッキング':{key:'picking',label:'ピッキング'}}});vm.runInContext(parser,ctx);
(async()=>{const p=await vm.runInContext("parseWmsFile({name:'test.csv',size:100})",ctx);assert.equal(p.timeeHistory[0].picking_minutes,30);assert.equal(p.timeeHistory[0].sessions.length,2);assert.equal(p.rows[0].action_count,4);
assert.ok(source.slice(source.indexOf('async function importWms()'),source.indexOf('async function importAutoPacking()')).includes('replace_timee_wms_history'));
console.log('PASS: 30-minute split boundary, unsorted input, single scan, duplicates, date/code grouping and production CSV parser');})().catch(e=>{console.error(e);process.exitCode=1});
