'use strict';
const {makePdf,receiptText}=require('../lib/pdf.cjs');const Contract=require('../dist/report-contract.js');
const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;if(!b||b.approved!==true)return res.status(400).json({error:'Approve this document first.'});
  let text,title,filename;
  if(b.type==='receipt'){
   const key=String(req.headers['x-workspace-key']||'');if(!/^[a-f0-9]{64}$/.test(key)||!/^[-a-f0-9]{36}$/.test(b.id||''))return res.status(400).json({error:'Invalid record access.'});
   const r=await fetch(EDGE+'?resource=donations&id='+encodeURIComponent(b.id),{headers:{'X-Workspace-Key':key},signal:AbortSignal.timeout(15000)});
   const d=await r.json();if(!r.ok)return res.status(r.status).json({error:d.error||'Receipt unavailable.'});
   title='Donation receipt';text=receiptText(d.record);filename=d.record.receipt_no+'.pdf';
  }else{
   if(typeof b.content!=='string'||b.content.length>80000||!Contract.valid(b.content))return res.status(400).json({error:'A report needs five sections and fewer than 400 words.'});
   title='Weekly donor report';text=b.content;filename='Weekly-Donor-Report.pdf';
  }
  const attachments=b.type==='receipt'?[]:(b.attachments||[]);if(!Array.isArray(attachments)||attachments.length>2)return res.status(400).json({error:'At most two photos are allowed.'});
  const pdf=await makePdf(title,text,attachments);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${filename}"`);return res.status(200).send(pdf);
 }catch{return res.status(503).json({error:'Could not generate the PDF. Please try again.'});}
};
