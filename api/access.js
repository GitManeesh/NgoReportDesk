'use strict';
const crypto=require('node:crypto');const attempts=new Map();
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 const ip=crypto.createHash('sha256').update(String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown')).digest('hex');const now=Date.now();for(const[k,v]of attempts)if(now-v.time>60000)attempts.delete(k);const rate=attempts.get(ip)||{time:now,count:0};if(rate.count>=5)return res.status(429).json({error:'Wait a minute before trying again.'});rate.count++;attempts.set(ip,rate);
 const expected=Buffer.from(process.env.N8N_WEBHOOK_SECRET||''),actual=Buffer.from(String(req.headers['x-coordinator-key']||''));
 if(!expected.length||expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return res.status(401).json({error:'The coordinator secret was not accepted.'});
 const key=String(req.headers['x-workspace-key']||'');if(!/^[a-f0-9]{64}$/.test(key))return res.status(400).json({error:'Invalid workspace.'});
 try{const r=await fetch('https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records?resource=worker',{method:'POST',headers:{'Content-Type':'application/json','X-Relay-Key':process.env.NGO_ENGINE_KEY||''},body:JSON.stringify({action:'grant_access',owner_hash:crypto.createHash('sha256').update(key).digest('hex')}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();return res.status(200).json({connected:true});}catch{return res.status(503).json({error:'Could not connect coordinator access.'});}
};
