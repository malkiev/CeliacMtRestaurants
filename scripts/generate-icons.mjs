import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Keep install icons identical to the SVG used by the header and browser tab.
const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: true });
  }
} finally {
  await browser.close();
}
