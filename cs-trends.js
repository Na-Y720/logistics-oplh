/* Fiscal-year trends share the existing CS date, metric and authenticated REST helpers. */
function csFiscalYear(today){
  const year=Number(today.slice(0,4))-(today.slice(5)<'02-21'?1:0);
  return {start:`${year}-02-21`,end:`${year+1}-02-20`};
}
function csTrendBuckets(today,mode){
  const fiscal=csFiscalYear(today),buckets=[];
  for(let start=fiscal.start;start<=fiscal.end;){
    const period=getPeriodRange(start,mode),end=period.end<fiscal.end?period.end:fiscal.end;
    buckets.push({start,end,reports:emptyAgg(),reportCount:0,orders:0,orderCount:0});
    start=addDays(end,1);
  }
  return buckets;
}
function csAggregateTrends(today,mode,reports,summaries){
  const buckets=csTrendBuckets(today,mode);
  const bucketFor=date=>date<=today?buckets.find(b=>date>=b.start&&date<=b.end):null;
  reports.forEach(r=>{const b=bucketFor(r.report_date);if(b){addReport(b.reports,r);b.reportCount++}});
  summaries.forEach(r=>{const b=bucketFor(r.report_date);if(b){b.orders+=n(r.order_count);b.orderCount++}});
  return buckets.map(b=>{
    const m=calcMetrics(b.reports);
    return {...b,orders:b.orderCount?b.orders:null,
      csCount:b.reportCount?m.phone+m.mail:null,
      phoneRate:b.reportCount&&m.phone>0?b.reports.phone_first_resolution_count/m.phone*100:null,
      mailRate:b.reportCount&&m.resolutionBase>0?m.resolved/m.resolutionBase*100:null};
  });
}
async function csReadTrendRows(table,ownerId,start,end,select,isCurrent){
  const rows=[];
  // Continue until empty, even if the server's row cap is lower than our page size.
  while(isCurrent()){
    const page=await rest(table,`owner_id=eq.${ownerId}&report_date=gte.${start}&report_date=lte.${end}&select=${select}&order=report_date.asc,id.asc&limit=500&offset=${rows.length}`)||[];
    if(!isCurrent()||!page.length)break;
    rows.push(...page);
  }
  return rows;
}

(()=>{
  let request=0,buckets=[],mode='company';
  const metrics=[
    {key:'orders',title:'受注件数',unit:'件',color:'#0f766e'},
    {key:'phoneRate',title:'電話解決率',unit:'%',color:'#2563eb'},
    {key:'mailRate',title:'メール解決率（④基準）',unit:'%',color:'#9333ea'}
  ];
  const csMetric={key:'csCount',title:'CS対応数（電話＋メール）',unit:'件',color:'#93c5fd'};
  const format=(value,metric)=>value===null?'—':(metric.unit==='%'?value.toFixed(1):value.toLocaleString('ja-JP'))+metric.unit;
  const periodLabel=b=>shortDate(b.start)+' ～ '+shortDate(b.end);
  function inspect(){
    const b=buckets[Number($('trendPeriod').value)];if(!b)return;
    $('trendValues').textContent=[metrics[0],csMetric,...metrics.slice(1)].map(m=>m.title+'：'+format(b[m.key],m)).join(' ／ ');
  }
  function draw(){
    document.querySelectorAll('.trend-plot').forEach((plot,index)=>{
      const width=Math.floor(plot.clientWidth);if(width<100)return;
      const metric=metrics[index],height=250,left=62,right=20,top=18,bottom=40;
      const combined=metric.key==='orders',chartTitle=combined?'受注件数・CS対応数':metric.title;
      const values=buckets.map(b=>b[metric.key]),bars=combined?buckets.map(b=>b.csCount):[];
      const max=Math.max(0,...values.concat(bars).filter(v=>v!==null));
      const ceiling=metric.unit==='%'?Math.max(100,Math.ceil(max/25)*25):Math.max(4,Math.ceil(max/4)*4);
      const step=(width-left-right)/buckets.length;
      const x=i=>combined?left+(i+.5)*step:left+i*(width-left-right)/(buckets.length-1),y=v=>top+(height-top-bottom)*(1-v/ceiling);
      const tickLabel=v=>metric.unit==='%'?v+'%':v>=10000?(v/10000).toLocaleString('ja-JP',{maximumFractionDigits:1})+'万':v.toLocaleString('ja-JP');
      let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${chartTitle}の年度推移"><title>${chartTitle}の年度推移</title><desc>${combined?'折れ線は受注件数、棒は電話とメールを合算したCS対応数。共通の件数目盛りです。':''}正確な数値はグラフ下の期間選択で確認できます。</desc>`;
      for(let i=0;i<=4;i++){
        const value=ceiling*i/4,cy=y(value);
        svg+=`<line x1="${left}" x2="${width-right}" y1="${cy}" y2="${cy}" stroke="#e2e8f0"/><text x="${left-8}" y="${cy+5}" text-anchor="end">${tickLabel(value)}</text>`;
      }
      const ticks=Math.max(2,Math.min(7,Math.floor((width-left-right)/90)+1));
      for(let i=0;i<ticks;i++){
        const index=Math.round(i*(buckets.length-1)/(ticks-1)),b=buckets[index];
        const label=mode==='week'?Number(b.start.slice(5,7))+'/'+Number(b.start.slice(8)):b.end.slice(2,4)+'/'+Number(b.end.slice(5,7));
        svg+=`<text x="${x(index)}" y="${height-12}" text-anchor="${i===0?'start':i===ticks-1?'end':'middle'}">${label}</text>`;
      }
      const barWidth=Math.min(32,step*.65);
      bars.forEach((v,i)=>{if(v!==null)svg+=`<rect class="trend-cs-bar" x="${x(i)-barWidth/2}" y="${y(v)}" width="${barWidth}" height="${y(0)-y(v)}" fill="${csMetric.color}"><title>${periodLabel(buckets[i])} ${csMetric.title}：${format(v,csMetric)}</title></rect>`});
      let path='',connected=false;
      values.forEach((v,i)=>{if(v===null){connected=false;return}path+=`${connected?'L':'M'}${x(i)},${y(v)} `;connected=true});
      svg+=`<path d="${path}" fill="none" stroke="${metric.color}" stroke-width="2.5" stroke-linejoin="round"/>`;
      values.forEach((v,i)=>{if(v!==null)svg+=`<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${metric.color}"><title>${periodLabel(buckets[i])}：${format(v,metric)}</title></circle>`});
      if(!values.concat(bars).some(v=>v!==null))svg+=`<text x="${(left+width-right)/2}" y="${height/2}" text-anchor="middle">集計対象データなし</text>`;
      plot.innerHTML=svg+'</svg>';
    });
  }
  const observer=new ResizeObserver(draw);
  window.csLoadTrends=async nextMode=>{
    const current=++request,ownerId=user?.id;
    if(!ownerId)return;
    const isCurrent=()=>current===request&&user?.id===ownerId;
    // Use the company's current date, independent of the table's selected anchor.
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
    const fiscal=csFiscalYear(today);
    mode=nextMode;buckets=[];observer.disconnect();
    $('trendCharts').innerHTML='';$('trendInspector').classList.add('hidden');
    $('trendRange').textContent=shortDate(fiscal.start)+' ～ '+shortDate(fiscal.end)+' ・ '+({week:'週次（月～日）',company:'会社月度（21日～翌20日）',calendar:'暦月（1日～末日）'}[mode]);
    setMessage('trendMessage','年度データを読み込み中…');
    try{
      const [reports,summaries]=await Promise.all([
        csReadTrendRows('cs_daily_reports',ownerId,fiscal.start,today,'report_date,'+numericFields.join(','),isCurrent),
        csReadTrendRows('cs_daily_summary',ownerId,fiscal.start,today,'report_date,order_count',isCurrent)
      ]);
      if(!isCurrent())return;
      buckets=csAggregateTrends(today,mode,reports,summaries);
      $('trendCharts').innerHTML=metrics.map(m=>`<article class="trend-chart"><h4>${m.key==='orders'?'受注件数・CS対応数':m.title}</h4>${m.key==='orders'?'<div class="trend-legend"><span><i class="trend-line-key"></i>受注件数（折れ線）</span><span><i class="trend-bar-key"></i>CS対応数：電話＋メール（棒）</span></div>':''}<div class="trend-plot"></div></article>`).join('');
      document.querySelectorAll('.trend-plot').forEach(plot=>observer.observe(plot));
      $('trendPeriod').innerHTML=buckets.map((b,i)=>`<option value="${i}">${periodLabel(b)}</option>`).join('');
      $('trendPeriod').value=String(buckets.findIndex(b=>today>=b.start&&today<=b.end));
      $('trendInspector').classList.remove('hidden');inspect();draw();
      setMessage('trendMessage',reports.length||summaries.length?'':'この年度のデータはまだありません。');
    }catch(e){
      if(isCurrent())setMessage('trendMessage','年度推移の読み込みに失敗しました。「表示」で再読み込みしてください: '+e.message,'bad');
    }
  };
  $('trendPeriod').onchange=inspect;
})();
