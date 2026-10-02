const { PDFParse } = require('pdf-parse');

const SB_URL='https://qfcgxefymdodjrprhfvu.supabase.co';
const SB_KEY='sb_publishable_KzELBvq1CkhnHL_CXN99GA_5-an2G6m';
const MAX_BYTES=3.5*1024*1024;

async function verifyUser(auth){
  if(!auth||!auth.startsWith('Bearer ')) return false;
  const r=await fetch(SB_URL+'/auth/v1/user',{headers:{apikey:SB_KEY,Authorization:auth}});
  return r.ok;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed'});
  }
  try{
    if(!await verifyUser(req.headers.authorization)){
      return res.status(401).json({error:'Unauthorized'});
    }
    const body=req.body||{},name=String(body.name||'document.pdf');
    const b64=String(body.data||'');
    if(!b64) return res.status(400).json({error:'PDF data is required'});
    const data=Buffer.from(b64,'base64');
    if(!data.length||data.length>MAX_BYTES) return res.status(413).json({error:'PDF is too large'});
    if(data.subarray(0,4).toString()!=='%PDF') return res.status(400).json({error:'Invalid PDF'});
    const parser=new PDFParse({data});
    try{
      const result=await parser.getText();
      return res.status(200).json({name,text:result.text||'',pages:result.total||result.pages?.length||null});
    }finally{
      await parser.destroy().catch(()=>{});
    }
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e?.message||'PDF parse failed'});
  }
};
