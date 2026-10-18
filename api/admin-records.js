'use strict';
const Auth=require('../lib/admin-auth.cjs');
const EDGE='https://houvoogshtllqbsbckqr.supabase.co/functions/v1/ngo-records';
const allowed=new Set(['donations','notifications','lapsed']);
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'Read only.'});if(!Auth.validSession(req))return res.status(401).json({error:'Admin login required.'});
 const resource=String(req.query?.resource||'donations');if(!allowed.has(resource))return res.status(400).json({error:'Unsupported record type.'});
 try{const r=await fetch(`${EDGE}?resource=${resource}`,{headers:{'X-Workspace-Key':process.env.ADMIN_WORKSPACE_KEY},signal:AbortSignal.timeout(15000)});const data=await r.json();if(!r.ok)return res.status(r.status).json({error:data.error||'Records unavailable.'});return res.status(200).json(data);}catch{return res.status(503).json({error:'Could not load Supabase records.'});}
};