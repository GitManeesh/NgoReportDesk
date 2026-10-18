'use strict';
const crypto=require('node:crypto');const {makePdf,receiptText}=require('../lib/pdf.cjs');const Contract=require('../dist/report-contract');
const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 let owner=null;
 const worker=async(body)=>{const r=await fetch(EDGE+'?resource=worker',{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Key':process.env.NGO_ENGINE_KEY||''},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error('Notification storage unavailable.');return d;};
 try{
  const deliveryMode=process.env.NOTIFICATION_MODE==='production'?'production':'test';
  if(deliveryMode==='test'){
   const key=String(req.headers['x-workspace-key']||'');if(!/^[a-f0-9]{64}$/.test(key))return res.status(401).json({error:'A valid workspace key is required.'});
   const r=await fetch(EDGE+'?resource=simulate_notifications',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Key':key},body:'{}',signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Simulation unavailable.');return res.status(200).json(d);
  }
  if(!same(String(req.headers['x-ngo-key']||''),process.env.N8N_WEBHOOK_SECRET)){
   const key=String(req.headers['x-workspace-key']||'');if(!/^[a-f0-9]{64}$/.test(key))return res.status(401).json({error:'Coordinator access required.'});
   const access=await fetch(EDGE+'?resource=access',{headers:{'X-Workspace-Key':key},signal:AbortSignal.timeout(10000)});const rights=await access.json();if(!access.ok||rights.enabled!==true)return res.status(403).json({error:'Connect coordinator access once in Records to enable automatic delivery.'});owner=crypto.createHash('sha256').update(key).digest('hex');
  }
  if(deliveryMode==='production'&&process.env.PRODUCTION_NOTIFICATIONS_APPROVED!=='true')return res.status(503).json({error:'Production notifications are not approved.'});
  const allowedRecipients=deliveryMode==='test'?[process.env.TEST_DONOR_EMAIL,process.env.TEST_DONOR_WHATSAPP,process.env.TEST_COORDINATOR_EMAIL,process.env.TEST_COORDINATOR_WHATSAPP].filter(Boolean):[];
  if(deliveryMode==='test'&&!allowedRecipients.length)return res.status(503).json({error:'Configure at least one authorized test recipient.'});
  const receiptTemplate=process.env.WHATSAPP_RECEIPT_TEMPLATE_NAME||'';const reportTemplate=process.env.WHATSAPP_REPORT_TEMPLATE_NAME||'';const templateLanguage=process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en';
  const endpoint=process.env.N8N_ENGINE_WEBHOOK_URL,secret=process.env.N8N_WEBHOOK_SECRET;if(!secret)return res.status(503).json({error:'Notification authentication is not configured.'});
  let u=null;if(deliveryMode==='production'){if(!endpoint)return res.status(503).json({error:'Notification workflow is not connected.'});u=new URL(endpoint);if(u.protocol!=='https:'||u.hostname!=='n8n.myaiteam.work.gd'||u.pathname!=='/webhook/ngo-report-desk-v2')throw Error();}
  const send=async(data)=>{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify(data),signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Provider not confirmed.');return r.json();};
  if(deliveryMode==='production'){const capabilities=await send({action:'capabilities',request_id:crypto.randomUUID()});if(capabilities.pdf_delivery!==true)throw Error('PDF delivery unavailable.');}
  const {jobs}=await worker({action:'claim_notifications',owner_hash:owner,allowed_recipients:deliveryMode==='test'?allowedRecipients:null});let sent=0,uncertain=0;
  for(const job of jobs){
   try{
    const d=job.document;if(!d)throw Error('Document not found.');
    const receipt=job.document_type==='receipt';if(!receipt&&!Contract.valid(d.content))throw Error('Invalid report.');
    const pdf=await makePdf(receipt?'Donation receipt':'Weekly donor report',receipt?receiptText(d):d.content,receipt?[]:d.attachments||[]);
    const templateName=receipt?receiptTemplate:reportTemplate;if(job.channel==='whatsapp'&&!templateName)throw Error('Approved WhatsApp template is not configured.');
    if(deliveryMode==='test'){await worker({action:'finish_notification',owner_hash:job.owner_hash,id:job.id,status:'simulated'});sent++;continue;}
    const response=await send({action:job.channel+'_pdf',request_id:job.id,approved:true,approved_text:receipt?d.thank_you:'Please find the approved weekly donor report attached.',subject:receipt?'Donation receipt '+d.receipt_no:'Weekly donor report',email_to:job.channel==='gmail'?job.recipient:'',whatsapp_to:job.channel==='whatsapp'?job.recipient:'',whatsapp_template_name:templateName,whatsapp_template_language:templateLanguage,delivery_mode:deliveryMode,test_recipient_authorized:deliveryMode==='test',production_authorized:deliveryMode==='production',filename:receipt?d.receipt_no+'.pdf':'Weekly-Donor-Report.pdf',pdf_base64:pdf.toString('base64')});
    if(response.pdf_sent!==true||response.channel!==job.channel)throw Error('Provider not confirmed.');
    await worker({action:'finish_notification',owner_hash:job.owner_hash,id:job.id,status:'sent'});sent++;
   }catch{uncertain++;try{await worker({action:'finish_notification',owner_hash:job.owner_hash,id:job.id,status:'uncertain'});}catch{}}
  }
  return res.status(200).json({mode:deliveryMode,processed:jobs.length,accepted:sent,simulated:deliveryMode==='test'?sent:0,uncertain});
 }catch{return res.status(502).json({error:'Automatic notifications could not complete. Saved documents are retained; check delivery activity before retrying.'});}
};
