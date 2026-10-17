(()=>{
 const dialog=$('settings-dialog');
 $('open-settings').onclick=()=>dialog.showModal();$('close-settings').onclick=()=>dialog.close();
 function organisation(value){for(const id of ['donation-org','fn-org','org']){const input=$(id);if(input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}}}
 const stored=localStorage.getItem('ngo-organisation')||$('schedule-org').value||'';$('workspace-org').value=stored;organisation(stored);
 $('workspace-org').addEventListener('input',()=>{const value=$('workspace-org').value.trim();localStorage.setItem('ngo-organisation',value);organisation(value);$('schedule-org').value=value;});
 $('schedule-org').addEventListener('change',()=>{$('workspace-org').value=$('schedule-org').value;$('workspace-org').dispatchEvent(new Event('input'));});
 const submit=$('field-note-form').onsubmit;$('field-note-form').onsubmit=event=>{if(!$('fn-org').value.trim()){event.preventDefault();$('fn-status').textContent='Add your organisation in Settings first.';dialog.showModal();$('workspace-org').focus();return;}return submit(event);};
 $('open-settings').addEventListener('click',()=>{if(!$('workspace-org').value&&$('schedule-org').value){$('workspace-org').value=$('schedule-org').value;organisation($('schedule-org').value);}});
 for(const id of ['refresh-contacts','refresh-notifications']){const action=$(id).onclick;dialog.addEventListener('toggle',()=>{if(dialog.open)action();});}
})();
