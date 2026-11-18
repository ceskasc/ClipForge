import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {L10N} from '../src/i18n.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const engine=readFileSync(new URL('../src/engine.js',import.meta.url),'utf8');

test('every referenced UI ID exists and IDs are unique',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const m of app.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),'Missing UI element: '+m[1]);
});
test('every HTML translation key exists in both locales',()=>{
  for(const m of html.matchAll(/data-i18n="([^"]+)"/g)){
    assert.ok(m[1] in L10N.tr,m[1]+' missing in Turkish');
    assert.ok(m[1] in L10N.en,m[1]+' missing in English');
  }
});
test('document processing remains local and accessibility is respected',()=>{
  assert.doesNotMatch(app,/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/i);
  assert.doesNotMatch(engine,/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/i);
  assert.match(html,/form-action 'none'/);
  assert.match(html,/worker-src 'self' blob:/);
  assert.match(html,/id="status"[^>]+aria-live="polite"/);
  assert.match(html,/id="fileInput"/);
  assert.match(css,/@media\(max-width:560px\)/);
  assert.match(css,/prefers-reduced-motion/);
});
