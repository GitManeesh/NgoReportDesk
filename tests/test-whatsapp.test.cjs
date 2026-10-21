const {test}=require('node:test'),assert=require('node:assert/strict');
const handler=require('../api/test-whatsapp');
const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
test('WhatsApp test endpoint disabled by default',async()=>{const r=response();await handler({method:'POST',headers:{},body:{}},r);assert.equal(r.code,503);});
test('WhatsApp test endpoint rejects unauthenticated requests',async()=>{
 const previous=process.env.ENABLE_WHATSAPP_PDF_TEST;process.env.ENABLE_WHATSAPP_PDF_TEST='true';
 try{const r=response();await handler({method:'POST',headers:{},body:{confirm_test_send:true}},r);assert.equal(r.code,401);}
 finally{if(previous===undefined)delete process.env.ENABLE_WHATSAPP_PDF_TEST;else process.env.ENABLE_WHATSAPP_PDF_TEST=previous;}
});
