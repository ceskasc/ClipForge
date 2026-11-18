import { TOOLS, L10N, formatTime, formatBytes, clampRange } from './i18n.js';
const MAX_FILE_SIZE = 180 * 1024 * 1024;
let enginePromise;
const getEngine = () => enginePromise ||= import('./engine.js');

const $ = id => document.getElementById(id);
const state = {
  locale:'tr',theme:'light',tool:'trim',
  file:null,url:null,metadata:null,range:{start:0,end:0},
  settings:{format:'mp4',quality:'medium',height:720,audioFormat:'mp3',rotate:90,gifWidth:360,gifFps:8},
  busy:false,loading:false,activeConversion:null,abortController:null,
  outputUrl:null,sequence:0
};
const t = key => L10N[state.locale][key] || key;
const icon = name => '<svg aria-hidden="true"><use href="#ic-'+name+'"></use></svg>';
const toolOf = () => TOOLS.find(tool=>tool.id===state.tool);

function saveSetting(key,value) {try {localStorage.setItem(key,value);}catch {}}
function readSetting(key) {try{return localStorage.getItem(key);}catch{return null;}}
function setTheme(value) {
  state.theme=value==='dark'?'dark':'light';
  document.documentElement.dataset.theme=state.theme;
  $('themeSwitch').setAttribute('aria-label',t(state.theme==='dark'?'darkAria':'lightAria'));
  saveSetting('clipforge-theme',state.theme);
}
function setLocale(locale) {
  state.locale=locale==='en'?'en':'tr';
  document.documentElement.lang=state.locale;
  document.title=state.locale==='tr'?'ClipForge — Video, sadeleşti.':'ClipForge — Video, simplified.';
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.dataset.i18n;
    if(Object.prototype.hasOwnProperty.call(L10N[state.locale],key))el.textContent=t(key);
  });
  $('langSwitch').textContent=state.locale==='tr'?'EN':'TR';
  $('langSwitch').setAttribute('aria-label',state.locale==='tr'?'Switch to English':'Türkçeye geç');
  $('removeFile').setAttribute('aria-label',t('replaceAria'));
  setTheme(state.theme);
  saveSetting('clipforge-language',state.locale);
  drawTools();
  drawSettings();
  updateFileView();
  if(state.metadata && !state.busy && !state.loading) {
    $('outputSummary').textContent=t('ready');
    $('outputHelp').textContent=t(state.tool==='gif'?'gifNote':state.tool==='compress'?'compressNote':'outputHelp');
  }
}
function drawTools() {
  const target=$('toolList');target.replaceChildren();
  TOOLS.forEach((tool,index)=>{
    const button=document.createElement('button');button.type='button';
    button.className='tool-card'+(tool.id===state.tool?' active':'');
    button.setAttribute('aria-pressed',String(tool.id===state.tool));
    button.setAttribute('aria-label',(state.locale==='tr'?tool.tr:tool.en));
    button.disabled=state.busy||state.loading;
    const pict=document.createElement('span');pict.className='tool-icon';pict.innerHTML=icon(tool.icon);
    const words=document.createElement('span');words.className='tool-card-copy';
    const title=document.createElement('b');title.textContent=state.locale==='tr'?tool.tr:tool.en;
    const sub=document.createElement('small');sub.textContent=state.locale==='tr'?tool.subTr:tool.subEn;
    const arrow=document.createElement('span');arrow.className='tool-arrow';arrow.innerHTML=icon('arrow');
    words.append(title,sub);button.append(pict,words,arrow);
    button.addEventListener('click',()=>switchTool(tool.id));
    target.append(button);
  });
}
function switchTool(id){
  if(state.busy||state.loading||!TOOLS.some(tool=>tool.id===id))return;
  state.tool=id;
  if(state.metadata){
    if(id==='gif')state.range.end=Math.min(state.metadata.duration,state.range.start+8);
    else if(state.range.end<=state.range.start+.1)state.range={start:0,end:state.metadata.duration};
  }
  resetDownload();
  drawTools();
  drawSettings();
  updateTimeRange();
  updateFileView();
  $('status').textContent='';
}
function createSelect(name,label,values,help){
  const group=document.createElement('div');group.className='option-field';
  const lab=document.createElement('label');lab.htmlFor='opt-'+name;lab.textContent=t(label);
  const select=document.createElement('select');select.id='opt-'+name;
  for(const [value,text] of values){
    const opt=document.createElement('option');opt.value=String(value);opt.textContent=text;
    select.append(opt);
  }
  select.value=String(state.settings[name]);
  select.disabled=state.busy||state.loading;
  select.addEventListener('change',()=>{state.settings[name]=select.value;resetDownload();updateOutputSummary();});
  group.append(lab,select);
  if(help){
    const h=document.createElement('small');h.textContent=t(help);group.append(h);
  }
  $('options').append(group);
}
function createNote(key){
  const note=document.createElement('p');note.className='option-info';note.textContent=t(key);$('options').append(note);
}
function drawSettings(){
  const tool=toolOf();
  $('toolSequence').textContent=String(TOOLS.indexOf(tool)+1).padStart(2,'0')+' / 06';
  $('editorTitle').textContent=state.file?state.file.name:t('editorTitle');
  $('settingsTitle').textContent=state.locale==='tr'?tool.tr:tool.en;
  $('settingsDescription').textContent=state.locale==='tr'?tool.descriptionTr:tool.descriptionEn;
  $('options').replaceChildren();
  const tr=state.locale==='tr';
  if(state.tool==='trim'){
    createSelect('format','chooseFormat',[['mp4','MP4'],['webm','WebM']],'formatNote');
    createNote('trimNote');
  }
  if(state.tool==='convert'){
    createSelect('format','chooseFormat',[['mp4','MP4'],['webm','WebM']],'formatNote');
  }
  if(state.tool==='compress'){
    createSelect('quality','chooseQuality',[
      ['high',t('qualityHigh')],['medium',t('qualityMedium')],['low',t('qualityLow')]
    ]);
    createSelect('height','chooseSize',[
      [0,t('auto')],[1080,'1080p'],[720,'720p'],[480,'480p']
    ]);
    createNote('compressNote');
  }
  if(state.tool==='audio'){
    createSelect('audioFormat','chooseAudio',[['mp3','MP3'],['wav','WAV']]);
    createNote('audioNote');
  }
  if(state.tool==='gif'){
    createSelect('gifWidth','chooseGifWidth',[[240,'240 px'],[360,'360 px'],[480,'480 px']]);
    createSelect('gifFps','chooseGifFps',[[5,'5 FPS'],[8,'8 FPS']]);
    createNote('gifNote');
  }
  if(state.tool==='rotate'){
    createSelect('rotate','chooseAngle',[[90,'90°'],[180,'180°'],[270,'270°']]);
    createSelect('format','chooseFormat',[['mp4','MP4'],['webm','WebM']]);
    createNote('formatNote');
  }
  updateOutputSummary();
}
function updateOutputSummary(){
  if(!state.file||!state.metadata){
    $('outputSummary').textContent=t('outputWaiting');
    $('outputHelp').textContent=t('outputHelp');
  }else{
    let suffix=state.tool==='gif'?'GIF':state.tool==='audio'?state.settings.audioFormat.toUpperCase():
      state.tool==='convert'||state.tool==='trim'||state.tool==='rotate'?state.settings.format.toUpperCase():'MP4';
    $('outputSummary').textContent=suffix+' / '+formatTime(
      state.tool==='gif'||state.tool==='trim'?state.range.end-state.range.start:state.metadata.duration
    );
    $('outputHelp').textContent=t(state.tool==='gif'?'gifNote':state.tool==='compress'?'compressNote':'outputHelp');
  }
}
function status(text,type){
  const el=$('status');el.textContent=text||'';
  el.className='status'+(type?' '+type:'');
}
function updateBusy(){
  const locked=state.busy||state.loading;
  $('runButton').disabled=locked||!state.file||!state.metadata;
  $('chooseFile').disabled=locked;
  $('changeFile').disabled=locked;
  $('removeFile').disabled=locked;
  $('fileInput').disabled=locked;
  $('startRange').disabled=locked;
  $('endRange').disabled=locked;
  $('cancelButton').hidden=!state.busy;
  $('toolList').querySelectorAll('button').forEach(b=>{b.disabled=locked;});
  $('options').querySelectorAll('select').forEach(s=>{s.disabled=locked;});
  $('dropZone').setAttribute('aria-disabled',String(locked));
}
function resetDownload(){
  if(state.outputUrl){URL.revokeObjectURL(state.outputUrl);state.outputUrl=null;}
  $('download').hidden=true;
  $('download').removeAttribute('href');
  $('download').removeAttribute('download');
  $('progressBox').hidden=true;
  $('progressBar').value=0;
  $('progressValue').textContent='0%';
  updateOutputSummary();
}
function updateTimeRange(){
  if(!state.metadata)return;
  const duration=state.metadata.duration;
  state.range=clampRange(state.range.start,state.range.end,duration);
  for(const name of ['start','end']){
    const slider=$(name+'Range');
    slider.min='0';slider.max=String(duration);
    slider.step='0.05';
    slider.value=String(state.range[name]);
    $(name+'Out').textContent=formatTime(state.range[name]);
  }
  $('rangeDuration').textContent=formatTime(state.range.end-state.range.start)+' / '+formatTime(duration);
  updateOutputSummary();
}
function updateFileView(){
  const filled=Boolean(state.file);
  $('dropZone').hidden=filled;
  $('loadedView').hidden=!filled;
  if(!filled)$('outputSummary').textContent=t('outputWaiting');
  if(!filled)return;
  $('fileName').textContent=state.file.name;
  const m=state.metadata;
  $('fileSpecs').textContent= formatBytes(state.file.size) +
    (m?' · '+formatTime(m.duration)+' · '+m.width+' × '+m.height+(m.videoCodec?' · '+String(m.videoCodec).toUpperCase():''):'');
  $('editorTitle').textContent=state.file.name;
  updateBusy();
}
function clearFile(){
  state.sequence++;
  const video=$('videoPreview');
  video.pause();
  video.removeAttribute('src');video.load();
  if(state.url){URL.revokeObjectURL(state.url);state.url=null;}
  state.file=null;state.metadata=null;state.range={start:0,end:0};
  $('fileInput').value='';
  resetDownload();
  updateFileView();
  $('editorTitle').textContent=t('editorTitle');
  updateBusy();
}
async function addFile(file){
  if(state.busy||state.loading||!file)return;
  clearFile();
  const session=state.sequence;
  state.loading=true;updateBusy();drawTools();drawSettings();
  status(t('isLoading'));
  try{
    if(!file.size||file.size>MAX_FILE_SIZE)throw new Error('file-too-large');
    const {inspectVideo}=await getEngine();
    const meta=await inspectVideo(file);
    if(session!==state.sequence)return;
    state.file=file;state.metadata=meta;state.range={start:0,end:meta.duration};
    state.url=URL.createObjectURL(file);
    $('videoPreview').src=state.url;
    $('videoPreview').load();
    updateTimeRange();
    updateFileView();
    status(t('sourceReady'),'success');
  }catch(err){
    if(session===state.sequence){
      clearFile();
      const key=err?.message==='file-too-large'?'fileTooLarge':err?.message==='invalid-file'?'invalidFile':
        err?.message==='video-missing'?'videoMissing':'unsupported';
      status(t(key),'error');
    }
  }finally{
    state.loading=false;drawTools();drawSettings();updateBusy();
  }
}
function onRangeInput(name){
  if(!state.metadata||state.busy||state.loading)return;
  const value=Number($(name+'Range').value);
  const previous=state.range;
  const next= name==='start'?clampRange(value,previous.end,state.metadata.duration):
    clampRange(previous.start,value,state.metadata.duration);
  state.range=next;
  $('videoPreview').pause();
  if(Number.isFinite(value)) {
    try{$('videoPreview').currentTime=Math.min(state.metadata.duration,Math.max(0,value));}catch{}
  }
  updateTimeRange();
  resetDownload();
}
function displayProgress(fraction){
  const n=Math.min(99,Math.max(0,Math.round(Number(fraction)*100)||0));
  $('progressBar').value=n;
  $('progressValue').textContent=n+'%';
}
async function startJob(){
  if(state.busy||state.loading||!state.file||!state.metadata)return;
  if(state.tool==='gif'&&state.range.end-state.range.start>8.02){status(t('gifLimit'),'error');return;}
  state.busy=true;
  const jobId=state.sequence;
  const abort=new AbortController();state.abortController=abort;
  const file=state.file,meta=state.metadata,tool=state.tool;
  const range={...state.range},settings={...state.settings};
  resetDownload();
  $('progressBox').hidden=false;
  $('progressLabel').textContent=t('processing');
  status(t(tool==='gif'?'createdGif':'working'));
  updateBusy();drawTools();drawSettings();
  try{
    const options={file,tool,metadata:meta,range,settings,signal:abort.signal,
      onProgress:displayProgress,
      onConversion:conversion=>{
        state.activeConversion=conversion;
        if(conversion&&abort.signal.aborted)void conversion.cancel();
      }};
    const {makeGif,convertVideo}=await getEngine();
    const result=tool==='gif'?await makeGif({...options,video:$('videoPreview')}):await convertVideo(options);
    if(abort.signal.aborted||jobId!==state.sequence)throw new Error('cancelled');
    state.outputUrl=URL.createObjectURL(result.blob);
    $('download').href=state.outputUrl;
    $('download').download=result.filename;
    $('download').hidden=false;
    $('progressBar').value=100;$('progressValue').textContent='100%';
    $('outputSummary').textContent=result.filename;
    const wasSmaller=result.blob.size<file.size;
    $('outputHelp').textContent=formatBytes(result.blob.size)+
      (tool==='compress'?(' · '+(wasSmaller?'-':' +')+Math.abs(Math.round((result.blob.size/file.size-1)*100))+'%'):'');
    status(t('resultReady'),'success');
  }catch(err){
    if(err?.message==='cancelled'||abort.signal.aborted)status(t('cancelled'));
    else{
      const key=err?.message==='invalid-range'?'clipInvalid':err?.message==='gif-too-long'?'gifLimit':
        err?.message==='gif-unavailable'?'gifUnavailable':err?.message==='audio-missing'?'audioMissing':
        err?.message==='video-missing'?'videoMissing':err?.message==='codec-unsupported'?'codecUnsupported':'conversionFailed';
      status(t(key),'error');
    }
    $('progressBox').hidden=true;
  }finally{
    state.busy=false;state.activeConversion=null;state.abortController=null;
    drawTools();drawSettings();updateBusy();
    if(state.outputUrl){
      const filename=$('download').download;
      $('outputSummary').textContent=filename;
      // Preserve the result size after re-rendering the settings.
      $('download').hidden=false;
    }
  }
}
function cancelJob(){
  if(!state.busy)return;
  state.abortController?.abort();
  if(state.activeConversion)void state.activeConversion.cancel();
  $('cancelButton').disabled=true;
  status(t('cancelled'));
}
function bindEvents(){
  $('themeSwitch').addEventListener('click',()=>setTheme(state.theme==='dark'?'light':'dark'));
  $('langSwitch').addEventListener('click',()=>setLocale(state.locale==='tr'?'en':'tr'));
  $('chooseFile').addEventListener('click',()=>$('fileInput').click());
  $('changeFile').addEventListener('click',()=>$('fileInput').click());
  $('removeFile').addEventListener('click',()=>{if(!state.busy&&!state.loading){clearFile();status('');}});
  $('fileInput').addEventListener('change',event=>{void addFile(event.target.files?.[0]);});
  $('runButton').addEventListener('click',()=>{void startJob();});
  $('cancelButton').addEventListener('click',cancelJob);
  for(const name of ['start','end'])$(name+'Range').addEventListener('input',()=>onRangeInput(name));
  const zone=$('dropZone');
  zone.addEventListener('dragover',event=>{event.preventDefault();if(!state.busy&&!state.loading)zone.classList.add('is-over');});
  zone.addEventListener('dragleave',event=>{if(!zone.contains(event.relatedTarget))zone.classList.remove('is-over');});
  zone.addEventListener('drop',event=>{
    event.preventDefault();zone.classList.remove('is-over');
    if(!state.busy&&!state.loading)void addFile(event.dataTransfer?.files?.[0]);
  });
  window.addEventListener('pagehide',()=>{
    state.abortController?.abort();
    if(state.activeConversion)void state.activeConversion.cancel();
    if(state.url)URL.revokeObjectURL(state.url);
    if(state.outputUrl)URL.revokeObjectURL(state.outputUrl);
  });
}
function init(){
  bindEvents();
  setLocale(readSetting('clipforge-language')||'tr');
  setTheme(readSetting('clipforge-theme')||'light');
  updateFileView();updateBusy();
}
init();
