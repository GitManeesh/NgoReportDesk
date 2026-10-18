'use strict';
const crypto=require('node:crypto');

const COOKIE='ngo_admin_session';
const safeEqual=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length>0&&x.length===y.length&&crypto.timingSafeEqual(x,y);};
const digest=value=>crypto.createHash('sha256').update(String(value||'')).digest('hex');
const sign=(value,secret)=>crypto.createHmac('sha256',secret).update(value).digest('hex');

function configured(){return /^[a-f0-9]{64}$/.test(process.env.ADMIN_PASSWORD_SHA256||'')&&(process.env.ADMIN_SESSION_SECRET||'').length>=32&&/^[a-f0-9]{64}$/.test(process.env.ADMIN_WORKSPACE_KEY||'');}
function validPassword(value){return configured()&&safeEqual(digest(value),process.env.ADMIN_PASSWORD_SHA256);}
function createSession(){const payload=Buffer.from(JSON.stringify({exp:Date.now()+8*60*60*1000})).toString('base64url');return payload+'.'+sign(payload,process.env.ADMIN_SESSION_SECRET);}
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),v.slice(i+1)];}));}
function validSession(req){if(!configured())return false;const token=cookies(req)[COOKIE]||'',i=token.lastIndexOf('.');if(i<1)return false;const payload=token.slice(0,i),signature=token.slice(i+1);if(!safeEqual(signature,sign(payload,process.env.ADMIN_SESSION_SECRET)))return false;try{return JSON.parse(Buffer.from(payload,'base64url').toString()).exp>Date.now();}catch{return false;}}
function setSession(res){res.setHeader('Set-Cookie',`${COOKIE}=${createSession()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`);}
function clearSession(res){res.setHeader('Set-Cookie',`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);}
module.exports={configured,validPassword,validSession,setSession,clearSession};