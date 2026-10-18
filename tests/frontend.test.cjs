const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync(require.resolve('../dist/index.html'),'utf8');
const intake=fs.readFileSync(require.resolve('../dist/intake-ui.js'),'utf8');
const donations=fs.readFileSync(require.resolve('../dist/donations.js'),'utf8');
const css=fs.readFileSync(require.resolve('../dist/style.css'),'utf8');

test('top panel contains all public navigation without Settings',()=>{
 const header=html.match(/<header>[\s\S]*?<\/header>/)?.[0]||'';
 for(const page of ['Donations','Field Notes','Log'])assert.match(header,new RegExp('>'+page+'<'));
 assert.doesNotMatch(header,/Settings|open-settings/);
});

test('both intake pages collect and remember the organisation inline',()=>{
 assert.match(html,/id="donation-org" required/);
 assert.match(html,/id="fn-org" required/);
 assert.doesNotMatch(donations,/Settings first|showModal/);
 assert.match(intake,/ngo-organisation/);
});

test('Save donation reports approval and storage failures instead of returning silently',()=>{
 assert.match(donations,/Check the confirmation box before saving/);
 assert.match(donations,/Could not reach record storage/);
 assert.doesNotMatch(html,/id="donation-approval" type="checkbox" required/);
});

test('legacy Settings dialog is inaccessible and compact responsive rules load last',()=>{
 assert.match(html,/<dialog id="settings-dialog" hidden aria-hidden="true">/);
 assert.match(css,/Project 28 compact application shell/);
 assert.match(css,/\.grid,\.donation-grid\{grid-template-columns:1fr\}/);
 assert.ok(css.lastIndexOf('Project 28 compact application shell')>css.lastIndexOf('Adapt the original skin'));
});
