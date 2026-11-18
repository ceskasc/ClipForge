import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  testMatch:'*.spec.mjs',
  timeout:90000,
  expect:{timeout:15000},
  retries:0,
  workers:1,
  reporter:process.env.CI?[['github'],['list']]:[['list']],
  use:{baseURL:'http://127.0.0.1:5173/ClipForge/',trace:'retain-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{
    command:'npm run dev -- --port 5173 --strictPort',
    url:'http://127.0.0.1:5173/ClipForge/',
    reuseExistingServer:!process.env.CI,
    timeout:60000
  }
});
