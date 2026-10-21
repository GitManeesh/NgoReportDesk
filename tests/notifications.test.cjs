const {test}=require('node:test'),assert=require('node:assert/strict');const notify=require('../api/notifications');
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('automatic dispatcher rejects unauthenticated requests before provider calls',async()=>{const r=response();await notify({method:'POST',headers:{}},r);assert.equal(r.code,401);});
test('authenticated scheduler is safely skipped in test mode without external calls',async()=>{
 const oldFetch=global.fetch,oldMode=process.env.NOTIFICATION_MODE,oldSecret=process.env.N8N_WEBHOOK_SECRET;
 process.env.NOTIFICATION_MODE='test';process.env.N8N_WEBHOOK_SECRET='scheduler-test-secret';
 global.fetch=async()=>{throw Error('Test mode scheduler must not call provider or storage');};
 try{const r=response();await notify({method:'POST',headers:{'x-ngo-key':'scheduler-test-secret'}},r);assert.equal(r.code,200);assert.equal(r.body.mode,'test');assert.equal(r.body.skipped,true);assert.equal(r.body.processed,0);assert.equal(r.body.accepted,0);}finally{global.fetch=oldFetch;if(oldMode===undefined)delete process.env.NOTIFICATION_MODE;else process.env.NOTIFICATION_MODE=oldMode;if(oldSecret===undefined)delete process.env.N8N_WEBHOOK_SECRET;else process.env.N8N_WEBHOOK_SECRET=oldSecret;}
});
test('incorrect scheduler secret cannot bypass workspace authentication',async()=>{
 const old=process.env.N8N_WEBHOOK_SECRET;process.env.N8N_WEBHOOK_SECRET='scheduler-test-secret';
 try{const r=response();await notify({method:'POST',headers:{'x-ngo-key':'incorrect'}},r);assert.equal(r.code,401);assert.match(r.body.error,/workspace key/i);}finally{if(old===undefined)delete process.env.N8N_WEBHOOK_SECRET;else process.env.N8N_WEBHOOK_SECRET=old;}
});
test('test-mode dispatcher records browser-owned simulations without provider or relay calls',async()=>{
 const old=global.fetch;process.env.NOTIFICATION_MODE='test';process.env.TEST_DONOR_EMAIL='test@example.invalid';let called='';
 global.fetch=async(url)=>{called=String(url);return{ok:true,json:async()=>({mode:'test',processed:2,accepted:2,simulated:2,uncertain:0})};};
 try{const r=response();await notify({method:'POST',headers:{'x-workspace-key':'a'.repeat(64)}},r);assert.equal(r.code,200);assert.equal(r.body.accepted,2);assert.equal(r.body.simulated,2);assert.match(called,/resource=simulate_notifications/);assert.doesNotMatch(called,/n8n/);}finally{global.fetch=old;delete process.env.NOTIFICATION_MODE;delete process.env.TEST_DONOR_EMAIL;}
});
test('dispatcher refuses production claims without explicit approval',async()=>{process.env.N8N_WEBHOOK_SECRET='test-secret';process.env.NGO_ENGINE_KEY='test-engine';process.env.N8N_ENGINE_WEBHOOK_URL='https://n8n.myaiteam.work.gd/webhook/ngo-report-desk-v2';process.env.NOTIFICATION_MODE='production';try{const r=response();await notify({method:'POST',headers:{'x-ngo-key':'test-secret'}},r);assert.equal(r.code,503);assert.match(r.body.error,/not approved/i);}finally{for(const key of ['N8N_WEBHOOK_SECRET','NGO_ENGINE_KEY','N8N_ENGINE_WEBHOOK_URL','NOTIFICATION_MODE'])delete process.env[key];}});
test('social branches are excluded from the current core workflow',()=>{const j=require('../workflows/ngo-donor-reports-receipts-v2.json');assert.ok(!j.nodes.some(n=>/facebook|instagram/i.test(n.name)));const patch=require('../workflows/automatic-notifications.json');assert.equal(patch.nodes.length,2);assert.ok(patch.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'));});
