import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

if (existsSync('.env'))
  for (const [key, value] of Object.entries(parse(readFileSync('.env')))) {
    if (!process.env[key]) process.env[key] = value;
  }
export const dataDir = path.resolve(process.env.DATA_DIR || '.local/app');
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
export const switchUrl = process.env.SWITCH_URL || 'http://127.0.0.1:8000';
export const baseUrl = process.env.APP_BASE_URL || 'http://localhost:4173';
