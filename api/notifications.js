'use strict';
const crypto=require('node:crypto');const {makePdf,receiptText}=require('../lib/pdf.cjs');const Contract=require('../dist/report-contract');
const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 let owner=null;
 const worker=async(body)=>{const r=await fetch(EDGE+'?resource=worker',{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Key':process.env.NGO_ENGINE_KEY||''},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error('Notification storage unavailable.');return d;};
 try{
  if(!same(String(req.headers['x-ngo-key']||''),process.env.N8N_WEBHOOK_SECRET)){
   const key=String(req.headers['x-workspace-key']||'');if(!/^[a-f0-9]{64}$/.test(key))return res.status(401).json({error:'Coordinator access required.'});
   const access=await fetch(EDGE+'?resource=access',{headers:{'X-Workspace-Key':key},signal:AbortSignal.timeout(10000)});const rights=await access.json();if(!access.ok||rights.enabled!==true)return res.status(403).json({error:'Connect coordinator access once in Records to enable automatic delivery.'});owner=crypto.createHash('sha256').update(key).digest('hex');
  }
  const endpoint=process.env.N8N_ENGINE_WEBHOOK_URL,secret=process.env.N8N_WEBHOOK_SECRET;if(!endpoint||!secret)return res.status(503).json({error:'Notification workflow is not connected.'});
  const u=new URL(endpoint);if(u.protocol!=='https:'||u.hostname!=='n8n.myaiteam.work.gd'||u.pathname!=='/webhook/ngo-report-desk-v2')throw Error();
  const send=async(data)=>{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify(data),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Provider not confirmed.');return r.json();};
  const capabilities=await send({action:'capabilities',request_id:crypto.randomUUID()});if(capabilities.pdf_delivery!==true)throw Error('PDF delivery unavailable.');
  const {jobs}=await worker({action:'claim_notifications',owner_hash:owner});let sent=0,uncertain=0;
  for(const job of jobs){
   try{
    const d=job.document;if(!d)throw Error('Document not found.');
    const receipt=job.document_type==='receipt';if(!receipt&&!Contract.valid(d.content))throw Error('Invalid report.');
    const pdf=await makePdf(receipt?'Donation receipt':'Weekly donor report',receipt?receiptText(d):d.content,receipt?[]:d.attachments||[]);
    const response=await send({action:job.channel+'_pdf',request_id:job.id,approved:true,approved_text:receipt?d.thank_you:'Please find the approved weekly donor report attached.',subject:receipt?'Donation receipt '+d.receipt_no:'Weekly donor report',email_to:job.channel==='gmail'?job.recipient:'',whatsapp_to:job.channel==='whatsapp'?job.recipient:'',filename:receipt?d.receipt_no+'.pdf':'Weekly-Donor-Report.pdf',pdf_base64:pdf.toString('base64')});
    if(response.pdf_sent!==true||response.channel!==job.channel)throw Error('Provider not confirmed.');
    await worker({action:'finish_notification',owner_hash:job.owner_hash,id:job.id,status:'sent'});sent++;
   }catch{uncertain++;try{await worker({action:'finish_notification',owner_hash:job.owner_hash,id:job.id,status:'uncertain'});}catch{}}
  }
  return res.status(200).json({processed:jobs.length,accepted:sent,uncertain});
 }catch{return res.status(502).json({error:'Automatic notifications could not complete. Saved documents are retained; check delivery activity before retrying.'});}
};
