// Individual rankings reuse the established identity and daily/monthly matching rules.
function initRankingMonths(){
 const sel=$('rankingMonth'),old=sel.value,months=fyMonths(Number($('fiscalYear').value));
 sel.innerHTML='<option value="all">年度全体</option>'+months.map(m=>'<option value="'+m+'">'+m+'月度</option>').join('');
 sel.value=months.includes(old)?old:'all';
}
function rankingRows(act,period){
 const workers=currentWorkerSet(),maps=activityTimeMap(workers,true),months=new Set(fyMonths(Number($('fiscalYear').value)).filter(m=>period==='all'||m===period)),rows=new Map();
 const get=key=>{if(!rows.has(key))rows.set(key,{key,quantity:null,hours:0,matchedQuantity:0,matched:false,rate:null});return rows.get(key)};
 for(const key of workers){
  let minutes=0;for(const ym of months)minutes+=maps.workerMonthly.get(ym+'|'+key+'|'+act)||0;
  if(minutes>0)get(key).hours=minutes/60;
 }
 const detailed=new Set();
 for(const r of wmsRows){
  if(!String(r.worker_key||'').startsWith('BI_SUPPLEMENT:'))detailed.add(companyYmFromDate(r.work_date)+'|'+identityFor(r)+'|'+r.activity_key);
 }
 for(const r of wmsRows){
  const key=identityFor(r),ym=companyYmFromDate(r.work_date);
  if(r.activity_key!==act||!months.has(ym)||!workers.has(key)||!directory.has(key))continue;
  const gk=ym+'|'+key+'|'+act,supplement=String(r.worker_key||'').startsWith('BI_SUPPLEMENT:');
  if(supplement&&detailed.has(gk))continue;
  if(r.quantity==null||r.quantity==='')continue;
  const qty=Number(r.quantity);if(!Number.isFinite(qty)||qty<0)continue;
  const row=get(key);row.quantity=(row.quantity??0)+qty;
  const g=maps.granularity.get(gk),monthly=supplement||(g?.monthly&&!g?.daily);
  const mins=monthly?maps.workerMonthly.get(gk):maps.daily.get(r.work_date+'|'+key+'|'+act);
  if(mins>0){row.matchedQuantity+=qty;row.matched=true}
 }
 const result=[...rows.values()].filter(r=>directory.has(r.key));
 for(const r of result)if(r.hours>0&&r.matched)r.rate=r.matchedQuantity/r.hours;
 for(const metric of ['quantity','hours','rate']){
  const valid=result.filter(r=>r[metric]!=null&&Number.isFinite(r[metric])&&(metric!=='hours'||r.hours>0)).sort((a,b)=>b[metric]-a[metric]);
  let rank=0;valid.forEach((r,i)=>{if(i===0||r[metric]!==valid[i-1][metric])rank=i+1;r[metric+'Rank']=rank});
 }
 return result;
}
function renderRanking(){
 const act=$('rankingActivity').value,period=$('rankingMonth').value,metric=$('rankingMetric').value;
 const rows=rankingRows(act,period).sort((a,b)=>(a[metric+'Rank']??Infinity)-(b[metric+'Rank']??Infinity)||String(directory.get(a.key)?.code||a.key).localeCompare(String(directory.get(b.key)?.code||b.key),'ja',{numeric:true}));
 const notes={picking:'物流PT人時はピッキング＋トータルピッキング＋パスソートを合算。数量はWMSピッキング実績です。',receiving:'物流PTの入庫＆在庫移動人時は既存仕様どおり入庫へ集約。数量はWMS入庫実績で、在庫移動数量は含みません。',pass_sort:'パスソート単独の人時。WMSピッキング数量は流用しません。',total_picking:'トータルピッキング単独の人時。統合生産性は「ピッキング（統合）」で確認できます。',hand_pack:'手梱包の個人人時。個人別の数量履歴がない場合は数量・生産数順位を表示しません。',auto_pack:'自動梱包機の個人人時。機械別数量を作業者へ按分しません。'};
 $('rankingNote').textContent=(notes[act]||'選択したWMS作業と対応人時を突合します。')+' 月度は前月21日～当月20日。日次実績を月次補完より優先し、月次集約人時は同月で突合します。';
 const rank=v=>v==null?'—':v+'位';
 $('rankingBody').innerHTML=rows.map(r=>{
  const info=directory.get(r.key),status=r.quantity==null?'数量履歴なし':!r.hours?'人時なし':!r.matched?'突合なし':r.matchedQuantity!==r.quantity?'一部数量のみ突合':'突合済';
  return '<tr><td>'+escapeHtml(info.name)+(info.code?' ('+escapeHtml(info.code)+')':'')+'</td><td>'+escapeHtml(info.employment||({'support':'他部署応援','unknown':'その他・未判定'}[info.category]||'その他'))+'</td><td>'+rank(r.quantityRank)+'</td><td>'+fmt(r.quantity)+'</td><td>'+rank(r.hoursRank)+'</td><td>'+hours(r.hours)+'</td><td>'+rank(r.rateRank)+'</td><td>'+fmt(r.rate,1)+'</td><td>'+fmt(r.matched?r.matchedQuantity:null)+'</td><td>'+status+'</td></tr>';
 }).join('')||'<tr><td colspan="10">対象期間・カテゴリの作業履歴はありません。</td></tr>';
}
