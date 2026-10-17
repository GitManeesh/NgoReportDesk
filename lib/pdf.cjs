'use strict';
const {PDFDocument,rgb}=require('pdf-lib');
const fontkit=require('@pdf-lib/fontkit');const fs=require('node:fs');const path=require('node:path');
async function makePdf(title,text,attachments=[]){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(fs.readFileSync(path.join(__dirname,'../assets/report-font.ttf')),{subset:true});
 pdf.setTitle(title);pdf.setProducer('NGO Donor Reports & Donation Receipts');
 let page,y;const next=()=>{page=pdf.addPage([595.28,841.89]);y=780;page.drawRectangle({x:45,y:800,width:505,height:5,color:rgb(.15,.3,.23)});};next();
 for(const line of [title,'',...String(text).replace(/\r/g,'').split('\n')]){
  const size=line===title?19:/^[A-Z][A-Z ()0-9]+$/.test(line)?12:10.5;
  let words=line.split(/\s+/),current='';const lines=[];
  for(const word of words){let candidate=current?current+' '+word:word;
   if(font.widthOfTextAtSize(candidate,size)>490&&current){lines.push(current);current=word;}else current=candidate;
  }
  lines.push(current);
  for(const value of lines){if(y<65)next();page.drawText(value,{x:48,y,size,font,color:rgb(.13,.2,.16),maxWidth:495});y-=size*1.6;}
  y-=4;
 }
 for(const attachment of attachments){
  if(typeof attachment?.data_url!=='string'||attachment.data_url.length>667000||!/^data:image\/(jpeg|png);base64,/.test(attachment.data_url))throw Error('Invalid photo.');
  const bytes=Buffer.from(attachment.data_url.split(',')[1],'base64');if(attachment.data_url.startsWith('data:image/png')&&(bytes.length<24||bytes.readUInt32BE(16)*bytes.readUInt32BE(20)>16000000))throw Error('Photo dimensions are too large.');const image=attachment.data_url.startsWith('data:image/png')?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);
  if(image.width*image.height>16000000)throw Error('Photo dimensions are too large.');next();const dimensions=image.scaleToFit(490,650);page.drawImage(image,{x:48,y:100+(650-dimensions.height)/2,width:dimensions.width,height:dimensions.height});
 }
 const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:510,y:35,font,size:8,color:rgb(.4,.4,.4)}));
 return Buffer.from(await pdf.save());
}
function receiptText(d){return `${d.org}\n\nDONATION RECEIPT\nReceipt number: ${d.receipt_no}\nDonation date: ${d.donated_on}\nDonor: ${d.donor}\nAmount received: ${d.currency} ${Number(d.amount).toFixed(2)}\nPayment mode: ${d.mode}\n\nTHANK YOU\n${d.thank_you}\n\nThis receipt acknowledges the recorded donation.\nTax exemption details: [Accountant to verify and complete, if applicable].\nApproved in the app by the coordinator. Not digitally signed.`;}
module.exports={makePdf,receiptText};
