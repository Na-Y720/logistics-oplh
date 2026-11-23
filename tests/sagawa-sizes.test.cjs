const test=require('node:test'),assert=require('node:assert/strict'),S=require('../sagawa-sizes.js');
const head=['請求書番号','請求書締日','お問合せNO','総個数','運賃請求金額','着店名称','集荷店名称','明細１重量','明細１個数','明細１重量区分(文字表記)','明細２重量','明細２個数','明細２重量区分(文字表記)'];
const row=(id='a',size=60,q=1,unit='サイズ',more=[])=>['bill','20261120',id,q,400,'東京','丸岡',size,q,unit,0,0,'',...more];
const csv=rows=>[head,...rows].map(r=>r.join(',')).join('\r\n');
test('classifies size, kg, incoming and unknown without hiding quantities',()=>{
 const inbound=row('in',80);inbound[5]='丸岡';inbound[6]='東京';
 const x=S.parse(csv([row('a'),row('b',5,1,'Kg'),row('c',10,1,'Kg'),row('d',3,1,'other'),inbound])).months.get('2026-11');
 assert.deepEqual(x.all.invoices,{'60':1,'80':2,'100plus':1,unknown:1});assert.equal(x.shipping.totalInvoices,4);assert.equal(x.excludedInvoices,1);assert.equal(x.netCost,1600);
});
test('mixed packages use maximum size for one invoice but each package retains its size',()=>{
 const r=row();r[3]=3;r[7]=80;r[8]=2;r[10]=140;r[11]=1;r[12]='サイズ';const x=S.parse(csv([r])).months.get('2026-11').shipping;
 assert.equal(x.totalInvoices,1);assert.equal(x.invoices['100plus'],1);assert.equal(x.packages['80'],2);assert.equal(x.packages['100plus'],1);assert.equal(x.totalPackages,3);
});
test('duplicate file is idempotent; conflicting same shipment fails',()=>{
 const a=S.createAccumulator(),text=csv([row()]);S.parse(text,'first',a);S.parse(text,'copy',a);assert.equal(a.months.get('2026-11').all.totalInvoices,1);assert.equal(a.duplicateRows,1);assert.throws(()=>S.parse(csv([row('a',80)]),'different',a),/異なる内容/);
});
test('bad quantity, date and costs cannot silently corrupt totals',()=>{
 const q=row();q[3]=2;assert.throws(()=>S.parse(csv([q])),/一致/);const d=row();d[1]='20260230';assert.throws(()=>S.parse(csv([d])),/締日/);const c=row();c[4]='oops';assert.throws(()=>S.parse(csv([c])),/金額/);
});
test('months are assigned from billing cutoff and normalized headers',()=>{
 const r=row('b');r[1]='20261020';const a=S.parse(csv([row(),r]));assert.deepEqual([...a.months.keys()],['2026-11','2026-10']);
});
test('quoted comma, embedded newline and escaped quote',()=>{assert.deepEqual(S.csv('a,b\r\n"x,y","z\n""t"""'),[['a','b'],['x,y','z\n"t"']])});
