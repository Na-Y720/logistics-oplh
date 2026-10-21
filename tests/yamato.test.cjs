const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../cost.js'), 'utf8');
const parse = vm.runInNewContext(source.slice(source.indexOf('function parseYamatoText'), source.indexOf('function isoDate')) + ';parseYamatoText');

// Synthetic fixture matching pdf-parse cell order. No private addresses or tracking numbers.
const amounts = [709,855,1027,709,764,764,1027,764,1118,1027];
const fmt = n => n.toLocaleString('en-US');
const neko = 'ネコポス\n           190\n          1           190             0          0\n';
const cod = amounts.map(n => '宅急便着払\n         '+fmt(n)+'\n          1         '+fmt(n)+'             0          0\n').join('');
const total = '19,5624,096,0083,723,64400372,364\n合計(税込)';
const footer = '\n*は軽減税率適用商品です。\n37 13,894 13,894 0 0-\n２０２６年１０月２０日\n請求明細書\n356\n73181';
const fixture = neko.repeat(19552) + cod + total + footer;
function check(x) {
  assert.equal(x.invoiceCount,19562);
  assert.equal(x.adoptedCount,19552);
  assert.equal(x.originalGrossCost,4096008);
  assert.equal(x.originalNetCost,3723644);
  assert.equal(x.taxCost,372364);
  assert.equal(x.codExcludedCount,10);
  assert.equal(x.codExcludedNet,8764);
  assert.equal(x.netCost,3714880);
  assert.equal(x.grossCost,4086368);
}
test('webmeisai: concatenated totals before label, multiline detail, footer',()=>check(parse(fixture)));
test('full-width digits and spaced label',()=>check(parse(fixture.replace(total,
  '１９，５６２４，０９６，００８３，７２３，６４４００３７２，３６４\n合 計（税 込）'))));
test('six separate cells after label, with blank lines',()=>check(parse(fixture.replace(total,
  '合計(税込)\n\n19,562\n4,096,008\n3,723,644\n0\n0\n372,364'))));
test('six separate cells before label',()=>check(parse(fixture.replace(total,
  '19,562 4,096,008 3,723,644 0 0 372,364 合計(税込)'))));
test('宅急便着払い spelling and inline details',()=>check(parse(fixture.replace(/宅急便着払/g,'宅急便着払い').replace(/\n +/g,' '))));
test('legacy count-first layout',()=>check(parse(
  'ネコポス 1 190 0 0 190\n'.repeat(19552)+amounts.map(n=>'宅急便着払 1 '+n+' 0 0 '+n+'\n').join('')+
  '合計(税込) 19,562 4,096,008 3,723,644 0 0 372,364')));
test('no COD preserves invoice totals',()=>{
  const x=parse(fixture.replace(cod,''));
  assert.equal(x.codExcludedNet,0);assert.equal(x.grossCost,4096008);assert.equal(x.netCost,3723644);
});
test('missing or inconsistent totals never fall back to page subtotals',()=>{
  assert.throws(()=>parse(fixture.replace(total,'')));
  assert.throws(()=>parse(fixture.replace('4,096,008','4,096,009')));
});
test('truncated COD detail is rejected rather than silently included',()=>{
  assert.throws(()=>parse(fixture.replace(cod,'宅急便着払\n709\n1\n')));
});
test('counts exceeding invoice total are rejected',()=>assert.throws(()=>parse(neko+fixture)));
test('conflicting invoice totals are rejected',()=>assert.throws(()=>parse(fixture+'\n合計(税込) 20 1100 1000 0 0 100')));
test('real PDF through the same extractor as api/parse-pdf.js', {skip:!process.env.YAMATO_PDF_PATH}, async()=>{
  const extract = require('../lib/pdf-text.cjs');
  const result = await extract(fs.readFileSync(process.env.YAMATO_PDF_PATH));
  assert.equal(result.numpages,356);
  check(parse(result.text));
});
