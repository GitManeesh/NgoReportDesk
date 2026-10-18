'use strict';
const Auth=require('../lib/admin-auth.cjs');
const attempts=new Map();
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='GET')return res.status(200).json({authenticated:Auth.validSession(req),configured:Auth.configured()});
 if(req.method==='DELETE'){Auth.clearSession(res);return res.status(200).json({authenticated:false});}
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
 if(!Auth.configured())return res.status(503).json({error:'Admin access is not configured.'});
 const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];const now=Date.now();const state=attempts.get(ip)||{start:now,count:0};if(now-state.start>15*60*1000){state.start=now;state.count=0;}state.count++;attempts.set(ip,state);if(state.count>8)return res.status(429).json({error:'Too many attempts. Try again later.'});
 const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});if(typeof body.password!=='string'||body.password.length>200||!Auth.validPassword(body.password))return res.status(401).json({error:'Access code was not accepted.'});
 attempts.delete(ip);Auth.setSession(res);return res.status(200).json({authenticated:true});
};