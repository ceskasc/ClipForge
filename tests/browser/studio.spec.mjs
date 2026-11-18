import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';

const sample=resolve('tests/fixtures/sample.webm');
async function downloadedBytes(page) {
  const [download]=await Promise.all([
    page.waitForEvent('download',{timeout:20000}),
    page.locator('#download').click()
  ]);
  return new Uint8Array(await readFile(await download.path()));
}
async function upload(page){
  await page.goto('./');
  await page.locator('#fileInput').setInputFiles(sample);
  await expect(page.locator('#loadedView')).toBeVisible({timeout:30000});
  await expect(page.locator('#fileName')).toHaveText('sample.webm');
  await expect(page.locator('#fileSpecs')).toContainText('320 × 180');
}
test('desktop and mobile render the bilingual six-tool studio without overflow',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading',{level:1})).toContainText('sadeleşti');
  await expect(page.locator('.tool-card')).toHaveCount(6);
  await page.locator('#langSwitch').click();
  await expect(page.getByRole('heading',{level:1})).toContainText('simplified');
  await expect(page.locator('.tool-card')).toHaveCount(6);
  await page.locator('#themeSwitch').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#studio')).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
test('reads video metadata and exports an actual WebM conversion',async({page})=>{
  await upload(page);
  await expect(page.locator('#fileSpecs')).toContainText('00:02');
  await page.locator('.tool-card').nth(1).click();
  await page.locator('#opt-format').selectOption('webm');
  await page.locator('#runButton').click();
  await expect(page.locator('#download')).toBeVisible({timeout:90000});
  await expect(page.locator('#download')).toHaveAttribute('download',/\.webm$/);
  const bytes=await downloadedBytes(page);
  expect(bytes.byteLength).toBeGreaterThan(3000);
  expect(Array.from(bytes.slice(0,4))).toEqual([0x1a,0x45,0xdf,0xa3]);
});
test('extracts audio to a real MP3 file',async({page})=>{
  await upload(page);
  await page.locator('.tool-card').nth(3).click();
  await page.locator('#opt-audioFormat').selectOption('mp3');
  await page.locator('#runButton').click();
  await expect(page.locator('#download')).toBeVisible({timeout:90000});
  await expect(page.locator('#download')).toHaveAttribute('download',/\.mp3$/);
  const bytes=await downloadedBytes(page);
  expect(bytes.byteLength).toBeGreaterThan(1000);
  const startsWithId3=String.fromCharCode(...bytes.slice(0,3))==='ID3';
  const startsWithMpegSync=bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0;
  expect(startsWithId3||startsWithMpegSync).toBe(true);
});
test('exports a valid GIF with local video frames',async({page})=>{
  await upload(page);
  await page.waitForFunction(()=>document.querySelector('#videoPreview')?.readyState>=2,null,{timeout:20000});
  await page.locator('.tool-card').nth(4).click();
  await page.locator('#opt-gifWidth').selectOption('240');
  await page.locator('#opt-gifFps').selectOption('5');
  await page.locator('#runButton').click();
  await expect(page.locator('#download')).toBeVisible({timeout:90000});
  const bytes=await downloadedBytes(page);
  expect(bytes.byteLength).toBeGreaterThan(1000);
  const header=String.fromCharCode(...bytes.slice(0,6));
  expect(header).toBe('GIF89a');
});
