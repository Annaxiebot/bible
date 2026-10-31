/**
 * email-signin-config.ts — turn on email sign-in on the live Supabase project · 开启邮箱登录 (ADR-0020)
 *
 * Node 24 runs this TypeScript file directly:
 *   node scripts/supabase/email-signin-config.ts           # dry run: read the live auth config, print what would change
 *   node scripts/supabase/email-signin-config.ts --apply   # apply it: one PATCH of the auth config
 *
 * What it sets is supabase/auth/emailSignIn.ts planEmailSignInConfig (tested):
 * the email provider on, the link + 6-digit code template (Chinese first) for
 * new and known addresses, 15-minute single-use codes, site_url and the
 * redirect list (additive). It never touches the Google provider, SMTP or
 * rate limits. Additive and safe before the site deploys: the live site has
 * no email button, so nothing changes for it.
 *
 * Token: ~/.supabase/access-token (Management API; never printed). Project:
 * SUPABASE_PROJECT_REF, else supabase/.temp/project-ref (written by
 * `supabase link`; run from the main checkout or set the variable). Only the
 * non-secret fields below are ever printed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planEmailSignInConfig, LINK_PLACEHOLDER, CODE_PLACEHOLDER } from '../../supabase/auth/emailSignIn.ts';
import type { AuthConfigFields } from '../../supabase/auth/emailSignIn.ts';

const API = 'https://api.supabase.com/v1/projects';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOKEN_FILE = path.join(homedir(), '.supabase', 'access-token');
const REF_FILE = path.join(REPO, 'supabase', '.temp', 'project-ref');

/** Read, compared and printed; nothing else of the config ever reaches the terminal. */
const SHOWN = [
  'site_url', 'uri_allow_list', 'external_email_enabled', 'mailer_otp_exp', 'mailer_otp_length',
  'mailer_subjects_magic_link', 'mailer_subjects_confirmation', 'rate_limit_email_sent',
] as const;

function fail(message: string): never {
  process.stderr.write(`✗ ${message}\n`);
  process.exit(1);
}

function projectRef(): string {
  const fromEnv = process.env.SUPABASE_PROJECT_REF?.trim();
  if (fromEnv) return fromEnv;
  if (!existsSync(REF_FILE)) fail(`No project: set SUPABASE_PROJECT_REF or run from a checkout with ${REF_FILE}`);
  return readFileSync(REF_FILE, 'utf8').trim();
}

async function call(method: 'GET' | 'PATCH', ref: string, body?: object): Promise<Record<string, unknown>> {
  if (!existsSync(TOKEN_FILE)) fail(`Supabase access token not found: ${TOKEN_FILE}`);
  const token = readFileSync(TOKEN_FILE, 'utf8').trim();
  const res = await fetch(`${API}/${ref}/config/auth`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) fail(`${method} config/auth → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}

function report(current: Record<string, unknown>, plan: Record<string, unknown>): void {
  for (const key of SHOWN) {
    const before = JSON.stringify(current[key] ?? null);
    const after = key in plan ? JSON.stringify(plan[key]) : before;
    console.log(`${before === after ? '  ' : '→ '}${key}: ${before}${before === after ? '' : `  ⇒  ${after}`}`);
  }
  const html = String(plan.mailer_templates_magic_link_content);
  console.log(`→ email templates (magic link + confirmation): ${html.length} chars, link ${html.includes(LINK_PLACEHOLDER)}, code ${html.includes(CODE_PLACEHOLDER)}`);
  console.log(`  custom SMTP configured: ${current.smtp_host ? 'yes' : 'no — the default Supabase mailer (team addresses only, about 2 emails/hour)'}`);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const ref = projectRef();
  const current = await call('GET', ref);
  const plan = planEmailSignInConfig(current as AuthConfigFields);
  console.log(`Project ${ref} — ${apply ? 'APPLYING' : 'dry run (add --apply to change it)'}`);
  report(current, plan);
  if (!apply) return;
  const after = await call('PATCH', ref, plan);
  const ok = after.external_email_enabled === true && after.mailer_otp_exp === plan.mailer_otp_exp
    && String(after.mailer_templates_magic_link_content ?? '').includes(CODE_PLACEHOLDER);
  if (!ok) fail('PATCH returned, but the config read back does not match the plan');
  console.log('✓ Email sign-in configured');
}

main().catch(err => fail(err instanceof Error ? err.message : String(err)));
