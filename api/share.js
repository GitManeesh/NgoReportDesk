'use strict';
const crypto=require('node:crypto');const Contract=require('../dist/report-contract.js');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!b||!['gmail','whatsapp','facebook','instagram'].includes(b.action))return res.status(400).json({error:'Invalid channel.'});
  const key=String(req.headers['x-workspace-key']||'');if(!/^[a-f0-9]{64}$/.test(key))return res.status(401).json({error:'Connect coordinator access in Records first.'});
  const access=await fetch('https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records?resource=access',{headers:{'X-Workspace-Key':key},signal:AbortSignal.timeout(10000)});const rights=await access.json();if(!access.ok||rights.enabled!==true)return res.status(403).json({error:'Connect coordinator access in Records before sending or publishing.'});
  const social=['facebook','instagram'].includes(b.action);let payload;
  if(social){if(b.public_approved!==true||typeof b.public_text!=='string'||!b.public_text.trim()||b.public_text.length>2000)return res.status(400).json({error:'Review and approve the public caption.'});if((b.action==='instagram'||b.image_url)&&!/^https:\/\/[^\s]+$/i.test(b.image_url||''))return res.status(400).json({error:'Use a public HTTPS poster image URL.'});payload={public_approved:true,public_text:b.public_text,image_url:b.image_url||''};}
  else{if(b.approved!==true||typeof b.approved_text!=='string'||!Contract.valid(b.approved_text)||b.approved_text.length>4000)return res.status(400).json({error:'Approve a five-section report under 400 words first.'});if(b.action==='gmail'?!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.recipient||''):!/^\+?[1-9]\d{7,14}$/.test(b.recipient||''))return res.status(400).json({error:'Enter a valid recipient.'});payload={approved:true,approved_text:b.approved_text,subject:'Weekly donor report',email_to:b.action==='gmail'?b.recipient:'',whatsapp_to:b.action==='whatsapp'?b.recipient:''};}
  const endpoint=process.env.N8N_REPORT_WEBHOOK_URL,secret=process.env.N8N_WEBHOOK_SECRET;if(!endpoint||!secret)return res.status(503).json({error:'Sharing is unavailable.'});
  const u=new URL(endpoint);if(u.protocol!=='https:'||u.hostname!=='n8n.myaiteam.work.gd'||!/^\/webhook\/ngo-report-desk-v[12]$/.test(u.pathname))throw Error();
  // No automatic retry: an uncertain response can follow a successful provider send.
  const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify({...payload,action:b.action,request_id:crypto.randomUUID()}),signal:AbortSignal.timeout(45000)});
  if(!r.ok)throw Error();const d=await r.json();if(!d.provider_result)throw Error();return res.status(200).json({accepted:true,channel:b.action});
 }catch{return res.status(502).json({error:'The send was not confirmed. Check the workflow and provider before retrying to avoid duplicates.'});}
};
