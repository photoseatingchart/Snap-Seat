// Snap & Seat phone guest experience — rebuilt as a single owned UI.
// Every selector is scoped to the controller-created root; API and rendering
// failures are handled separately so a missing UI node cannot masquerade as network failure.
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
const sessionId = params.get('event') || '';
const guestToken = hash.get('token') || params.get('token') || '';
const staticConfig = window.SNAPSEAT_CONFIG || {};
const config = {
  supabaseUrl: hash.get('supabase') || params.get('supabase') || staticConfig.supabaseUrl || '',
  anonKey: hash.get('key') || params.get('key') || staticConfig.anonKey || ''
};
const selectionKey = `snap-seat-selected-${sessionId}`;
const state = { event: null, tables: [], matches: [], selected: [], file: null, preparedFile: null,
  ticket: null, uploaded: false, busy: false, searchTimer: 0, searchSeq: 0, photoUrl: '', videoUrl: '', client: null };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el = selector => app?.querySelector(selector) || null;
const setText = (selector, value) => { const node=el(selector); if(node) node.textContent=String(value ?? ''); };
function renderShell() {
  if (!app) throw new Error('Phone page is missing its app root.');
  app.innerHTML = `<header><div class="wordmark"><span>S</span><b>SNAP &amp; SEAT</b></div><div id="connection" class="connection"><i></i><span>Checking event…</span></div></header>
  <div class="event-date" data-ref="date">YOUR EVENT</div><h1 data-ref="name">Find your seat.<br>Leave a keepsake.</h1>
  <p class="intro">Find your seat assignment, then share a photo and a note from today.</p>
  <button data-action="gallery" class="gallery-open hidden" type="button">View event gallery</button>
  <div data-ref="lookupArea"><section class="lookup"><label for="guestSearch">Search your name</label><input id="guestSearch" data-ref="search" autocomplete="name" placeholder="Start typing your full name"><div data-ref="matches" class="matches"></div><div data-ref="seatResult"></div><button data-action="saved-seat" class="view-seat hidden" type="button">View seat assignment</button></section>
  <section data-ref="share" class="share hidden"><label for="message">Add a note</label><textarea data-ref="message" maxlength="300" placeholder="Write a message to the couple or event host…"></textarea><small class="message-hint">Your photo and message are submitted together. The note is optional.</small>
  <label class="pick-photo" for="photoFile"><span>＋</span><b>Take a photo or choose one</b><small>JPG, PNG, HEIC, or WebP · up to 12 MB</small></label><input data-ref="photo" id="photoFile" type="file" accept="image/*" capture="environment" hidden>
  <div data-ref="preview" class="photo-preview hidden"></div><div class="group-selection"><small>Group photo? Add everyone pictured by searching their names.</small><div data-ref="selectedNames"></div></div>
  <label class="consent"><input data-ref="consent" type="checkbox"><span>I agree to share this photo and note with the event host for this event.</span></label>
  <button data-action="submit" disabled>Submit photo</button><a data-ref="downloadPhoto" class="download-photo hidden" href="#" download>Download photo</a><a data-ref="downloadVideo" class="download-photo hidden" href="#" download>Download reveal video</a><button data-action="makeVideo" class="download-photo hidden" type="button">Create drawing video</button>
  <div data-ref="videoPanel" class="drawing-video hidden"><small data-ref="videoStatus">Preparing drawing…</small><canvas data-ref="videoCanvas"></canvas></div></section></div>
  <section data-ref="galleryPanel" class="gallery hidden"></section><div data-ref="status" class="status">Checking this event link…</div><p class="fine">Your seat assignment is available even if you choose not to submit a photo.</p>`;
}
function connection(message, kind='wait') { const node=el('#connection'); if(!node) return; node.className=`connection ${kind}`; setText('#connection span',message); }
function status(message, kind='') { const node=el('[data-ref="status"]'); if(!node)return; node.textContent=message; node.className=`status ${kind}`; }
function errorMessage(value) { return value instanceof Error ? value.message : String(value?.message || value || 'Unknown error'); }
async function api(action, body={}, {timeoutMs=15000}={}) {
  if(!config.supabaseUrl || !config.anonKey) throw new Error('This event link is missing its service settings. Ask the host to reopen the event and show a fresh QR code.');
  const abort = new AbortController(), timer=setTimeout(()=>abort.abort(),timeoutMs);
  try {
    const response=await fetch(`${config.supabaseUrl.replace(/\/$/,'')}/functions/v1/snap-seat`,{
      method:'POST', headers:{'Content-Type':'application/json','apikey':config.anonKey,'Authorization':`Bearer ${config.anonKey}`},
      body:JSON.stringify({action,sessionId,guestToken,...body}), signal:abort.signal
    });
    const raw=await response.text(); let data={}; try { data=raw?JSON.parse(raw):{}; } catch { data={error:raw.slice(0,300)}; }
    if(!response.ok) throw new Error(data.error || `Event service returned HTTP ${response.status}.`);
    return data;
  } catch(error) {
    if(error?.name==='AbortError') throw new Error('The event service did not respond in time. Check mobile data or Wi‑Fi and try again.');
    if(error instanceof TypeError) throw new Error(`Could not reach the event service. Check mobile data or Wi‑Fi. (${error.message})`);
    throw error;
  } finally { clearTimeout(timer); }
}
function savedIds(){try{return JSON.parse(localStorage.getItem(selectionKey)||'[]')}catch{return []}}
function saveSelected(){try{localStorage.setItem(selectionKey,JSON.stringify(state.selected.map(g=>g.id)))}catch{}}
function renderSelected(){const box=el('[data-ref="selectedNames"]');if(!box)return;box.innerHTML=state.selected.map(g=>`<span class="person-pill">${escapeHtml(g.name)} <button type="button" aria-label="Remove ${escapeHtml(g.name)}" data-remove="${escapeHtml(g.id)}">×</button></span>`).join('');}
function renderSeat(guest){
 const box=el('[data-ref="seatResult"]'); if(!box)return;
 const table=guest.table||'Seat not assigned', seat=guest.seat?`Seat ${guest.seat}`:'No specific seat assigned';
 box.innerHTML=`<div class="seat"><small>YOUR ASSIGNMENT</small><strong>${escapeHtml(table)}</strong><span>${escapeHtml(seat)}</span></div><div data-ref="seatMap" class="seat-map" aria-label="Seating chart"></div>`;
 const map=el('[data-ref="seatMap"]');
 if(!state.tables.length){map.innerHTML='<div class="seat-map-placeholder">Your assignment is shown above. The host has not shared a floor layout.</div>';return;}
 map.innerHTML=state.tables.map(t=>`<div class="seat-map-node ${escapeHtml(t.shape||'round')} ${t.name===guest.table?'active':''}" style="left:${Math.max(3,Math.min(97,Number(t.x)||50))}%;top:${Math.max(6,Math.min(94,Number(t.y)||50))}%">${escapeHtml(t.name)}</div>`).join('');
}
async function chooseGuest(guest){
 if(!state.selected.some(g=>g.id===guest.id))state.selected.push(guest);
 saveSelected(); renderSelected(); renderSeat(guest); el('[data-ref="share"]')?.classList.remove('hidden'); el('[data-action="saved-seat"]')?.classList.remove('hidden');
 el('[data-ref="matches"]').innerHTML=''; el('[data-ref="search"]').value='';
 status('Seat found. Add a photo and an optional note, or leave this page open to return to your assignment.','good');
 // Seat lookup is already successful; check-in is supplementary and never changes that result.
 api('checkin',{guestIds:[guest.id]}).then(()=>connection('Connected · seat confirmed','good')).catch(()=>connection('Connected · seat found','good'));
}
function renderMatches(list){const target=el('[data-ref="matches"]');if(!target)return;target.innerHTML=list.length?list.map(g=>`<button class="match" type="button" data-guest="${escapeHtml(g.id)}"><span>${escapeHtml(g.name)}</span><small>Tap to view assignment</small></button>`).join(''):'<div class="no-match">No close match found. Try a first or last name.</div>';}
async function searchGuests(query){
 const q=query.trim(), seq=++state.searchSeq; if(q.length<2){el('[data-ref="matches"]').innerHTML='';return;}
 connection('Searching guest list…');
 try{const result=await api('lookup',{query:q});if(seq!==state.searchSeq)return;state.tables=result.tables||state.tables;state.matches=result.guests||[];connection('Connected','good');renderMatches(state.matches);}
 catch(error){if(seq!==state.searchSeq)return;connection('Connection issue','bad');status(errorMessage(error),'error');}
}
async function showSavedSeat(){const ids=savedIds();if(!ids.length){status('Search and select your name first.','error');return;}connection('Loading your seat…');try{const result=await api('lookup',{guestIds:ids});state.tables=result.tables||state.tables;state.selected=[];for(const guest of result.guests||[])await chooseGuest(guest);connection('Connected · assignment loaded','good');status('Your current seat assignment is shown below.','good');}catch(error){connection('Could not load assignment','bad');status(errorMessage(error),'error');}}
function updateSubmit(){const button=el('[data-action="submit"]');if(button)button.disabled=!state.file||!state.selected.length||!el('[data-ref="consent"]')?.checked||state.busy;}
function resetPhoto(){state.file=null;state.preparedFile=null;state.ticket=null;state.uploaded=false;const input=el('[data-ref="photo"]');if(input)input.value='';el('[data-ref="preview"]')?.classList.add('hidden');updateSubmit();}
function onPhoto(file){if(!file){resetPhoto();return;}if(!file.type.startsWith('image/')){status('Choose an image file to continue.','error');return;}if(file.size>12*1024*1024){status('This photo is larger than 12 MB. Choose a smaller image.','error');return;}
 state.file=file;state.preparedFile=null;state.ticket=null;state.uploaded=false;const preview=el('[data-ref="preview"]');preview.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Selected photo"><span>${escapeHtml(file.name)}</span><button type="button" data-action="remove-photo">Remove</button>`;preview.classList.remove('hidden');updateSubmit();}
function dataUrlFile(dataUrl,name){const [header,b64]=String(dataUrl).split(',');if(!b64)throw new Error('The portrait service returned an invalid image.');const mime=/data:([^;]+)/.exec(header)?.[1]||'image/png',raw=atob(b64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new File([bytes],name,{type:mime});}
const readDataUrl=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read the photo.'));reader.readAsDataURL(file)});
async function uploadFile(file,ticket){
  if(!state.client){const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');state.client=createClient(config.supabaseUrl,config.anonKey,{auth:{persistSession:false}});}
  const {error}=await state.client.storage.from('guest-photos').uploadToSignedUrl(ticket.path,ticket.token,file,{contentType:file.type||'image/jpeg',cacheControl:'3600'});
  if(error)throw new Error(error.message||'Photo upload failed.');
}
async function submitPhoto(){if(!state.file||!state.selected.length||!el('[data-ref="consent"]')?.checked)return;state.busy=true;updateSubmit();const button=el('[data-action="submit"]');button.textContent='Submitting photo…';
 try{
  if(!state.preparedFile){
    const mode=el('input[name="portraitMode"]:checked')?.value||'photo';
    if(mode==='ai'){status('Creating the AI portrait…');const generated=await api('portrait',{imageData:await readDataUrl(state.file)},{timeoutMs:90000});state.preparedFile=dataUrlFile(generated.imageData,`${state.selected[0].name}-portrait.png`);}
    else state.preparedFile=state.file;
  }
  if(!state.ticket){status('Preparing secure photo upload…');state.ticket=await api('ticket',{guestIds:state.selected.map(g=>g.id),fileName:state.preparedFile.name,mimeType:state.preparedFile.type||'image/jpeg'});}
  if(!state.uploaded){status('Uploading your photo…');await uploadFile(state.preparedFile,state.ticket);state.uploaded=true;}
  status('Saving your photo and note…');const result=await api('submit',{guestIds:state.selected.map(g=>g.id),submissionId:state.ticket.submissionId,path:state.ticket.path,message:el('[data-ref="message"]').value.trim()});
  state.photoUrl=URL.createObjectURL(state.preparedFile);const download=el('[data-ref="downloadPhoto"]');download.href=state.photoUrl;download.download=`${(state.selected[0].name||'guest').replace(/[^a-z0-9]+/gi,'-')}-Snap-and-Seat.${(state.preparedFile.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'')}`;download.classList.remove('hidden');
  el('[data-action="makeVideo"]').classList.remove('hidden');el('[data-ref="videoPanel"]').classList.remove('hidden');
  status(`Photo received for ${(result.guestNames||[]).join(', ')}. Your seat assignment is still available below.`,'good');connection('Connected · photo received','good');
  state.file=null;state.ticket=null;state.uploaded=false;el('[data-ref="photo"]').value='';el('[data-ref="preview"]').classList.add('hidden');button.textContent='Photo submitted';
 }catch(error){status(`Photo not submitted: ${errorMessage(error)} You can retry without losing your seat assignment.`,'error');connection('Photo upload needs attention','bad');button.textContent=state.uploaded?'Retry submission':'Retry photo upload';}
 finally{state.busy=false;updateSubmit();}
}
async function createVideo(){if(!state.photoUrl)return;const label=el('[data-ref="videoStatus"]'),button=el('[data-action="makeVideo"]'),download=el('[data-ref="downloadVideo"]');button.disabled=true;label.textContent='Drawing outlines, then painting in color…';download.classList.add('hidden');try{const {playDrawingReveal}=await import('./drawing-reveal.js');await new Promise((resolve,reject)=>playDrawingReveal({canvas:el('[data-ref="videoCanvas"]'),src:state.photoUrl,guestName:state.selected.map(g=>g.name).join(' & '),message:el('[data-ref="message"]').value.trim(),exportVideo:true,autoDownload:false,onProgress:p=>label.textContent=`Drawing portrait · ${Math.round(p*100)}%`,onPhase:p=>{if(p==='paint')label.textContent='Painting in color…';},onVideoReady:(blob,url)=>{state.videoUrl=url;download.href=url;download.download=`${(state.selected[0]?.name||'guest').replace(/[^a-z0-9]+/gi,'-')}-Snap-and-Seat-Reveal.webm`;download.classList.remove('hidden');},onDownload:()=>{label.textContent='Finished. Tap “Download reveal video” to save it to your phone.';status('Your drawing video is ready.','good');},onDone:resolve,onError:reject}));}catch(error){label.textContent=`Drawing video unavailable: ${errorMessage(error)}`;}finally{button.disabled=false;}}
async function showGallery(){connection('Loading event gallery…');try{const result=await api('gallery'),panel=el('[data-ref="galleryPanel"]');panel.innerHTML=`<h2>${escapeHtml(result.eventName||'Event')} gallery</h2><div class="gallery-tools"><button type="button" data-action="copy-gallery">Copy gallery link</button><button type="button" data-action="close-gallery">Back to seat lookup</button></div>${result.photos?.length?`<div class="gallery-grid">${result.photos.map(photo=>`<article class="gallery-card"><img src="${escapeHtml(photo.url)}" alt="Photo from ${escapeHtml(photo.name)}"><b>${escapeHtml(photo.name)}</b>${photo.message?`<small>“${escapeHtml(photo.message)}”</small>`:''}<a href="${escapeHtml(photo.url)}" download>Download photo</a></article>`).join('')}</div>`:'<p>No event photos have been submitted yet.</p>'}`;panel.classList.remove('hidden');el('[data-ref="lookupArea"]').classList.add('hidden');el('[data-ref="status"]').classList.add('hidden');connection('Connected · gallery ready','good');}catch(error){connection('Gallery unavailable','bad');status(errorMessage(error),'error');}}
function closeGallery(){el('[data-ref="galleryPanel"]').classList.add('hidden');el('[data-ref="lookupArea"]').classList.remove('hidden');el('[data-ref="status"]').classList.remove('hidden');}
function bindEvents(){
 app.addEventListener('input',event=>{if(event.target.matches('[data-ref="search"]')){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>searchGuests(event.target.value),300);}});
 app.addEventListener('change',event=>{if(event.target.matches('[data-ref="photo"]'))onPhoto(event.target.files?.[0]);if(event.target.matches('[data-ref="consent"]'))updateSubmit();});
 app.addEventListener('click',async event=>{
  const removeGuest=event.target.closest('[data-remove]');if(removeGuest){state.selected=state.selected.filter(g=>g.id!==removeGuest.dataset.remove);saveSelected();renderSelected();updateSubmit();return;}
  const match=event.target.closest('[data-guest]');if(match){const guest=state.matches.find(g=>g.id===match.dataset.guest);if(!guest)return;connection('Loading seat assignment…');try{const result=await api('lookup',{guestIds:[guest.id]});state.tables=result.tables||state.tables;const full=result.guests?.[0];if(!full)throw new Error('Guest record was not found. Search again.');await chooseGuest(full);connection('Connected · seat found','good');}catch(error){connection('Could not load assignment','bad');status(errorMessage(error),'error');}return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='saved-seat')return showSavedSeat();if(action==='submit')return submitPhoto();if(action==='makeVideo')return createVideo();if(action==='gallery')return showGallery();if(action==='close-gallery')return closeGallery();
  if(action==='remove-photo'){resetPhoto();return;}
  if(action==='copy-gallery'){const url=new URL(location.href);url.searchParams.set('gallery','1');try{await navigator.clipboard.writeText(url.href);status('Gallery link copied.','good');}catch{status(`Copy this link: ${url.href}`,'good');}}
 });
}
async function initialize(){
 renderShell();bindEvents();
 if(!sessionId||!guestToken){connection('Invalid event link','bad');status('This link is missing its event information. Ask the host to open the event and display a fresh QR code.','error');return;}
 connection('Connecting to event…');
 let result;
 try{result=await api('info');}catch(error){connection('Connection issue','bad');status(errorMessage(error),'error');return;}
 // From here onward the service is confirmed connected. Rendering failure must
 // never be presented to the guest as an API/network failure.
 state.event=result;state.tables=Array.isArray(result.tables)?result.tables:[];
 setText('[data-ref="name"]',result.eventName||'Snap & Seat');setText('[data-ref="date"]',result.eventDate||'WELCOME');
 connection('Connected','good');status('Search your name to find your assigned table and seat.','good');
 if(savedIds().length)el('[data-action="saved-seat"]').classList.remove('hidden');
 el('[data-action="gallery"]').classList.remove('hidden');
 if(params.get('gallery')==='1')showGallery();
}
window.addEventListener('online',()=>{if(sessionId)api('info').then(()=>{connection('Connected','good');status('Connection restored. Search your name to continue.','good');}).catch(error=>{connection('Connection issue','bad');status(errorMessage(error),'error');});});
window.addEventListener('offline',()=>{connection('Offline','bad');status('No internet connection. Seat lookup and photo submission need mobile data or Wi‑Fi.','error');});
initialize().catch(error=>{console.error('[Snap & Seat] guest page startup failed',error);connection('Page error','bad');status(`The guest page could not start: ${errorMessage(error)}`,'error');});
