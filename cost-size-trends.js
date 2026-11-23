let sagawaSizeRows=[];
async function loadSagawaSizeHistory(){
 try{sagawaSizeRows=await rest('logistics_shipping_monthly',`owner_id=eq.${user.id}&carrier=eq.sagawa&select=month_ym,metadata&order=month_ym.asc&limit=1000`);renderSagawaSizeTrends()}catch(e){$('sagawaSizeMessage').textContent='サイズ履歴の取得に失敗しました：'+e.message}
}
function renderSagawaSizeTrends(){
 const unit=$('sagawaSizeUnit').value,scope=$('sagawaSizeScope').value,mode=$('sagawaSizeMode').value,year=$('sagawaSizeYear').value;
 const years=[...new Set(sagawaSizeRows.map(r=>String(fiscalStartYear(r.month_ym))))].sort();
 $('sagawaSizeYear').innerHTML='<option value="all">全期間</option>'+years.map(y=>`<option value="${y}">${y}年度</option>`).join('');$('sagawaSizeYear').value=years.includes(year)?year:'all';
 const rows=sagawaSizeRows.filter(r=>$('sagawaSizeYear').value==='all'||String(fiscalStartYear(r.month_ym))===$('sagawaSizeYear').value).sort((a,b)=>a.month_ym.localeCompare(b.month_ym));
 const keys=SagawaSizes.keys,labels=['60サイズ','80サイズ','100サイズ以上','判定不能'],colors=['#3975c6','#20a493','#e4a342','#9ca3af'];
 const unitLabel=unit==='invoices'?'件':'個';let max=1;
 rows.forEach(r=>{const s=r.metadata?.size_breakdown?.[scope];if(s)max=Math.max(max,unit==='invoices'?s.totalInvoices:s.totalPackages)});
 $('sagawaSizeLegend').innerHTML=labels.map((l,i)=>`<span><i style="background:${colors[i]}"></i>${l}</span>`).join('');
 $('sagawaSizeBody').innerHTML=rows.map(r=>{const report=r.metadata?.size_breakdown,s=report?.[scope];if(!s)return `<tr><td>${esc(r.month_ym)}</td><td colspan="10">サイズ未取込</td></tr>`;const total=unit==='invoices'?s.totalInvoices:s.totalPackages;return `<tr><td>${esc(r.month_ym)}</td><td><b>${fmt(total)}${unitLabel}</b></td>`+keys.map(k=>`<td>${fmt(s[unit][k])}</td><td>${total?pct(s[unit][k]/total):'—'}</td>`).join('')+`<td>${fmt(report.excludedInvoices)}件</td></tr>`}).join('')||'<tr><td colspan="11">佐川の明細を取り込むと、月別の出荷量と比率を表示します。</td></tr>';
 $('sagawaSizeChart').innerHTML=rows.map(r=>{const s=r.metadata?.size_breakdown?.[scope];if(!s)return `<div class="size-chart-row"><span>${esc(r.month_ym)}</span><span class="muted">サイズ未取込</span></div>`;const total=unit==='invoices'?s.totalInvoices:s.totalPackages;const bar=keys.map((k,i)=>`<span style="width:${total?s[unit][k]/total*100:0}%;background:${colors[i]}" title="${labels[i]}：${fmt(s[unit][k])}${unitLabel}（${total?pct(s[unit][k]/total):'—'}）"></span>`).join('');return `<div class="size-chart-row"><span>${esc(r.month_ym)}</span><div class="size-chart-track"><div class="size-chart-bar" style="width:${mode==='ratio'?100:total/max*100}%">${bar}</div></div><b>${fmt(total)}${unitLabel}</b></div>`}).join('');
}
async function importSagawaSizeHistory(){
 const files=Array.from($('sagawaSizeFiles').files||[]),button=$('sagawaSizeImportBtn'),msg=$('sagawaSizeMessage');if(!files.length){msg.textContent='CSVまたはZIPを選択してください。';return}button.disabled=true;msg.textContent='明細のサイズを集計しています…';let saved=[];
 try{
  const acc=SagawaSizes.createAccumulator();let bytes=0;
  async function consume(file){const buf=await file.arrayBuffer();bytes+=buf.byteLength;if(bytes>600*1024*1024)throw new Error('展開後600MBを超えています。複数回に分けてください。');const text=new TextDecoder('shift_jis').decode(buf);SagawaSizes.parse(text,file.name,acc)}
  for(const file of files){if(/\.zip$/i.test(file.name)){const zip=await JSZip.loadAsync(file);for(const entry of Object.values(zip.files)){if(!entry.dir&&/\.csv$/i.test(entry.name)&&!entry.name.startsWith('__MACOSX/')){const buf=await entry.async('arraybuffer');await consume({name:entry.name,arrayBuffer:async()=>buf})}}}else await consume(file)}
  if(!acc.months.size)throw new Error('佐川のCSVが見つかりません。');
  const existing=await rest('logistics_shipping_monthly',`owner_id=eq.${user.id}&carrier=eq.sagawa&select=month_ym,metadata,updated_at&order=month_ym.asc&limit=1000`),byMonth=new Map(existing.map(r=>[r.month_ym,r]));
  const missing=[...acc.months.keys()].filter(ym=>!byMonth.has(ym));if(missing.length)throw new Error(missing.join('、')+'月度の佐川発送費が未登録です。先に通常の佐川CSV取込を行ってください（今回は保存していません）。');
  for(const [ym,report] of [...acc.months].sort((a,b)=>a[0].localeCompare(b[0]))){const old=byMonth.get(ym),stamp=old.updated_at?`&updated_at=eq.${encodeURIComponent(old.updated_at)}`:'&updated_at=is.null';const result=await rest('logistics_shipping_monthly',`owner_id=eq.${user.id}&carrier=eq.sagawa&month_ym=eq.${ym}${stamp}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({metadata:{...old.metadata,size_breakdown:report},updated_at:new Date().toISOString()})});if(!result?.length)throw new Error(ym+'月度が他の操作で更新されました。再取込してください。');saved.push(ym)}
  msg.textContent=`${saved.length}か月のサイズ内訳を保存しました。重複明細${fmt(acc.duplicateRows)}行を除外。同月は置換し、発送費・採用件数・確定状態は維持しています。`;
 }catch(e){msg.textContent=(saved.length?`${saved.join('、')}は保存済み。残りは未保存です。`:'')+e.message}
 finally{button.disabled=false;await loadSagawaSizeHistory()}
}
['sagawaSizeUnit','sagawaSizeScope','sagawaSizeMode','sagawaSizeYear'].forEach(id=>$(id).onchange=renderSagawaSizeTrends);
$('sagawaSizeImportBtn').onclick=importSagawaSizeHistory;
