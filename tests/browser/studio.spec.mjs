import {test,expect} from '@playwright/test';
import {resolve} from 'node:path';

const sample=resolve('tests/fixtures/sample.webm');
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
  const size=await page.locator('#download').evaluate(async(el)=>{
    const res=await fetch(el.href);
    return (await res.arrayBuffer()).byteLength;
  });
  expect(size).toBeGreaterThan(3000);
});
test('extracts audio to a real MP3 file',async({page})=>{
  await upload(page);
  await page.locator('.tool-card').nth(3).click();
  await page.locator('#opt-audioFormat').selectOption('mp3');
  await page.locator('#runButton').click();
  await expect(page.locator('#download')).toBeVisible({timeout:90000});
  await expect(page.locator('#download')).toHaveAttribute('download',/\.mp3$/);
  const bytes=await page.locator('#download').evaluate(async(el)=>Array.from(new Uint8Array(await(await fetch(el.href)).arrayBuffer()).slice(0,16)));
  expect(bytes.length).toBeGreaterThan(2);
  expect(bytes.some(b=>b!==0)).toBe(true);
});
test('exports a valid GIF with local video frames',async({page})=>{
  await upload(page);
  await page.waitForFunction(()=>document.querySelector('#videoPreview')?.readyState>=2,null,{timeout:20000});
  await page.locator('.tool-card').nth(4).click();
  await page.locator('#opt-gifWidth').selectOption('240');
  await page.locator('#opt-gifFps').selectOption('5');
  await page.locator('#runButton').click();
  await expect(page.locator('#download')).toBeVisible({timeout:90000});
  const header=await page.locator('#download').evaluate(async(el)=>{
    const array=new Uint8Array(await(await fetch(el.href)).arrayBuffer());
    return String.fromCharCode(...array.slice(0,6));
  });
  expect(header).toBe('GIF89a');
});
