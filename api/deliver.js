'use strict';
const {makePdf,receiptText}=require('../lib/pdf.cjs');
const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 const key=String(req.headers['x-workspace-key']||'');let claimed=false,b;
 async function storage(resource,payload){const r=await fetch(EDGE+resource,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json','X-Workspace-Key':key,'X-Relay-Key':process.env.NGO_ENGINE_KEY||''},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok){const error=Error(d.error||'Storage unavailable.');error.status=r.status;throw error;}return d;}
 try{
  b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!b||b.approved!==true||!['gmail','whatsapp'].includes(b.channel)||!/^[-a-f0-9]{36}$/.test(b.id||'')||!/^[a-f0-9]{64}$/.test(key))return res.status(400).json({error:'Valid record, channel and approval are required.'});
  const rights=await storage('?resource=access');if(rights.enabled!==true)return res.status(403).json({error:'Connect coordinator access in Records before sending receipts.'});
  const endpoint=process.env.N8N_ENGINE_WEBHOOK_URL,secret=process.env.N8N_WEBHOOK_SECRET;
  if(!endpoint||!secret)return res.status(503).json({error:'PDF delivery needs the updated n8n workflow connected. Your receipt remains saved and can be downloaded.'});
  const u=new URL(endpoint);if(u.protocol!=='https:'||u.hostname!=='n8n.myaiteam.work.gd'||u.pathname!=='/webhook/ngo-report-desk-v2')throw Error('Invalid delivery service.');
  const capability=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify({action:'capabilities',request_id:require('node:crypto').randomUUID()}),signal:AbortSignal.timeout(15000)});
  if(!capability.ok||(await capability.json()).pdf_delivery!==true)return res.status(503).json({error:'Publish the updated n8n workflow before sending receipt PDFs. Your saved receipt can still be downloaded.'});
  const {record}=await storage('?resource=donations&id='+b.id);
  if(b.channel==='gmail'?!record.email:!record.whatsapp)return res.status(400).json({error:'This donor has no contact for the selected channel.'});
  const pdf=await makePdf('Donation receipt',receiptText(record));
  await storage('?resource=deliveries',{action:'claim',donation_id:b.id,channel:b.channel,approved:true});claimed=true;
  const response=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify({action:b.channel+'_pdf',request_id:record.id+'-'+b.channel,approved:true,approved_text:record.thank_you,email_to:record.email,whatsapp_to:record.whatsapp,subject:'Donation receipt '+record.receipt_no,pdf_base64:pdf.toString('base64'),filename:record.receipt_no+'.pdf'}),signal:AbortSignal.timeout(40000)});
  const d=await response.json();if(!response.ok||d.pdf_sent!==true||d.channel!==b.channel)throw Error('Delivery not confirmed.');
  await storage('?resource=deliveries',{action:'finish',donation_id:b.id,channel:b.channel,status:'sent',approved:true});
  return res.status(200).json({sent:true,channel:b.channel});
 }catch(error){
  if(claimed)try{await storage('?resource=deliveries',{action:'finish',donation_id:b.id,channel:b.channel,status:'uncertain',approved:true});}catch{}
  return res.status(error.status||502).json({error:claimed?'Delivery result is uncertain. Check n8n and the provider before sending again.':error.message||'Delivery unavailable.'});
 }
};
