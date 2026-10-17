'use strict';
const crypto=require('node:crypto');const Contract=require('../dist/report-contract.js');const {makePdf}=require('../lib/pdf.cjs');
const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 const key=String(req.headers['x-workspace-key']||'');
 const storage=async(path,body)=>{const r=await fetch(EDGE+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Workspace-Key':key,'X-Relay-Key':process.env.NGO_ENGINE_KEY||''},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Storage unavailable.');return d;};
 try{
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!/^[a-f0-9]{64}$/.test(key)||!b||b.approved!==true||!['gmail','whatsapp'].includes(b.channel)||typeof b.content!=='string'||b.content.length>80000||!Contract.valid(b.content)||!Array.isArray(b.recipients)||!b.recipients.length||b.recipients.length>10||b.recipients.some(x=>typeof x!=='string'||x.length>254||(b.channel==='gmail'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x):!/^\+?[1-9]\d{7,14}$/.test(x))))return res.status(400).json({error:'Approve a five-section report under 400 words and add 1–10 valid recipients.'});
  if((await storage('?resource=access')).enabled!==true)return res.status(403).json({error:'Connect coordinator access in Records first.'});
  const endpoint=process.env.N8N_ENGINE_WEBHOOK_URL,secret=process.env.N8N_WEBHOOK_SECRET;if(!endpoint||!secret)return res.status(503).json({error:'Connect the updated n8n workflow first.'});
  const u=new URL(endpoint);if(u.protocol!=='https:'||u.hostname!=='n8n.myaiteam.work.gd'||u.pathname!=='/webhook/ngo-report-desk-v2')throw Error('Invalid delivery service.');
  const call=async(data)=>{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify(data),signal:AbortSignal.timeout(40000)});if(!r.ok)throw Error('Workflow did not confirm delivery.');return r.json();};
  const capabilities=await call({action:'capabilities',request_id:crypto.randomUUID()});if(capabilities.pdf_delivery!==true)return res.status(503).json({error:'Publish the updated n8n workflow first.'});
  const photos=b.attachments||[];if(!Array.isArray(photos)||photos.length>2)return res.status(400).json({error:'At most two photos are allowed.'});
  const pdf=await makePdf('Weekly donor report',b.content,photos);const results=[];
  for(const recipient of [...new Set(b.recipients)]){
   const id=crypto.createHash('sha256').update(JSON.stringify({key,channel:b.channel,recipient,content:b.content,photos})).digest('hex');let claimed=false;
   try{
    await storage('?resource=report_delivery',{action:'claim',id});claimed=true;
    const d=await call({action:b.channel+'_pdf',request_id:id,approved:true,approved_text:'Please find the reviewed weekly donor report attached.',subject:'Weekly donor report',email_to:b.channel==='gmail'?recipient:'',whatsapp_to:b.channel==='whatsapp'?recipient:'',pdf_base64:pdf.toString('base64'),filename:'Weekly-Donor-Report.pdf'});
    if(d.pdf_sent!==true||d.channel!==b.channel)throw Error('Delivery not confirmed.');
    await storage('?resource=report_delivery',{action:'finish',id,status:'sent'});results.push({recipient,status:'accepted by provider'});
   }catch(error){if(claimed)try{await storage('?resource=report_delivery',{action:'finish',id,status:'uncertain'});}catch{}results.push({recipient,status:claimed?'uncertain — check provider before retrying':error.message});}
  }
  return res.status(200).json({results});
 }catch{return res.status(502).json({error:'Report delivery is unavailable or unconfirmed. Check n8n before retrying.'});}
};
