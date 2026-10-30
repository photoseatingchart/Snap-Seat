// Snap & Seat phone guest experience — rebuilt as a single owned UI.
// Every selector is scoped to the controller-created root; API and rendering
// failures are handled separately so a missing UI node cannot masquerade as network failure.
const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
const sessionId = params.get('event') || '';
const guestToken = hash.get('token') || params.get('token') || '';
const staticConfig = window.SNAPSEAT_CONFIG || {};
const flowConfig = { skipPhoto: params.get('skipPhoto') === '1', skipMessage: params.get('skipMessage') === '1', messagePrompt: params.get('messagePrompt') || 'Please leave a message for the happy couple', portraitStyle: params.get('portraitStyle') || 'classic-line-art' };
const config = {
  supabaseUrl: hash.get('supabase') || params.get('supabase') || staticConfig.supabaseUrl || '',
  anonKey: hash.get('key') || params.get('key') || staticConfig.anonKey || ''
};
const selectionKey = `snap-seat-selected-${sessionId}`;
const state = { event: null, tables: [], matches: [], selected: [], file: null, preparedFile: null,
  ticket: null, uploaded: false, busy: false, searchTimer: 0, searchSeq: 0, generationSeq: 0, generatedPreviewUrl: '', photoUrl: '', videoUrl: '', client: null, step: 1, mode: 'ai', style: flowConfig.portraitStyle, styles: [], submissionId: '', generation: null, generatedError: null, message: '' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el = selector => app?.querySelector(selector) || null;
const setText = (selector, value) => { const node=el(selector); if(node) node.textContent=String(value ?? ''); };
function renderShell() {
  if (!app) throw new Error('Phone page is missing its app root.');
  app.innerHTML = `<header><div class="wordmark"><span>S</span><b>SNAP &amp; SEAT</b></div><div id="connection" class="connection"><i></i><span>Checking event…</span></div></header>
  <div class="event-date" data-ref="date">YOUR EVENT</div><h1 data-ref="name">Find your seat. Leave a keepsake.</h1><p class="intro">A few quick steps to find your seat and leave a keepsake.</p>
  <div data-ref="progress" class="step-progress"></div><button data-action="gallery" class="gallery-open hidden" type="button">View event gallery</button>
  <section data-step="1" class="guest-step"><h2>Find your name</h2><p>Enter your name to see your assignment.</p><label for="guestSearch">Your name</label><input id="guestSearch" data-ref="search" autocomplete="name" placeholder="Start typing your full name"><div data-ref="matches" class="matches"></div><div data-ref="seatResult"></div><button data-action="saved-seat" class="view-seat hidden" type="button">View seat assignment</button></section>
  <section data-step="2" class="guest-step hidden"><h2>Take a photo</h2><p data-ref="photoPrompt">Add a photo to the event keepsake.</p><div class="portrait-options"><label><input type="radio" name="portraitMode" value="ai" checked> Create a styled portrait</label><label><input type="radio" name="portraitMode" value="photo"> Use my photo as-is</label></div><label class="form-label">Choose a portrait style</label><div data-ref="styleChoices" class="style-choice-grid" role="radiogroup" aria-label="Portrait style"></div><select data-ref="style" class="visually-hidden" aria-hidden="true" tabindex="-1"><option value="classic-line-art">Classic colored line art</option><option value="caricature">Playful caricature</option><option value="watercolor">Soft watercolor</option><option value="gouache">Bold painted portrait</option><option value="graffiti">Graffiti art</option><option value="relit">Studio portrait</option></select><div data-ref="stylePreview" class="style-preview hidden"><small data-ref="stylePreviewLabel">STYLE PREVIEW</small><img data-ref="stylePreviewImage" alt="Preview of your selected portrait style"><p data-ref="stylePreviewText"></p></div>
  <label class="pick-photo" for="photoFile"><span>＋</span><b>Take a photo or choose one</b><small>JPG, PNG, HEIC, or WebP · up to 12 MB</small></label><input data-ref="photo" id="photoFile" type="file" accept="image/*" capture="user" hidden><div data-ref="preview" class="photo-preview hidden"></div><label class="consent"><input data-ref="consent" type="checkbox"><span>I agree to share this photo and message with the event host.</span></label><div data-ref="generationStatus" class="generation-status hidden"></div><div class="group-selection"><small>For a group photo, add each person shown.</small><div data-ref="selectedNames"></div></div><div class="step-actions"><button data-action="back1" class="button light">Back</button>${flowConfig.skipPhoto?'<button data-action="skip-photo" class="button light">Skip photo</button>':''}<button data-action="to-message" class="button primary" disabled>Continue</button></div></section>
  <section data-step="3" class="guest-step hidden"><h2 data-ref="messageHeading">Leave a message</h2><p>Add a note to go with the keepsake.</p><label for="message">Your message</label><textarea data-ref="message" maxlength="300" placeholder="Write a short message…"></textarea><div class="step-actions"><button data-action="back2" class="button light">Back</button>${flowConfig.skipMessage?'<button data-action="skip-message" class="button light">Skip message</button>':''}<button data-action="finish" class="button primary">Continue</button></div></section>
  <section data-step="4" class="guest-step hidden"><h2>Your keepsake</h2><p data-ref="finalStatus">Your portrait is ready.</p><div data-ref="finalPreview" class="final-preview"></div><div data-ref="videoPanel" class="drawing-video hidden"><small data-ref="videoStatus">Drawing the portrait…</small><canvas data-ref="videoCanvas"></canvas></div><a data-ref="downloadPhoto" class="download-photo hidden" href="#" download>Download finished photo</a><button data-action="request-print" class="download-photo hidden" type="button">Request one 4×6 print</button><small data-ref="printRequestStatus" class="print-request-status"></small><a data-ref="downloadVideo" class="download-photo hidden" href="#" download>Download reveal video</a><button data-action="retryVideo" class="download-photo hidden" type="button">Create drawing video</button><div class="step-actions"><button data-action="view-seat-final" class="button primary">View seat assignment</button><button data-action="start-over" class="button light">Done</button></div><div data-ref="finalSeat"></div></section>
  <section data-ref="galleryPanel" class="gallery hidden"></section><div data-ref="status" class="status">Checking this event link…</div><p class="fine">Your seat assignment is available even if you skip the photo or message.</p>`;
  el('[data-ref="messageHeading"]').textContent=flowConfig.messagePrompt;
  el('[data-ref="photoPrompt"]').textContent=`Take a photo for ${flowConfig.messagePrompt.replace(/^Please leave a message for /i,'').replace(/[.!?]+$/,'')}'s keepsake.`;
  renderStep(1);
} 
function renderStep(n){state.step=n;app.querySelectorAll('[data-step]').forEach(node=>node.classList.toggle('hidden',Number(node.dataset.step)!==n));const prog=el('[data-ref="progress"]');if(prog)prog.innerHTML=[1,2,3,4].map(i=>`<span class="${i<=n?'active':''}"></span>`).join('');}

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
function renderStyleChoices(styles=state.styles){const box=el('[data-ref="styleChoices"]'),select=el('[data-ref="style"]');if(!box||!select)return;const available=(styles||[]).filter(style=>style?.id&&style.id!=='photo-only');if(!available.length){box.classList.add('hidden');return;}if(!available.some(style=>style.id===select.value)){select.innerHTML='';for(const style of available){const option=document.createElement('option');option.value=style.id;option.textContent=style.name;select.append(option);}select.value=available[0].id;state.style=select.value;}box.classList.remove('hidden');box.innerHTML=available.map(style=>`<button type="button" class="style-choice ${style.id===select.value?'selected':''}" role="radio" aria-checked="${style.id===select.value}" data-style-choice="${escapeHtml(style.id)}"><img src="${escapeHtml(style.preview||'styles/classic-watercolor.jpg')}" alt=""><span>${escapeHtml(style.name)}</span></button>`).join('');}
function renderSeat(guest){
 const box=el('[data-ref="seatResult"]'); if(!box)return;
 const table=guest.table||'Seat not assigned', seat=guest.seat?`Seat ${guest.seat}`:'No specific seat assigned';
 box.innerHTML=`<div class="seat"><small>YOUR ASSIGNMENT</small><strong>${escapeHtml(table)}</strong><span>${escapeHtml(seat)}</span></div><div data-ref="seatMap" class="seat-map" aria-label="Seating chart"></div>`;
 const map=el('[data-ref="seatMap"]');
 if(!state.tables.length){map.innerHTML='<div class="seat-map-placeholder">Your assignment is shown above. The host has not shared a floor layout.</div>';return;}
 map.innerHTML=state.tables.map(t=>`<div class="seat-map-node ${escapeHtml(t.shape||'round')} ${t.name===guest.table?'active':''}" style="left:${Math.max(3,Math.min(97,Number(t.x)||50))}%;top:${Math.max(6,Math.min(94,Number(t.y)||50))}%">${escapeHtml(t.name)}</div>`).join('');
}
async function chooseGuest(guest){
 if(!state.selected.some(g=>g.id===guest.id))state.selected.push(guest); saveSelected();renderSelected();renderSeat(guest);el('[data-ref="matches"]').innerHTML='';el('[data-ref="search"]').value='';
 status('Guest selected. Continue to the photo step.','good');connection('Connected · seat found','good');api('checkin',{guestIds:[guest.id]}).catch(()=>{});renderStep(flowConfig.skipPhoto?3:2);
 if(flowConfig.skipPhoto && !flowConfig.skipMessage)el('[data-ref="message"]').focus();
 if(flowConfig.skipPhoto && flowConfig.skipMessage)finishFlow();
}

function renderMatches(list){const target=el('[data-ref="matches"]');if(!target)return;target.innerHTML=list.length?list.map(g=>`<button class="match" type="button" data-guest="${escapeHtml(g.id)}"><span>${escapeHtml(g.name)}</span><small>Tap to view assignment</small></button>`).join(''):'<div class="no-match">No close match found. Try a first or last name.</div>';}
async function searchGuests(query){
 const q=query.trim(), seq=++state.searchSeq; if(q.length<2){el('[data-ref="matches"]').innerHTML='';return;}
 connection('Searching guest list…');
 try{const result=await api('lookup',{query:q});if(seq!==state.searchSeq)return;state.tables=result.tables||state.tables;state.matches=result.guests||[];connection('Connected','good');renderMatches(state.matches);}
 catch(error){if(seq!==state.searchSeq)return;connection('Connection issue','bad');status(errorMessage(error),'error');}
}
async function showSavedSeat(){const ids=savedIds();if(!ids.length){status('Search and select your name first.','error');return;}connection('Loading your seat…');try{const result=await api('lookup',{guestIds:ids});state.tables=result.tables||state.tables;state.selected=[];for(const guest of result.guests||[])await chooseGuest(guest);connection('Connected · assignment loaded','good');status('Your current seat assignment is shown below.','good');}catch(error){connection('Could not load assignment','bad');status(errorMessage(error),'error');}}
function updateSubmit(){const button=el('[data-action="to-message"]');if(button)button.disabled=!state.file||!state.selected.length||!el('[data-ref="consent"]')?.checked||state.busy;}
function resetPhoto(){state.submissionId='';el('[data-action="request-print"]')?.classList.add('hidden');state.file=null;state.preparedFile=null;state.ticket=null;state.uploaded=false;state.generationSeq++;if(state.generatedPreviewUrl)URL.revokeObjectURL(state.generatedPreviewUrl);state.generatedPreviewUrl='';el('[data-ref="stylePreview"]')?.classList.add('hidden');const input=el('[data-ref="photo"]');if(input)input.value='';el('[data-ref="preview"]')?.classList.add('hidden');updateSubmit();}
function startGeneration(){
 if(!state.file||state.mode!=='ai')return;
 const style=el('[data-ref="style"]').value,seq=++state.generationSeq;state.style=style;state.generatedError=null;
 const styleNames={'classic-line-art':'Classic colored line art','caricature':'Playful caricature','watercolor':'Soft watercolor','gouache':'Bold painted portrait','graffiti':'Graffiti art','relit':'Studio portrait',...Object.fromEntries((state.styles||[]).map(style=>[style.id,style.name]))};
 const box=el('[data-ref="generationStatus"]');box.textContent=`Creating your ${styleNames[style]||'styled'} portrait…`;box.classList.remove('hidden');
 // Start Nano Banana immediately after photo selection so it can run while the guest writes a note.
 state.generation=readDataUrl(state.file).then(imageData=>api('portrait',{imageData,style},{timeoutMs:90000})).then(result=>{if(seq!==state.generationSeq)return null;state.preparedFile=dataUrlFile(result.imageData,`${state.selected[0].name}-portrait.png`);if(state.generatedPreviewUrl)URL.revokeObjectURL(state.generatedPreviewUrl);state.generatedPreviewUrl=URL.createObjectURL(state.preparedFile);el('[data-ref="stylePreviewImage"]').src=state.generatedPreviewUrl;el('[data-ref="stylePreviewLabel"]').textContent=`YOUR ${styleNames[style]||'STYLE'} PREVIEW`;el('[data-ref="stylePreviewText"]').textContent='This is the portrait that will be added to your keepsake.';el('[data-ref="stylePreview"]').classList.remove('hidden');box.textContent='Portrait preview ready. Choose another style to compare, or continue.';el('[data-action="to-message"]').disabled=!el('[data-ref="consent"]').checked;return result;}).catch(error=>{if(seq!==state.generationSeq)return null;state.generatedError=error;box.textContent=`Portrait generation failed: ${errorMessage(error)}. Switch to “Use my photo as-is” to continue.`;el('[data-action="to-message"]').disabled=!el('[data-ref="consent"]').checked;return null;});
}
function onPhoto(file){if(!file){resetPhoto();return;}if(!file.type.startsWith('image/')){status('Choose an image file to continue.','error');return;}if(file.size>12*1024*1024){status('This photo is larger than 12 MB. Choose a smaller image.','error');return;}
 state.file=file;state.preparedFile=null;state.ticket=null;state.uploaded=false;el('[data-ref="stylePreview"]')?.classList.add('hidden');const preview=el('[data-ref="preview"]');preview.innerHTML=`<img src="${URL.createObjectURL(file)}" alt="Selected photo"><span>${escapeHtml(file.name)}</span><button type="button" data-action="remove-photo">Remove</button>`;preview.classList.remove('hidden');el('[data-action="to-message"]').disabled=!el('[data-ref="consent"]').checked;if(state.mode==='ai')startGeneration();updateSubmit();}

function dataUrlFile(dataUrl,name){const [header,b64]=String(dataUrl).split(',');if(!b64)throw new Error('The portrait service returned an invalid image.');const mime=/data:([^;]+)/.exec(header)?.[1]||'image/png',raw=atob(b64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new File([bytes],name,{type:mime});}
const readDataUrl=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Could not read the photo.'));reader.readAsDataURL(file)});
async function uploadFile(file,ticket){
  if(!state.client){const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');state.client=createClient(config.supabaseUrl,config.anonKey,{auth:{persistSession:false}});}
  const {error}=await state.client.storage.from('guest-photos').uploadToSignedUrl(ticket.path,ticket.token,file,{contentType:file.type||'image/jpeg',cacheControl:'3600'});
  if(error)throw new Error(error.message||'Photo upload failed.');
}
async function submitPhoto(){if(!state.file||!state.selected.length)return;state.busy=true;const button=el('[data-action="finish"]');if(button)button.textContent='Submitting…';
 try{
  if(!state.preparedFile){const mode=el('input[name="portraitMode"]:checked')?.value||'photo';if(mode==='ai'){status('Waiting for your portrait…');const result=await state.generation;if(!result)throw state.generatedError||new Error('Portrait generation failed. Choose photo-only and retry.');}else state.preparedFile=state.file;}
  if(!state.ticket){status('Preparing secure photo upload…');state.ticket=await api('ticket',{guestIds:state.selected.map(g=>g.id),fileName:state.preparedFile.name,mimeType:state.preparedFile.type||'image/jpeg'});}
  if(!state.uploaded){status('Uploading your photo…');await uploadFile(state.preparedFile,state.ticket);state.uploaded=true;}
  status('Saving your photo and note…');const result=await api('submit',{guestIds:state.selected.map(g=>g.id),submissionId:state.ticket.submissionId,path:state.ticket.path,message:el('[data-ref="message"]').value.trim()});
  state.submissionId=state.ticket.submissionId;el('[data-action="request-print"]').classList.remove('hidden');state.photoUrl=URL.createObjectURL(state.preparedFile);const download=el('[data-ref="downloadPhoto"]');download.href=state.photoUrl;download.download=`${(state.selected[0].name||'guest').replace(/[^a-z0-9]+/gi,'-')}-Snap-and-Seat.${(state.preparedFile.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'')}`;download.classList.remove('hidden');
  el('[data-ref="finalPreview"]').innerHTML=`<img src="${state.photoUrl}" alt="Finished portrait"><p>${escapeHtml(state.message)}</p>`;el('[data-ref="videoPanel"]').classList.remove('hidden');renderStep(4);
  status(`Photo received for ${(result.guestNames||[]).join(', ')}.`,'good');connection('Connected · keepsake ready','good');
  state.file=null;state.ticket=null;state.uploaded=false;el('[data-ref="photo"]').value='';el('[data-ref="preview"]').classList.add('hidden');if(button)button.textContent='Keepsake ready';createVideo();
 }catch(error){status(`Photo not submitted: ${errorMessage(error)} You can retry without losing your seat assignment.`,'error');connection('Photo upload needs attention','bad');if(button)button.textContent=state.uploaded?'Retry submission':'Retry photo upload';}
 finally{state.busy=false;}
}
async function createVideo(){if(!state.photoUrl)return;const label=el('[data-ref="videoStatus"]'),button=el('[data-action="retryVideo"]'),download=el('[data-ref="downloadVideo"]');if(button)button.disabled=true;label.textContent='Drawing outlines, then painting in color…';download.classList.add('hidden');try{const {playDrawingReveal}=await import('./drawing-reveal.js');await new Promise((resolve,reject)=>playDrawingReveal({canvas:el('[data-ref="videoCanvas"]'),src:state.photoUrl,guestName:state.selected.map(g=>g.name).join(' & '),message:state.message,exportVideo:true,autoDownload:false,onProgress:p=>label.textContent=`Drawing portrait · ${Math.round(p*100)}%`,onPhase:p=>{if(p==='paint')label.textContent='Painting in color…';},onVideoReady:(blob,url)=>{state.videoUrl=url;download.href=url;download.download=`${(state.selected[0]?.name||'guest').replace(/[^a-z0-9]+/gi,'-')}-Snap-and-Seat-Reveal.webm`;download.classList.remove('hidden');},onDownload:()=>{label.textContent='Finished. Tap “Download reveal video” to save it to your phone.';status('Your drawing video is ready.','good');},onDone:resolve,onError:reject}));}catch(error){label.textContent=`Drawing video unavailable: ${errorMessage(error)}`;}finally{if(button)button.disabled=false;}}
async function showGallery(){connection('Loading event gallery…');try{const result=await api('gallery'),panel=el('[data-ref="galleryPanel"]');panel.innerHTML=`<h2>${escapeHtml(result.eventName||'Event')} gallery</h2><div class="gallery-tools"><button type="button" data-action="copy-gallery">Copy gallery link</button><button type="button" data-action="close-gallery">Back to seat lookup</button></div>${result.photos?.length?`<div class="gallery-grid">${result.photos.map(photo=>`<article class="gallery-card"><img src="${escapeHtml(photo.url)}" alt="Photo from ${escapeHtml(photo.name)}"><b>${escapeHtml(photo.name)}</b>${photo.message?`<small>“${escapeHtml(photo.message)}”</small>`:''}<a href="${escapeHtml(photo.url)}" download>Download photo</a></article>`).join('')}</div>`:'<p>No event photos have been submitted yet.</p>'}`;panel.classList.remove('hidden');el('[data-ref="lookupArea"]').classList.add('hidden');el('[data-ref="status"]').classList.add('hidden');connection('Connected · gallery ready','good');}catch(error){connection('Gallery unavailable','bad');status(errorMessage(error),'error');}}
function closeGallery(){el('[data-ref="galleryPanel"]').classList.add('hidden');el('[data-ref="lookupArea"]').classList.remove('hidden');el('[data-ref="status"]').classList.remove('hidden');}
function finishFlow(){if(!flowConfig.skipPhoto&&!el('[data-ref="consent"]')?.checked){status('Please check the consent box to continue.','error');renderStep(2);return;}state.message=el('[data-ref="message"]')?.value?.trim()||'';if(!state.file){if(flowConfig.skipPhoto){renderStep(4);setText('[data-ref="finalStatus"]','You can view your seat assignment without submitting a photo.');return;}status('Choose a photo to continue.','error');renderStep(2);return;}submitPhoto();}
async function viewFinalSeat(){const target=el('[data-ref="finalSeat"]');if(!state.selected.length){target.textContent='Search your name to find your seat.';renderStep(1);return;}const g=state.selected[0];target.innerHTML=`<div class="seat"><small>YOUR ASSIGNMENT</small><strong>${escapeHtml(g.table||'Seat not assigned')}</strong><span>${g.seat?`Seat ${escapeHtml(g.seat)}`:'No specific seat assigned'}</span></div>`;}
function bindEvents(){
 app.addEventListener('click',event=>{const choice=event.target.closest('[data-style-choice]');if(choice){const select=el('[data-ref="style"]');if(select){select.value=choice.dataset.styleChoice;state.style=select.value;renderStyleChoices();select.dispatchEvent(new Event('change',{bubbles:true}));}}});
 app.addEventListener('input',event=>{if(event.target.matches('[data-ref="search"]')){clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>searchGuests(event.target.value),300);}});
 app.addEventListener('change',event=>{if(event.target.matches('[data-ref="photo"]'))onPhoto(event.target.files?.[0]);if(event.target.matches('[data-ref="consent"]'))updateSubmit();if(event.target.matches('input[name="portraitMode"]')){state.mode=event.target.value;state.generationSeq++;state.generation=null;state.generatedError=null;if(state.mode==='ai'&&state.file)startGeneration();else if(state.mode==='photo'){state.preparedFile=state.file;el('[data-ref="stylePreview"]')?.classList.add('hidden');el('[data-ref="generationStatus"]').textContent='Your photo will be used as-is.';el('[data-action="to-message"]').disabled=!el('[data-ref="consent"]').checked;}}if(event.target.matches('[data-ref="style"]')){state.style=event.target.value;if(state.file&&state.mode==='ai')startGeneration();}if(event.target.matches('[data-ref="message"]'))state.message=event.target.value;});
 app.addEventListener('click',async event=>{
  const removeGuest=event.target.closest('[data-remove]');if(removeGuest){state.selected=state.selected.filter(g=>g.id!==removeGuest.dataset.remove);saveSelected();renderSelected();updateSubmit();return;}
  const match=event.target.closest('[data-guest]');if(match){const guest=state.matches.find(g=>g.id===match.dataset.guest);if(!guest)return;connection('Loading seat assignment…');try{const result=await api('lookup',{guestIds:[guest.id]});state.tables=result.tables||state.tables;const full=result.guests?.[0];if(!full)throw new Error('Guest record was not found. Search again.');await chooseGuest(full);connection('Connected · seat found','good');}catch(error){connection('Could not load assignment','bad');status(errorMessage(error),'error');}return;}
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(action==='request-print'){const button=el('[data-action="request-print"]'),label=el('[data-ref="printRequestStatus"]');if(button)button.disabled=true;try{const r=await api('print_request',{submissionId:state.submissionId,guestId:state.selected[0]?.id});if(label)label.textContent=r.state==='sent'?'Your print is already on its way.':'Print request sent to the event host.';status('One print copy requested.','good')}catch(error){if(label)label.textContent=errorMessage(error);status(`Print request could not be sent: ${errorMessage(error)}`,'error')}finally{if(button)button.disabled=false}return;}if(action==='saved-seat')return showSavedSeat();if(action==='submit')return submitPhoto();if(action==='makeVideo'||action==='retryVideo')return createVideo();if(action==='back1'){renderStep(1);return;}if(action==='back2'){renderStep(2);return;}if(action==='skip-photo'){renderStep(3);return;}if(action==='skip-message'){el('[data-ref="message"]').value='';return finishFlow();}if(action==='to-message'){if(!state.file){status('Take or choose a photo first.','error');return;}state.mode=el('input[name="portraitMode"]:checked')?.value||'photo';if(state.mode==='ai'&&!state.generation)startGeneration();renderStep(3);return;}if(action==='finish')return finishFlow();if(action==='view-seat-final')return viewFinalSeat();if(action==='start-over'){renderStep(1);return;}if(action==='gallery')return showGallery();if(action==='close-gallery')return closeGallery();
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
 state.event=result;state.tables=Array.isArray(result.tables)?result.tables:[];state.styles=Array.isArray(result.portraitStyles)?result.portraitStyles:[];if(state.styles.length){renderStyleChoices(state.styles);if(state.styles.some(style=>style.id===flowConfig.portraitStyle)){el('[data-ref="style"]').value=flowConfig.portraitStyle;state.style=flowConfig.portraitStyle;renderStyleChoices(state.styles)}}
 setText('[data-ref="name"]',result.eventName||'Snap & Seat');setText('[data-ref="date"]',result.eventDate||'WELCOME');
 connection('Connected','good');status('Search your name to find your assigned table and seat.','good');
 if(savedIds().length)el('[data-action="saved-seat"]').classList.remove('hidden');renderStyleChoices(state.styles);
 el('[data-action="gallery"]').classList.remove('hidden');
 if(params.get('gallery')==='1')showGallery();
}
window.addEventListener('online',()=>{if(sessionId)api('info').then(()=>{connection('Connected','good');status('Connection restored. Search your name to continue.','good');}).catch(error=>{connection('Connection issue','bad');status(errorMessage(error),'error');});});
window.addEventListener('offline',()=>{connection('Offline','bad');status('No internet connection. Seat lookup and photo submission need mobile data or Wi‑Fi.','error');});
initialize().catch(error=>{console.error('[Snap & Seat] guest page startup failed',error);connection('Page error','bad');status(`The guest page could not start: ${errorMessage(error)}`,'error');});
