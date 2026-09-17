import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (!existsSync('.dev.vars')) {
  writeFileSync('.dev.vars', `ENVIRONMENT=development\nAPP_URL=http://127.0.0.1:5173\nBETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}\n`);
  console.log('Created local development settings. Local email links appear in Account → Development inbox.');
}
