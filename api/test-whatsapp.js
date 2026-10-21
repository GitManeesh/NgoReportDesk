'use strict';
const crypto=require('node:crypto');
const {makePdf}=require('../lib/pdf.cjs');
const equal=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 // Explicitly opt in; never claim queued notifications or change NOTIFICATION_MODE.
 if(process.env.ENABLE_WHATSAPP_PDF_TEST!=='true')return res.status(503).json({error:'WhatsApp PDF test disabled.'});
 const secret=process.env.N8N_WEBHOOK_SECRET;
 if(!equal(String(req.headers['x-ngo-key']||''),secret))return res.status(401).json({error:'Not authorized.'});
 const destination=process.env.TEST_DONOR_WHATSAPP||'';
 if(!/^\+[1-9]\d{7,14}$/.test(destination))return res.status(503).json({error:'Authorized test recipient missing.'});
 const name=process.env.WHATSAPP_RECEIPT_TEMPLATE_NAME||'';
 const language=process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en';
 if(!/^[a-z0-9_]{1,512}$/.test(name)||!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language))return res.status(503).json({error:'Approved template configuration missing.'});
 let url;try{url=new URL(process.env.N8N_ENGINE_WEBHOOK_URL);if(url.protocol!=='https:'||url.hostname!=='n8n.myaiteam.work.gd'||url.pathname!=='/webhook/ngo-report-desk-v2'||url.search)throw Error();}catch{return res.status(503).json({error:'n8n endpoint misconfigured.'});}
 const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
 if(!body||body.confirm_test_send!==true)return res.status(400).json({error:'Explicit test-send confirmation required.'});
 const ref='TEST-'+crypto.randomUUID();
 const pdf=await makePdf('TEST DONATION RECEIPT','TEST ONLY — NOT A REAL DONATION RECEIPT\nReference: '+ref+'\nDonor: Test Donor\nAmount: INR 100 (fictional)\nNo payment was made; this document is not valid for accounting or tax purposes.',[]);
 const payload={action:'whatsapp_pdf',request_id:ref,approved:true,approved_text:'TEST ONLY: Fictional INR 100 donation receipt. No payment has been made.',whatsapp_to:destination,whatsapp_template_name:name,whatsapp_template_language:language,delivery_mode:'production',production_authorized:true,whatsapp_phone_id:process.env.WHATSAPP_PHONE_NUMBER_ID||'1331179886742725',filename:'TEST-Donation-Receipt.pdf',pdf_base64:pdf.toString('base64')};
 try{
  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
  const result=await r.json();
  if(!r.ok||result.pdf_sent!==true||result.channel!=='whatsapp')return res.status(502).json({error:'WhatsApp provider did not confirm test acceptance.',request_id:ref});
  return res.status(200).json({accepted:true,request_id:ref,channel:'whatsapp',note:'API acceptance does not confirm delivery. Check WhatsApp and delivery status.'});
 }catch{return res.status(502).json({error:'Test delivery uncertain; inspect n8n/Meta history before retrying.',request_id:ref});}
};
