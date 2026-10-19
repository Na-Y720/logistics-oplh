(function(root){
'use strict';
const clean=v=>String(v??'').trim(), key=parts=>JSON.stringify(parts.map(clean));
function csv(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(!quoted&&cell!=='')throw Error('CSVの引用符が不正です');else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell=''}else cell+=c;}
 if(quoted)throw Error('CSVの引用符が閉じていません');row.push(cell);if(row.some(x=>x!==''))rows.push(row);
 if(rows[0])rows[0]=rows[0].map(x=>clean(x).replace(/^\uFEFF/,''));return rows;
}
function decode(buffer){try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer)}catch{return new TextDecoder('shift_jis',{fatal:true}).decode(buffer)}}
function number(v){const s=clean(v).replace(/,/g,'');if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))throw Error('数量が不正です: '+clean(v));const n=Number(s);if(!Number.isFinite(n))throw Error('数量が範囲外です');return n;}
function snapshot(text){
 const [headers,...rows]=csv(text);if(!headers)throw Error('CSVが空です');
 const required=['拠点コード','荷主コード','ロケーション','商品コード','在庫数'];for(const h of required)if(!headers.includes(h))throw Error('対象エリアCSVに必要な列がありません: '+h);
 if(new Set(headers).size!==headers.length)throw Error('CSVの列名が重複しています');
 const items=new Map(),locations=new Set(),products=new Set();let stock=0;
 rows.forEach((r,i)=>{if(r.length!==headers.length)throw Error((i+2)+'行目の列数が一致しません');const o=Object.fromEntries(headers.map((h,j)=>[h,clean(r[j])]));for(const h of required)if(o[h]==='')throw Error((i+2)+'行目の '+h+' が空です');
 const warehouse=o['拠点コード'],client=o['荷主コード'],location=o['ロケーション'],sku=o['商品コード'],qty=number(o['在庫数']),locationKey=key([warehouse,client,location]),pairKey=key([warehouse,client,location,sku]);
 const item=items.get(pairKey)||{key:pairKey,locationKey,warehouse,client,location,sku,name:o['商品名']||'',qty:0};item.qty+=qty;items.set(pairKey,item);locations.add(locationKey);products.add(sku);stock+=qty;});
 if(!rows.length)throw Error('CSVに在庫明細がありません');return{headers,rawRows:rows,items:[...items.values()],locationKeys:[...locations],rowCount:rows.length,pairCount:items.size,skuCount:products.size,stock};
}
function stamp(value,dateValue){
 let s=clean(value).normalize('NFKC');if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(s))s=clean(dateValue)+' '+s;
 const m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);if(!m)throw Error('日時は年月日と時分（任意で秒）が必要です: '+s);
 const [y,mo,d,h,mi,se]=m.slice(1).map(x=>Number(x||0));const utc=new Date(Date.UTC(y,mo-1,d,h,mi,se));if(utc.getUTCFullYear()!==y||utc.getUTCMonth()!==mo-1||utc.getUTCDate()!==d||h>23||mi>59||se>59)throw Error('存在しない日時です: '+s);
 return new Date(utc.getTime()-9*3600000).toISOString();
}
function suggest(headers){const pick=a=>a.find(x=>headers.includes(x))||'';return{timestamp:pick(['登録日時','作業日時','処理日時','日時','作業時刻','処理時刻','登録時刻','時刻']),date:pick(['業務日付','作業日付','作業日']),location:pick(['ロケーション','ロケーションコード','ロケ']),sku:pick(['商品コード']),quantity:pick(['実績数','数量']),warehouse:pick(['拠点コード','倉庫コード']),client:pick(['荷主コード']),warehouseLiteral:'',clientLiteral:''};}
function events(source){
 const m=source.mapping;if(!m)throw Error(source.source_filename+': WMS列の対応付けを保存してください');
 for(const f of ['timestamp','location','sku','quantity'])if(!m[f]||!source.headers.includes(m[f]))throw Error(source.source_filename+': '+f+' の列を指定してください');
 for(const f of ['warehouse','client'])if(!m[f]&&!clean(m[f+'Literal']))throw Error('拠点・荷主は列または固定コードの指定が必要です');
 return source.records.map(r=>{const get=f=>clean(r.values[source.headers.indexOf(m[f])]);const warehouse=m.warehouse?get('warehouse'):clean(m.warehouseLiteral),client=m.client?get('client'):clean(m.clientLiteral),location=get('location'),sku=get('sku');if(!warehouse||!client||!location||!sku)throw Error(source.source_filename+' '+r.row+'行: 拠点・荷主・ロケ・商品コードが空です');
 const timestamp=stamp(get('timestamp'),m.date?get('date'):r.work_date),quantity=Math.abs(number(get('quantity'))),direction=r.activity==='調整入庫'?1:r.activity==='調整出庫'?-1:0;if(!direction)throw Error('対象外の作業区分です');return{id:source.id+':'+r.row,source:source.source_filename,row:r.row,timestamp,warehouse,client,location,sku,locationKey:key([warehouse,client,location]),key:key([warehouse,client,location,sku]),direction,quantity};});
}
function analyze(sessions,allEvents,now=new Date().toISOString()){
 const selected=[],stats=[],productMap=new Map(),seen=new Set();
 for(const s of sessions){const base=new Set(s.snapshot.items.map(x=>x.key)),locs=new Set(s.location_keys),start=Date.parse(s.start_at),end=Date.parse(s.end_at||now);if(!(end>start))throw Error('終了は開始より後にしてください');const rows=allEvents.filter(e=>locs.has(e.locationKey)&&Date.parse(e.timestamp)>=start&&Date.parse(e.timestamp)<end);
 const changed=new Set(),plus=new Set(),minus=new Set(),newPairs=new Set();let plusQty=0,minusQty=0,plusCount=0,minusCount=0;const eligible=new Set(s.snapshot.items.map(x=>x.sku)),affected=new Set();
 for(const e of rows){if(seen.has(e.id))throw Error('同じWMS明細が複数の棚卸しに含まれています。対象時間の重複を確認してください');seen.add(e.id);changed.add(e.key);if(!base.has(e.key))newPairs.add(e.key);(e.direction>0?plus:minus).add(e.key);if(e.direction>0){plusQty+=e.quantity;plusCount++}else{minusQty+=e.quantity;minusCount++}eligible.add(e.sku);affected.add(e.sku);selected.push({...e,session:s.name,sessionId:s.id});const p=productMap.get(e.sku)||{sku:e.sku,plus:0,minus:0,plusQty:0,minusQty:0,affected:0,eligible:0};if(e.direction>0){p.plus++;p.plusQty+=e.quantity}else{p.minus++;p.minusQty+=e.quantity}productMap.set(e.sku,p);}
 stats.push({session:s,plusCount,minusCount,plusQty,minusQty,changed:changed.size,plusPairs:plus.size,minusPairs:minus.size,baseline:base.size,baselineChanged:[...changed].filter(k=>base.has(k)).length,newPairs:newPairs.size,eligible,affected});
 }
 for(const p of productMap.values()){p.eligible=stats.filter(s=>s.eligible.has(p.sku)).length;p.affected=stats.filter(s=>s.affected.has(p.sku)).length;}
 const totals=stats.reduce((a,s)=>{for(const k of ['plusCount','minusCount','plusQty','minusQty','changed','baseline','baselineChanged','newPairs'])a[k]+=s[k];return a},{plusCount:0,minusCount:0,plusQty:0,minusQty:0,changed:0,baseline:0,baselineChanged:0,newPairs:0});
 return{stats,totals,rows:selected,products:[...productMap.values()].sort((a,b)=>b.affected-a.affected||(b.plus+b.minus)-(a.plus+a.minus)||a.sku.localeCompare(b.sku))};
}
const api={csv,decode,number,snapshot,stamp,suggest,events,analyze,key};if(typeof module!=='undefined')module.exports=api;root.InventoryCore=api;
})(typeof window==='undefined'?globalThis:window);
