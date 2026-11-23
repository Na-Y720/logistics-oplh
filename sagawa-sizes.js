(function(root){
 'use strict';
 const keys=['60','80','100plus','unknown'];
 const empty=()=>({invoices:Object.fromEntries(keys.map(k=>[k,0])),packages:Object.fromEntries(keys.map(k=>[k,0])),totalInvoices:0,totalPackages:0,weightPackages:0});
 function csv(text){
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++}else quote=!quote}else if(ch===','&&!quote){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quote){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=ch}
  if(quote)throw new Error('CSVの引用符が閉じていません。');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
 }
 const norm=x=>String(x??'').normalize('NFKC').replace(/^\uFEFF/,'').trim();
 function integer(v,label){const s=norm(v);if(!/^\d+$/.test(s)||!Number.isSafeInteger(Number(s)))throw new Error(label+'が不正です。');return Number(s)}
 function month(v){const s=norm(v).replace(/[\/-]/g,'');if(!/^\d{8}$/.test(s))throw new Error('請求書締日が不正です。');const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6),dt=new Date(Date.UTC(y,m-1,d));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw new Error('請求書締日が不正です。');return s.slice(0,4)+'-'+s.slice(4,6)}
 function bucket(value,unit){if(value<=0)return 'unknown';if(unit==='サイズ')return value<=60?'60':value<=80?'80':'100plus';if(unit.toLowerCase()==='kg')return value<=2?'60':value<=5?'80':'100plus';return 'unknown'}
 function add(target,details){let max=0,unknown=false;target.totalInvoices++;
  for(const d of details){target.packages[d.bucket]+=d.quantity;target.totalPackages+=d.quantity;if(d.unit.toLowerCase()==='kg')target.weightPackages+=d.quantity;if(d.bucket==='unknown')unknown=true;max=Math.max(max,keys.indexOf(d.bucket))}
  target.invoices[unknown?'unknown':keys[max]]++;
 }
 function createAccumulator(){return{months:new Map(),seen:new Map(),duplicateRows:0}}
 function parse(text,fileName='',acc=createAccumulator()){
  const rows=csv(text);if(rows.length<2)throw new Error('佐川CSVにデータがありません。');const head=rows.shift().map(norm),ix=Object.fromEntries(head.map((h,i)=>[h,i]));
  for(const h of ['請求書締日','お問合せNO','総個数','運賃請求金額','着店名称','集荷店名称','明細1重量','明細1個数'])if(ix[h]==null)throw new Error('「'+h+'」列が見つかりません。拡張請求CSVを選択してください。');
  for(const row of rows){const get=h=>norm(row[ix[h]]),ym=month(get('請求書締日')),tracking=get('お問合せNO');if(!tracking)throw new Error('お問い合わせ番号が空欄です。');const quantity=integer(get('総個数'),'総個数'),details=[];
   for(let i=1;i<=8;i++){if(ix['明細'+i+'個数']==null)continue;const q=integer(get('明細'+i+'個数')||'0','明細個数');if(!q)continue;const v=integer(get('明細'+i+'重量'),'明細重量'),unit=get('明細'+i+'重量区分(文字表記)')||({'10':'サイズ','00':'Kg'}[get('明細'+i+'重量区分')]||'');details.push({quantity:q,value:v,unit,bucket:bucket(v,unit)})}
   if(!quantity||details.reduce((s,d)=>s+d.quantity,0)!==quantity)throw new Error('総個数と明細個数が一致しない伝票があります。');
   const costText=get('運賃請求金額').replace(/[,¥￥\s]/g,'');if(!/^-?\d+(\.\d+)?$/.test(costText))throw new Error('運賃請求金額が不正です。');const cost=Number(costText),from=get('集荷店名称'),dest=get('着店名称'),excluded=dest.includes('丸岡')&&!from.includes('丸岡');
   const id=ym+'|'+get('請求書番号')+'|'+tracking,signature=JSON.stringify([quantity,details,cost,from,dest]);
   if(acc.seen.has(id)){if(acc.seen.get(id)!==signature)throw new Error('同じ伝票に異なる内容があります。同月の修正版と旧版を同時に選択しないでください。');acc.duplicateRows++;continue}acc.seen.set(id,signature);
   let m=acc.months.get(ym);if(!m){m={version:1,month:ym,all:empty(),shipping:empty(),excludedInvoices:0,netCost:0,files:[]};acc.months.set(ym,m)}if(!m.files.includes(fileName))m.files.push(fileName);
   add(m.all,details);if(excluded)m.excludedInvoices++;else{add(m.shipping,details);m.netCost+=cost}
  }return acc;
 }
 const api={keys,empty,csv,bucket,createAccumulator,parse};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SagawaSizes=api;
})(typeof window==='undefined'?globalThis:window);
