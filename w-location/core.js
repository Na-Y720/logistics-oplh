(function(root){
'use strict';
function parse(text){
 const rows=[]; let cells=[],i=0;
 while(i<text.length){let start=i,value='',quoted=text[i]==='"';
  if(quoted){i++;let closed=false;while(i<text.length){if(text[i]==='"'){if(text[i+1]==='"'){value+='"';i+=2;}else{i++;closed=true;break;}}else value+=text[i++];}if(!closed)throw Error('CSVの引用符が閉じていません');if(i<text.length&&!/[,\r\n]/.test(text[i]))throw Error('CSVの引用符の後に不正な文字があります');}
  else {while(i<text.length&&!/[,\r\n]/.test(text[i]))value+=text[i++];}
  cells.push({value,raw:text.slice(start,i),quoted});
  if(text[i]===','){i++;if(i===text.length)cells.push({value:'',raw:'',quoted:false});else continue;}
  let eol='';if(text[i]==='\r'){eol=text[i++];if(text[i]==='\n')eol+=text[i++];}else if(text[i]==='\n')eol=text[i++];
  rows.push({cells,eol});cells=[];
 }
 return rows;
}
function serialize(rows,changes=new Map()) {return rows.map((r,ri)=>r.cells.map((c,ci)=>{const key=ri+':'+ci;if(!changes.has(key))return c.raw;const v=String(changes.get(key));if(v===c.value)return c.raw;return c.quoted||/[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}).join(',')+r.eol).join('');}
function decode(bytes,forced='auto'){
 let encoding=forced,bom=false,text;
 if(encoding==='auto'){if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';else{try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);encoding='utf-8';}catch{encoding='shift_jis';}}}
 bom=encoding==='utf-8'?bytes[0]===239&&bytes[1]===187&&bytes[2]===191:encoding==='utf-16le'?bytes[0]===255&&bytes[1]===254:encoding==='utf-16be'?bytes[0]===254&&bytes[1]===255:false;
 text=new TextDecoder(encoding,{fatal:true}).decode(bytes);return {text,encoding,bom,bytes,rows:parse(text)};
}
let sjis;
function encode(text,encoding,bom){
 if(encoding==='utf-8'){const b=new TextEncoder().encode(text);if(!bom)return b;const out=new Uint8Array(b.length+3);out.set([239,187,191]);out.set(b,3);return out;}
 if(encoding.startsWith('utf-16')){const out=new Uint8Array(text.length*2+(bom?2:0)),view=new DataView(out.buffer),le=encoding==='utf-16le';let off=0;if(bom){view.setUint16(0,0xfeff,le);off=2;}for(let i=0;i<text.length;i++)view.setUint16(off+i*2,text.charCodeAt(i),le);return out;}
 if(!sjis){sjis=new Map();const d=new TextDecoder('shift_jis',{fatal:true});for(let b=0;b<256;b++){try{sjis.set(d.decode(Uint8Array.of(b)),[b]);}catch{}}for(let a=0x81;a<=0xfc;a++){if(a>0x9f&&a<0xe0)continue;for(let b=0x40;b<=0xfc;b++){if(b===0x7f)continue;try{const c=d.decode(Uint8Array.of(a,b));if(!sjis.has(c))sjis.set(c,[a,b]);}catch{}}}}
 const out=[];for(const c of text){const b=sjis.get(c);if(!b)throw Error('元の文字コードで保存できない文字です: '+c);out.push(...b);}return Uint8Array.from(out);
}
// Preserve untouched Shift_JIS byte aliases, not only their decoded characters.
function exportBytes(doc,changes){
 if(doc.encoding!=='shift_jis')return encode(serialize(doc.rows,changes),doc.encoding,doc.bom);
 const chunks=[];let offset=0;
 for(let ri=0;ri<doc.rows.length;ri++){const row=doc.rows[ri];for(let ci=0;ci<row.cells.length;ci++){const cell=row.cells[ci];let end=offset,quote=false;while(end<doc.bytes.length){const b=doc.bytes[end];if((b>=129&&b<=159)||(b>=224&&b<=252)){end+=2;continue;}if(b===34)quote=!quote;if(!quote&&(b===44||b===13||b===10))break;end++;}
 const key=ri+':'+ci;if(changes.has(key)&&String(changes.get(key))!==cell.value){const v=String(changes.get(key));chunks.push(encode(cell.quoted||/[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v,'shift_jis',false));}else chunks.push(doc.bytes.slice(offset,end));offset=end;if(ci<row.cells.length-1){chunks.push(doc.bytes.slice(offset,offset+1));offset++;}}
 const n=row.eol.length;chunks.push(doc.bytes.slice(offset,offset+n));offset+=n;}
 const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let p=0;for(const c of chunks){out.set(c,p);p+=c.length;}return out;
}
const val=(r,i)=>i>=0?(r.cells[i]?.value||'').trim():'';
function number(s){if(!String(s).trim())return NaN;const n=Number(String(s).replace(/,/g,''));return Number.isFinite(n)?n:NaN;}
function timestamp(s){const m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);if(!m)return NaN;const a=m.slice(1).map(x=>Number(x||0));const t=Date.UTC(a[0],a[1]-1,a[2],a[3],a[4],a[5]);const d=new Date(t);return d.getUTCMonth()===a[1]-1&&d.getUTCDate()===a[2]?t:NaN;}
function records(doc){return doc.rows.slice(1).filter(r=>r.cells.some(c=>c.value.trim()));}
function indexData(stock,history,sm,hm){
 const inventory=new Map(),past=new Map(),exactCodes=new Set(),parentCodes=new Map();let invalidStock=0,invalidHistory=0,rowId=0;
 const codes=(r,m)=>{const sku=val(r,m.sku),parent=val(r,m.parent);if(sku)exactCodes.add(sku);if(parent){if(!parentCodes.has(parent))parentCodes.set(parent,new Set());parentCodes.get(parent).add(sku||'');}return sku?[sku]:[];};
 for(const r of records(stock)){
  const aliases=codes(r,sm),loc=val(r,sm.loc).toUpperCase(),qty=number(val(r,sm.qty)),id=rowId++;
  if(!aliases.length||!loc)continue;
  const invalid=loc.startsWith('W')&&!Number.isFinite(qty);if(invalid)invalidStock++;
  const physical={id,qty};
  for(const sku of aliases){let v=inventory.get(sku);if(!v){v={w:new Map(),refs:new Map(),main:new Set(),invalid:false};inventory.set(sku,v);}
   if(/^[A-J]/.test(loc))v.main.add(loc);
   if(loc.startsWith('W')){if(invalid){v.invalid=true;continue;}v.w.set(loc,(v.w.get(loc)||0)+qty);if(!v.refs.has(loc))v.refs.set(loc,[]);v.refs.get(loc).push(physical);}
  }
 }
 for(const r of records(history)){const aliases=codes(r,hm),loc=val(r,hm.loc).toUpperCase();if(!aliases.length||!/^[A-J]/.test(loc))continue;const time=timestamp(val(r,hm.date));if(!Number.isFinite(time)){invalidHistory++;continue;}for(const sku of aliases){const v=past.get(sku);if(!v||time>v.time)past.set(sku,{time,locs:new Set([loc])});else if(time===v.time)v.locs.add(loc);}}
 return {inventory,past,exactCodes,parentCodes,invalidStock,invalidHistory};
}
// Resolve one physical SKU across both CSVs before allocating inventory.
function resolveSku(index,sku){
 if(index.exactCodes.has(sku))return {code:sku,mode:'商品コード完全一致',ambiguous:false};
 const matches=[...(index.parentCodes.get(sku)||[])];
 if(matches.length===1&&matches[0])return {code:matches[0],mode:'上位商品コード一致 → '+matches[0],ambiguous:false};
 return {code:sku,mode:'',ambiguous:matches.length>0,codes:matches};
}
// Both codes point to the same physical rows, including across different instruction SKUs.
function remainingAt(v,loc,used){return Math.max(0,(v?.w.get(loc)||0)-(v?.refs.get(loc)||[]).reduce((sum,r)=>sum+(used.get(r.id)||0),0));}
function reserve(v,loc,qty,used){let need=Math.min(qty,remainingAt(v,loc,used)),taken=need;for(const r of v?.refs.get(loc)||[]){const n=Math.min(need,Math.max(0,r.qty-(used.get(r.id)||0)));if(n>0){used.set(r.id,(used.get(r.id)||0)+n);need-=n;}if(need<=0)break;}return taken-need;}
function decide(instructions,index){
 const used=new Map();
 return instructions.map(item=>{const sku=item.sku.trim(),match=resolveSku(index,sku),v=match.ambiguous?null:index.inventory.get(match.code),pool=new Map([...(v?.w||[])].map(([loc])=>[loc,remainingAt(v,loc,used)])),original=[...(v?.w||[])].filter(([,n])=>n>0),stockTotal=original.reduce((s,[,n])=>s+n,0),available=[...pool.values()].reduce((a,b)=>a+b,0),qty=number(item.qty),result={...item,sku,qty,stockTotal,available,source:'',destination:'',allocations:[],shortage:null,candidates:[],evidence:'',status:'正常',notes:[],resolvedSku:match.code,matchMode:match.mode,ambiguous:match.ambiguous};
 if(!sku||!Number.isInteger(qty)||qty<=0){result.status='要確認';result.notes.push('商品コード・必要数（正の整数）を確認');return result;}
 if(match.ambiguous){result.status='要確認';result.notes.push('上位商品コードが複数SKUに一致、または商品コードが空欄: '+match.codes.map(c=>c||'（空欄）').join(' / '));return result;}
 if(v?.invalid){result.status='要確認';result.notes.push('Wロケの在庫数に不正な値');return result;}
 if(!original.length){result.status='在庫無し';result.source='在庫無し';result.shortage=qty;result.notes.push('在庫数がプラスのWロケなし');return result;}
 let candidates=[...(v?.main||[])].sort();if(candidates.length)result.evidence='最新ロケ';else{const h=index.past.get(match.code);candidates=[...(h?.locs||[])].sort();result.evidence=h?'履歴 '+new Date(h.time).toISOString().replace('T',' ').slice(0,19):'該当なし';}
 result.candidates=candidates;if(candidates.length===1)result.destination=candidates[0];else{result.status='要確認';result.notes.push(candidates.length?'本ロケ候補が複数':'本ロケが不明');}
 const list=[...pool].filter(([,n])=>n>0).sort((a,b)=>a[0].localeCompare(b[0],'en',{numeric:true})||a[0].localeCompare(b[0]));let need=qty;
 for(const [loc,n]of list){if(need<=0)break;const take=Math.min(n,need);result.allocations.push({loc,qty:take});reserve(v,loc,take,used);need-=take;}
 result.source=result.allocations.length===1?result.allocations[0].loc:'';result.shortage=need;
 if(result.allocations.length>1){result.status='要確認';result.notes.push('複数Wロケへの分割が必要（移動元の数量内訳を確認）');}
 if(need>0){result.status='要確認';result.notes.push('Wロケ不足 '+need+'個');}return result;
 });
}
root.WLoc={parse,serialize,decode,encode,exportBytes,val,number,indexData,decide,remainingAt,reserve,resolveSku};
})(typeof window!=='undefined'?window:globalThis);
