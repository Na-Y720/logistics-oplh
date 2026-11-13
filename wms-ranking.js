// Individual rankings reuse the established identity and daily/monthly matching rules.
function initRankingMonths(){
 const sel=$('rankingMonth'),old=sel.value,months=fyMonths(Number($('fiscalYear').value));
 sel.innerHTML='<option value="all">年度全体</option>'+months.map(m=>'<option value="'+m+'">'+m+'月度</option>').join('');
 sel.value=months.includes(old)?old:'all';
}
function rankingRows(act,period){
 const workers=currentWorkerSet(),maps=activityTimeMap(workers,true),months=new Set(fyMonths(Number($('fiscalYear').value)).filter(m=>period==='all'||m===period)),rows=new Map();
 const get=key=>{if(!rows.has(key))rows.set(key,{key,actions:null,hours:0,matchedActions:0,matched:false,rate:null});return rows.get(key)};
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
  if(r.action_count==null||r.action_count==='')continue;
  const actions=Number(r.action_count);if(!Number.isFinite(actions)||actions<0)continue;
  const row=get(key);row.actions=(row.actions??0)+actions;
  const g=maps.granularity.get(gk),monthly=supplement||(g?.monthly&&!g?.daily);
  const mins=monthly?maps.workerMonthly.get(gk):maps.daily.get(r.work_date+'|'+key+'|'+act);
  if(mins>0){row.matchedActions+=actions;row.matched=true}
 }
 const result=[...rows.values()].filter(r=>directory.has(r.key));
 for(const r of result)if(r.hours>0&&r.matched)r.rate=r.matchedActions/r.hours;
 for(const metric of ['rate']){
  const valid=result.filter(r=>r[metric]!=null&&Number.isFinite(r[metric])).sort((a,b)=>b[metric]-a[metric]);
  let rank=0;valid.forEach((r,i)=>{if(i===0||r[metric]!==valid[i-1][metric])rank=i+1;r[metric+'Rank']=rank});
 }
 return result;
}
function renderRanking(){
 const rows=rankingRows('picking',$('rankingMonth').value).filter(r=>r.rateRank!=null).sort((a,b)=>a.rateRank-b.rateRank||String(directory.get(a.key)?.code||a.key).localeCompare(String(directory.get(b.key)?.code||b.key),'ja',{numeric:true}));
 $('rankingBody').innerHTML=rows.map(r=>{
  const info=directory.get(r.key);
  return '<tr><td>'+r.rateRank+'位</td><td>'+escapeHtml(info.name)+(info.code?' ('+escapeHtml(info.code)+')':'')+'</td><td>'+fmt(r.rate,1)+'</td></tr>';
 }).join('')||'<tr><td colspan="3">対応人時のあるピッキング作業履歴はありません。</td></tr>';
}
