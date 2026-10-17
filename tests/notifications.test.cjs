const {test}=require('node:test'),assert=require('node:assert/strict');const notify=require('../api/notifications');
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('automatic dispatcher rejects unauthenticated requests before provider calls',async()=>{const r=response();await notify({method:'POST',headers:{}},r);assert.equal(r.code,401);});
test('queue dispatcher claims once and records a confirmed receipt result',async()=>{
 const old=global.fetch;process.env.N8N_WEBHOOK_SECRET='test-secret';process.env.NGO_ENGINE_KEY='test-engine';process.env.N8N_ENGINE_WEBHOOK_URL='https://n8n.myaiteam.work.gd/webhook/ngo-report-desk-v2';const calls=[];
 global.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);
 if(body.action==='capabilities')return{ok:true,json:async()=>({pdf_delivery:true})};
 if(body.action==='claim_notifications')return{ok:true,json:async()=>({jobs:[{id:'job-test',owner_hash:'a'.repeat(64),document_type:'receipt',channel:'gmail',recipient:'test@example.invalid',document:{org:'Fictional NGO',receipt_no:'NGO-2026-00000001',donated_on:'2026-10-17',donor:'Fictional donor',amount:100,currency:'INR',mode:'UPI',thank_you:'Thank you for your donation.'}}]})};
 if(body.action==='gmail_pdf'){assert.ok(body.pdf_base64.startsWith('JVBER'));assert.equal(body.email_to,'test@example.invalid');return{ok:true,json:async()=>({pdf_sent:true,channel:'gmail'})};}
 if(body.action==='finish_notification')return{ok:true,json:async()=>({updated:true})};throw Error('Unexpected action '+body.action);
 };
 try{const r=response();await notify({method:'POST',headers:{'x-ngo-key':'test-secret'}},r);assert.equal(r.code,200);assert.equal(r.body.accepted,1);assert.equal(calls.filter(x=>x.action==='gmail_pdf').length,1);assert.ok(calls.some(x=>x.action==='finish_notification'&&x.status==='sent'));}finally{global.fetch=old;delete process.env.N8N_WEBHOOK_SECRET;delete process.env.NGO_ENGINE_KEY;delete process.env.N8N_ENGINE_WEBHOOK_URL;}
});
test('social branches are excluded from the current core workflow',()=>{const j=require('../workflows/ngo-donor-reports-receipts-v2.json');assert.ok(!j.nodes.some(n=>/facebook|instagram/i.test(n.name)));const patch=require('../workflows/automatic-notifications.json');assert.equal(patch.nodes.length,2);assert.ok(patch.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'));});
