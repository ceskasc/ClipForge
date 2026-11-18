import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, L10N, formatTime, formatBytes, clampRange, safeBase } from '../src/i18n.js';
import { normalizeOptions, isAcceptedVideo, MAX_FILE_SIZE, GIF_MAX_SECONDS } from '../src/engine.js';

const metadata={duration:100,width:1920,height:1080,hasVideo:true,hasAudio:true};
const range={start:10,end:24};
const settings={format:'webm',audioFormat:'mp3',quality:'low',height:720,rotate:270,gifWidth:480,gifFps:8};

test('six distinct tools have complete bilingual labels',()=>{
 assert.equal(TOOLS.length,6);
 assert.equal(new Set(TOOLS.map(x=>x.id)).size,6);
 assert.deepEqual(TOOLS.map(x=>x.id),['trim','convert','compress','audio','gif','rotate']);
 for(const x of TOOLS)assert.ok(x.tr&&x.en&&x.descriptionTr&&x.descriptionEn);
 assert.deepEqual(Object.keys(L10N.tr).sort(),Object.keys(L10N.en).sort());
});

test('time, size and filename helpers normalize deterministically',()=>{
 assert.equal(formatTime(0),'00:00');
 assert.equal(formatTime(61.5),'01:01');
 assert.equal(formatTime(3661),'1:01:01');
 assert.equal(formatBytes(1048576),'1.0 MiB');
 assert.equal(safeBase('../../résumé clip.mp4'),'r-sum-clip');
});
test('clip ranges stay inside the media duration',()=>{
 const a=clampRange(-99,999,18);assert.deepEqual(a,{start:0,end:18});
 const b=clampRange(10,10,18);assert.equal(b.start,10);assert.ok(b.end-b.start>=.0999);
});
test('selected output formats apply to trim, rotate, convert and audio',()=>{
 assert.equal(normalizeOptions('trim',settings,range,metadata).format,'webm');
 assert.equal(normalizeOptions('rotate',settings,range,metadata).format,'webm');
 assert.equal(normalizeOptions('convert',settings,range,metadata).format,'webm');
 assert.equal(normalizeOptions('audio',settings,range,metadata).format,'mp3');
 assert.deepEqual(normalizeOptions('trim',settings,range,metadata).options.trim,{start:10,end:24});
 const rotation=normalizeOptions('rotate',settings,range,metadata).options.video;
 assert.equal(rotation.rotate,270);
 assert.equal(rotation.allowTransformationMetadata,false);
 assert.equal(normalizeOptions('compress',settings,range,metadata).options.video.height,720);
});
test('GIF duration is bounded; invalid formats do not pass',()=>{
 assert.equal(GIF_MAX_SECONDS,8);
 assert.throws(()=>normalizeOptions('gif',settings,{start:0,end:9},metadata),/gif-too-long/);
 assert.equal(isAcceptedVideo({name:'clip.MP4',size:123,type:''}),true);
 assert.equal(isAcceptedVideo({name:'document.pdf',size:123,type:'application/pdf'}),false);
 assert.equal(MAX_FILE_SIZE,180*1024*1024);
});
