/**
 * liveSql.ts — run SQL against the linked project for the LIVE_DB=1 probes · 真实数据库探针
 *
 * Opt-in only: LIVE is true when LIVE_DB=1 and both the access token
 * (~/.supabase/access-token) and the linked project ref
 * (supabase/.temp/project-ref, gitignored) exist. Uses Node's https, not
 * fetch: the vitest setup replaces global fetch with a mock.
 * TODO(R3): summaryVerses.live.test.ts and personalSync.live.test.ts carry
 * private copies of runSql; move them onto this helper in a refactor session.
 */
import { readFileSync, existsSync } from 'fs';
import os from 'os';
import https from 'https';
import path from 'path';

const TOKEN_FILE = path.join(os.homedir(), '.supabase', 'access-token');
const PROJECT_REF_FILE = path.resolve(__dirname, '../../supabase/.temp/project-ref');
export const LIVE = process.env.LIVE_DB === '1' && existsSync(TOKEN_FILE) && existsSync(PROJECT_REF_FILE);
const queryUrl = () => `https://api.supabase.com/v1/projects/${readFileSync(PROJECT_REF_FILE, 'utf8').trim()}/database/query`;

export function runSql(query: string): Promise<{ status: number; text: string }> {
  const body = JSON.stringify({ query });
  return new Promise((resolve, reject) => {
    const req = https.request(queryUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readFileSync(TOKEN_FILE, 'utf8').trim()}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
    });
    req.on('error', reject);
    req.end(body);
  });
}
