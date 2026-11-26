(function(root){
'use strict';
function valid(id){if(id!==1&&id!==2)throw Error('保存対象外');if(!WLocCloud.isLoggedIn())throw Error('ログインしてください');}
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
function unbase64(text){const s=atob(text),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;}
async function transform(bytes,mode){const stream=new Blob([bytes]).stream().pipeThrough(mode==='pack'?new CompressionStream('gzip'):new DecompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer());}
async function read(id){valid(id);const data=await WLocCloud.request('/rest/v1/wloc_reference_files?id=eq.'+id+'&select=*');const row=data?.[0];if(!row)return null;let bytes=unbase64(row.content_base64);if(row.compression==='gzip')bytes=await transform(bytes,'unpack');return {id,name:row.name,bytes,encoding:row.encoding,savedAt:Date.parse(row.updated_at)};}
async function write(record){valid(record.id);let bytes=record.bytes,compression='none';if(typeof CompressionStream!=='undefined'){bytes=await transform(bytes,'pack');compression='gzip';}if(bytes.length>24*1024*1024)throw Error('共有保存するデータが大きすぎます。CSVの期間を絞ってください。');
 const data=await WLocCloud.request('/rest/v1/wloc_reference_files?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:record.id,name:record.name,encoding:record.encoding,content_base64:base64(bytes),compression})});return {savedAt:Date.parse(data[0].updated_at)};
}
root.WLocStorage={read,write};
})(typeof window!=='undefined'?window:globalThis);
