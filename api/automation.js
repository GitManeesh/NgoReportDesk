'use strict';
const crypto=require('node:crypto');const reportHandler=require('./report');
const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records?resource=worker';
function same(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);}
function previousWeek(now=new Date()){
 const india=new Date(now.getTime()+330*60000);const day=india.getUTCDay();const monday=new Date(Date.UTC(india.getUTCFullYear(),india.getUTCMonth(),india.getUTCDate()-(day+6)%7));
 return {from:new Date(monday.getTime()-7*86400000).toISOString().slice(0,10),to:new Date(monday.getTime()-86400000).toISOString().slice(0,10)};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'||!same(String(req.headers['x-ngo-key']||''),process.env.N8N_WEBHOOK_SECRET))return res.status(401).json({error:'Automation authentication required.'});
 let b;try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'Invalid JSON.'});}const kind=b?.kind;if(!['weekly','monthly'].includes(kind))return res.status(400).json({error:'Invalid schedule.'});
 const worker=async(body)=>{const r=await fetch(EDGE,{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Key':process.env.NGO_ENGINE_KEY||''},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok)throw Error(d.error||'Worker unavailable.');return d;};
 try{
  const {settings}=await worker({action:'settings'});const results=[];
  for(const setting of settings.filter(x=>kind==='weekly'?x.weekly_enabled:x.monthly_enabled)){
   if(kind==='weekly'){
    const {from,to}=previousWeek();const {notes}=await worker({action:'notes',owner_hash:setting.owner_hash,from,to});
    if(!notes.length){results.push({status:'no_notes'});continue;}
    if(notes.length===1000){results.push({status:'history_limit_review_required'});continue;}
    const body={org:setting.org,period:from+' to '+to};for(const field of ['notes','beneficiaries','challenges','next','photos'])body[field]=notes.map(row=>row.notes[field]||'').filter(Boolean).join('\n');
    let result,status;const response={setHeader(){},status(code){status=code;return this;},json(data){result=data;return this;}};
    await reportHandler({method:'POST',headers:{'content-type':'application/json','x-vercel-forwarded-for':'automation-'+setting.owner_hash},body},response);
    if(status!==200){results.push({status:'draft_failed'});continue;}
    await worker({action:'save_draft',owner_hash:setting.owner_hash,org:setting.org,period:body.period,content:result.report_text});results.push({status:'draft_ready_for_review'});
   }else{
    const {donations}=await worker({action:'donations',owner_hash:setting.owner_hash});
    if(donations.length===1000){results.push({status:'history_limit_review_required'});continue;}
    const latest=new Map();for(const d of donations){const k=d.email.toLowerCase()||d.whatsapp||d.donor.toLowerCase();if(!latest.has(k))latest.set(k,d);}
    const cutoff=new Date();cutoff.setUTCFullYear(cutoff.getUTCFullYear()-1);const lapsed=[...latest.values()].filter(d=>d.donated_on<cutoff.toISOString().slice(0,10));
    const run=await worker({action:'claim_run',owner_hash:setting.owner_hash,period:new Date().toISOString().slice(0,7)});if(!run.claimed){results.push({status:'monthly_already_dispatched_or_uncertain'});continue;}
    // The n8n schedule delivers this coordinator-only list through its existing Gmail/WhatsApp routes.
    const text=setting.org+' — monthly donor follow-up\n'+(lapsed.length?lapsed.map(d=>d.donor+' — last recorded donation '+d.donated_on).join('\n'):'No donors inactive for 12 months in the recorded history.');
    if(text.length>3500){results.push({status:'coordinator_list_too_long_review_required'});continue;}
    results.push({status:'coordinator_alert',approved:true,approved_text:text,email_to:setting.coordinator_email,whatsapp_to:setting.coordinator_whatsapp,subject:'Monthly donor follow-up',request_id:crypto.randomUUID()});
   }
  }
  return res.status(200).json({results});
 }catch{return res.status(502).json({error:'Scheduled task failed. Inspect the n8n execution before retrying.'});}
};
module.exports.previousWeek=previousWeek;
