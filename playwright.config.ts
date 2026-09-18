import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: 'http://127.0.0.1:5199',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    screenshot: 'only-on-failure',
  },
  globalSetup: './tests/browser-setup.ts',
});
