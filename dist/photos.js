(() => {
 window.reportAttachments=[];
 function render(){const target=$('photo-previews');target.replaceChildren();for(const p of window.reportAttachments){const img=document.createElement('img');img.src=p.data_url;img.alt=p.name;img.style.cssText='max-width:140px;max-height:100px;object-fit:contain;margin:8px';target.append(img);}}
 window.setReportPhotos=photos=>{window.reportAttachments=photos;$('report-photos').value='';render();};
 $('report-photos').onchange=async()=>{
  try{
   const files=[...$('report-photos').files];if(files.length>2||files.some(f=>f.size>500000||!['image/jpeg','image/png'].includes(f.type)))throw Error('Choose up to two JPG or PNG photos, no larger than 500 KB each.');
   const photos=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:file.name.slice(0,150),data_url:r.result});r.onerror=()=>reject(Error('Could not read the photo.'));r.readAsDataURL(file);})));
   window.reportAttachments=photos;$('approve').checked=false;$('approve').dispatchEvent(new Event('change'));render();window.dispatchEvent(new Event('report-photos-changed'));
  }catch(e){$('status').textContent=e.message;}
 };
 for(const id of ['clear','sample'])$(id).addEventListener('click',()=>{window.setReportPhotos([]);window.dispatchEvent(new Event('report-photos-changed'));});
})();
