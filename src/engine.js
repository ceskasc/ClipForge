import {
  Input, ALL_FORMATS, BlobSource, Conversion, Output, BufferTarget,
  Mp4OutputFormat, WebMOutputFormat, Mp3OutputFormat, WavOutputFormat,
  Quality, canEncodeAudio
} from 'mediabunny';
import { registerMp3Encoder } from '@mediabunny/mp3-encoder';
import { safeBase, clampRange } from './i18n.js';

export const MAX_FILE_SIZE = 180 * 1024 * 1024;
export const GIF_MAX_SECONDS = 8;
const MAX_GIF_WIDTH = 480;
let mp3Ready = false;

export function isAcceptedVideo(file) {
  return Boolean(file && file.size > 0 &&
    (/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name) ||
    ['video/mp4','video/quicktime','video/webm','video/x-matroska','video/x-msvideo'].includes(file.type)));
}
function makeInput(file) {
  return new Input({ source:new BlobSource(file), formats:ALL_FORMATS });
}
export async function inspectVideo(file) {
  if (!isAcceptedVideo(file)) throw new Error('invalid-file');
  if (file.size > MAX_FILE_SIZE) throw new Error('file-too-large');
  const input = makeInput(file);
  try {
    if (!(await input.canRead())) throw new Error('unsupported-input');
    const [video,audio]=await Promise.all([input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack()]);
    if (!video) throw new Error('video-missing');
    const approximate = await input.getDurationFromMetadata();
    const duration = approximate ?? await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 4 * 3600) throw new Error('unsupported-input');
    return {
      duration,
      width:await video.getDisplayWidth(),
      height:await video.getDisplayHeight(),
      videoCodec:await video.getCodec(),
      audioCodec:audio?await audio.getCodec():null,
      hasVideo:true,hasAudio:Boolean(audio)
    };
  } catch(e) {
    if(e?.message==='video-missing'||e?.message==='invalid-file'||e?.message==='file-too-large'||e?.message==='unsupported-input')throw e;
    throw new Error('unsupported-input',{cause:e});
  }
}
function fileFormat(mode) {
  if(mode==='webm')return {format:new WebMOutputFormat(),extension:'.webm',mime:'video/webm'};
  if(mode==='mp3')return {format:new Mp3OutputFormat(),extension:'.mp3',mime:'audio/mpeg'};
  if(mode==='wav')return {format:new WavOutputFormat(),extension:'.wav',mime:'audio/wav'};
  return {format:new Mp4OutputFormat(),extension:'.mp4',mime:'video/mp4'};
}
export function normalizeOptions(tool,settings,range,metadata){
  const duration=metadata.duration;
  const r=clampRange(range.start,range.end,duration);
  if((tool==='trim'||tool==='gif')&&r.end-r.start<.1-1e-5)throw new Error('invalid-range');
  if(tool==='gif'&&r.end-r.start>GIF_MAX_SECONDS+.02)throw new Error('gif-too-long');
  const format=tool==='audio'?(settings.audioFormat==='wav'?'wav':'mp3'):
    ['convert','trim','rotate','compress'].includes(tool)?(settings.format==='webm'?'webm':'mp4'):'mp4';
  const opts={tracks:'primary'};
  if(tool==='trim') {
    if(r.start>.001||r.end<duration-.001)opts.trim={...(r.start>.001?{start:r.start}:{}),...(r.end<duration-.001?{end:r.end}:{})};
  } else if(tool==='compress'){
    opts.video={quality:new Quality(settings.quality==='high'?'high':settings.quality==='medium'?'medium':'low')};
    const maxHeight=Number(settings.height);
    if(Number.isFinite(maxHeight)&&maxHeight>0&&maxHeight<metadata.height)opts.video.height=maxHeight;
    opts.audio={quality:new Quality('medium')};
  } else if(tool==='rotate'){
    opts.video={rotate:[90,180,270].includes(Number(settings.rotate))?Number(settings.rotate):90,allowTransformationMetadata:false};
  } else if(tool==='audio'){
    opts.video={discard:true};
    opts.audio={codec:format==='mp3'?'mp3':'pcm-s16'};
    if(r.start>.001||r.end<duration-.001)opts.trim={...(r.start>.001?{start:r.start}:{}),...(r.end<duration-.001?{end:r.end}:{})};
  }
  return {format,options:opts,range:r};
}
export async function convertVideo({file,tool,settings,range,metadata,onProgress=()=>{},onConversion=()=>{}}){
  if(tool==='gif')throw new Error('unsupported-operation');
  if(!metadata.hasVideo)throw new Error('video-missing');
  if(tool==='audio'&&!metadata.hasAudio)throw new Error('audio-missing');
  const config=normalizeOptions(tool,settings,range,metadata);
  if(config.format==='mp3'&&!mp3Ready){
    if(!(await canEncodeAudio('mp3')))registerMp3Encoder();
    mp3Ready=true;
  }
  const target=new BufferTarget();
  const fmt=fileFormat(config.format);
  const input=makeInput(file);
  const output=new Output({format:fmt.format,target});
  let conversion;
  try {
    conversion=await Conversion.init({input,output,...config.options});
    onConversion(conversion);
    if(!conversion.isValid || !conversion.utilizedTracks.some(t=>t.type=== (tool==='audio'?'audio':'video')))throw new Error('codec-unsupported');
    if(conversion.discardedTracks.some(t=>t.reason!=='discarded_by_user'&&
        (t.track.type==='audio'&&metadata.hasAudio)))throw new Error('codec-unsupported');
    conversion.onProgress=(p)=>onProgress(Math.max(0,Math.min(.99,Number(p)||0)));
    await conversion.execute();
    if(!target.buffer||target.buffer.byteLength===0)throw new Error('empty-output');
    onProgress(1);
    const suffix=tool==='trim'?'trimmed':tool==='compress'?'smaller':tool==='rotate'?'rotated':tool==='audio'?'audio':'converted';
    return {blob:new Blob([target.buffer],{type:fmt.mime}),filename:safeBase(file.name)+'-'+suffix+fmt.extension};
  } catch(e){
    if(e?.name==='ConversionCanceledError'||conversion?.state==='canceled')throw new Error('cancelled',{cause:e});
    if(['codec-unsupported','audio-missing','empty-output','invalid-range'].includes(e?.message))throw e;
    throw new Error('conversion-failed',{cause:e});
  } finally { onConversion(null); }
}
function awaitVideoEvent(video,name,timeoutMs=9000){
  return new Promise((resolve,reject)=>{
    let timeout;
    function cleanup(){clearTimeout(timeout);video.removeEventListener(name,onSuccess);video.removeEventListener('error',onError);}
    function onSuccess(){cleanup();resolve();}
    function onError(){cleanup();reject(new Error('gif-unavailable'));}
    video.addEventListener(name,onSuccess,{once:true});
    video.addEventListener('error',onError,{once:true});
    timeout=setTimeout(()=>{cleanup();reject(new Error('gif-unavailable'));},timeoutMs);
  });
}
async function seek(video,time){
  if(Math.abs(video.currentTime-time)<.035&&video.readyState>=2)return;
  const pending=awaitVideoEvent(video,'seeked');
  video.currentTime=time;
  await pending;
}
export async function makeGif({video,metadata,range,settings,file,onProgress=()=>{},signal}){
  if(!metadata.hasVideo||!video||video.readyState<2||!Number.isFinite(video.duration))throw new Error('gif-unavailable');
  const r=clampRange(range.start,range.end,metadata.duration);
  const seconds=r.end-r.start;
  if(seconds<.1)throw new Error('invalid-range');
  if(seconds>GIF_MAX_SECONDS+.02)throw new Error('gif-too-long');
  const fps=Number(settings.gifFps)===5?5:8;
  const outWidth=Math.min(MAX_GIF_WIDTH,Math.max(180,Number(settings.gifWidth)||360),metadata.width||360);
  const outHeight=Math.max(2,Math.round(outWidth/(metadata.width/metadata.height)));
  if(outWidth*outHeight>480*850)throw new Error('gif-unavailable');
  const frameCount=Math.max(1,Math.ceil(seconds*fps));
  const {GIFEncoder,quantize,applyPalette}=await import('gifenc');
  const gif=GIFEncoder();
  const canvas=document.createElement('canvas');canvas.width=Math.round(outWidth);canvas.height=outHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('gif-unavailable');
  const previousTime=video.currentTime,wasPaused=video.paused;
  video.pause();
  try{
    for(let i=0;i<frameCount;i++){
      if(signal?.aborted)throw new Error('cancelled');
      const current=Math.min(metadata.duration-.025,r.start+i/fps);
      await seek(video,Math.max(0,current));
      if(video.readyState<2)throw new Error('gif-unavailable');
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const image=ctx.getImageData(0,0,canvas.width,canvas.height);
      const palette=quantize(image.data,128,{format:'rgb444'});
      const indexed=applyPalette(image.data,palette,'rgb444');
      gif.writeFrame(indexed,canvas.width,canvas.height,{palette,delay:Math.round(1000/fps),repeat:0});
      onProgress((i+1)/frameCount);
      if(i%4===3)await new Promise(resolve=>setTimeout(resolve,0));
    }
    gif.finish();
    return {blob:new Blob([gif.bytes()],{type:'image/gif'}),filename:safeBase(file.name)+'-clip.gif'};
  } finally{
    try {video.currentTime=Math.min(metadata.duration-.03,Math.max(0,previousTime));if(!wasPaused&&!signal?.aborted)void video.play().catch(()=>{});}catch{}
  }
}
