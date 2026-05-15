import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { startAPI } from './api/rest.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'marketplace.db');

if (!existsSync(dbPath)) {
  console.log('Fresh deployment — seeding database...');
  execSync('npx tsx cli/cli.ts db-seed', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });
}

startAPI(Number(process.env.PORT) || 3099);
