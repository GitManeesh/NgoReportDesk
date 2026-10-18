'use strict';
const crypto=require('node:crypto');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET')return res.status(405).json({error:'Use GET.'});
 const endpoint=process.env.N8N_REPORT_WEBHOOK_URL,secret=process.env.N8N_WEBHOOK_SECRET;
 if(!endpoint||!secret)return res.status(503).json({ready:false,stage:'configuration'});
 try{
  const u=new URL(endpoint);if(u.protocol!=='https:'||u.hostname!=='n8n.myaiteam.work.gd'||u.pathname!=='/webhook/ngo-report-desk-v2')return res.status(503).json({ready:false,stage:'endpoint_version'});
  const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify({action:'capabilities',request_id:crypto.randomUUID()}),signal:AbortSignal.timeout(15000)});
  let d;try{d=await r.json();}catch{return res.status(502).json({ready:false,stage:'workflow_response',upstream_status:r.status});}
  const ready=r.ok&&[2,3].includes(d.version)&&d.pdf_delivery===true;
  return res.status(ready?200:502).json({ready,stage:ready?'workflow_ready':'workflow_response',upstream_status:r.status,version:d.version,pdf_delivery:d.pdf_delivery===true});
 }catch(e){return res.status(502).json({ready:false,stage:e.name==='TimeoutError'?'workflow_timeout':'connection'});}
};
