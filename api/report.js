'use strict';
const crypto=require('node:crypto');
const Contract=require('../dist/report-contract.js');

function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function validateInput(body){if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid input.');const limits={org:200,period:150,notes:14000,challenges:5000,next:5000,beneficiaries:3000,photos:2000};const result={};for(const[k,max]of Object.entries(limits)){const v=body[k]??'';if(typeof v!=='string'||v.length>max)throw Error('Input is too long or invalid: '+k);result[k]=v.trim();}if(!result.org||!result.period||result.notes.length<30)throw Error('Organisation, reporting period and at least 30 characters of notes are required.');return result;}
function validateOutput(data,input){if(!data||typeof data!=='object')throw Error('Invalid AI response.');const result={};for(const [key,source,max]of [['activities',input.notes,12],['challenges',input.challenges,8],['next_steps',input.next,8]]){if(!Array.isArray(data[key])||data[key].length>max)throw Error('Invalid AI sections.');result[key]=data[key].map(item=>{if(typeof item.summary!=='string'||typeof item.source_quote!=='string'||!item.summary.trim()||!item.source_quote.trim()||item.summary.length>600||item.source_quote.length>1500||!source.includes(item.source_quote))throw Error('AI evidence could not be verified.');const numbers=item.summary.match(/\d+(?:[.,]\d+)*/g)||[];for(const n of numbers)if(!(item.source_quote.match(/\d+(?:[.,]\d+)*/g)||[]).includes(n))throw Error('AI introduced a number not present in its evidence.');return{summary:item.summary,source_quote:item.source_quote};});}if(!result.activities.length)throw Error('AI returned no supported activities.');if(!Array.isArray(data.warnings)||data.warnings.length>8||data.warnings.some(w=>typeof w!=='string'||w.length>400))throw Error('Invalid review checks.');result.warnings=data.warnings;return result;}
const recent=new Map();
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use POST.'});}
 if(!String(req.headers['content-type']||'').includes('application/json'))return res.status(415).json({error:'Use JSON input.'});
 let input;try{input=validateInput(typeof req.body==='string'?JSON.parse(req.body):req.body);}catch(e){return res.status(400).json({error:e.message});}
 const endpoint=process.env.N8N_REPORT_WEBHOOK_URL;
 const secret=process.env.N8N_WEBHOOK_SECRET;
 if(!endpoint||!secret)return res.status(503).json({error:'Report drafting is temporarily unavailable. Please try again later.'});
 let url;try{url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.hostname!=='n8n.myaiteam.work.gd'||!/^\/webhook\/ngo-report-desk-v[12]$/.test(url.pathname)||url.search)throw Error();}catch{return res.status(503).json({error:'Report drafting is temporarily unavailable. Please try again later.'});}
 const now=Date.now();for(const[k,v]of recent)if(now-v.start>60000)recent.delete(k);
 const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown');const key=crypto.createHash('sha256').update(ip).digest('hex');const rate=recent.get(key)||{start:now,count:0};
 if(rate.count>=6)return res.status(429).json({error:'Please wait a minute before creating another draft.'});rate.count++;recent.set(key,rate);
 try{
  const upstream=await fetch(url,{method:'POST',signal:AbortSignal.timeout(55000),headers:{'Content-Type':'application/json','X-NGO-Key':secret},body:JSON.stringify({...input,donor_prompt:Contract.PROMPT.replace('{{notes}}',JSON.stringify({activities:input.notes,beneficiaries:input.beneficiaries,challenges:input.challenges,next_week:input.next,photos:input.photos.split('\n').filter(Boolean)})),action:'draft',request_id:crypto.randomUUID()})});
  if(!upstream.ok)return res.status(502).json({error:upstream.status===401||upstream.status===403?'Report drafting is temporarily unavailable. Please contact the app administrator.':'We couldn’t create your draft. Please try again shortly.'});
  const response=await upstream.json();if(response.requires_review!==true)throw Error('Missing review requirement');
  const report=validateOutput(response.report,input);
  const report_text=Contract.build(input,report);
  return res.status(200).json({report,report_text,word_count:Contract.count(report_text),requires_review:true,request_id:response.request_id});
 }catch(e){console.error(JSON.stringify({event:'report_generation_failed',type:e.name==='TimeoutError'?'timeout':'response_validation'}));return res.status(502).json({code:e.name==='TimeoutError'?'AI_TIMEOUT':'AI_RESPONSE_INVALID',error:e.name==='TimeoutError'?'The AI service took too long to respond. Please try again shortly.':'We couldn’t verify the draft. Please try again. Your notes have not been sent to any recipient.'});}
}
module.exports=handler;module.exports.validateInput=validateInput;module.exports.validateOutput=validateOutput;
