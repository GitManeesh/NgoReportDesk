const {test}=require('node:test'),assert=require('node:assert/strict');const status=require('../api/status');
const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('status accepts the published workflow capability contract version 3',async()=>{
 const old=global.fetch;process.env.N8N_REPORT_WEBHOOK_URL='https://n8n.myaiteam.work.gd/webhook/ngo-report-desk-v2';process.env.N8N_WEBHOOK_SECRET='test-secret';
 global.fetch=async()=>({ok:true,status:200,json:async()=>({version:3,pdf_delivery:true})});
 try{const r=response();await status({method:'GET'},r);assert.equal(r.code,200);assert.deepEqual(r.body,{ready:true,stage:'workflow_ready',upstream_status:200,version:3,pdf_delivery:true});}finally{global.fetch=old;delete process.env.N8N_REPORT_WEBHOOK_URL;delete process.env.N8N_WEBHOOK_SECRET;}
});
