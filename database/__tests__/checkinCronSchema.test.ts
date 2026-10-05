/**
 * checkinCronSchema.test.ts — the automatic Tue/Thu/weekend schedule · 自动提醒排程
 *
 * Pins database/checkin-cron-schema.sql: six jobs (a PDT and a PST line per
 * kind, the edge function keeps only the 09:00 LA one), the body marks itself
 * scheduled, the trusted-caller header, secrets read from Vault (never
 * literals), the recent-sign-up window, and that app roles cannot call it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { CRON_SECRET_HEADER } from '../../supabase/functions/send-checkins/trust';

const sql = readFileSync(path.resolve(__dirname, '../checkin-cron-schema.sql'), 'utf8');
const code = sql.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');

describe('checkin-cron-schema.sql', () => {
  it('schedules Tue / Thu / Sat at 16:00 and 17:00 UTC (09:00 LA in PDT / PST)', () => {
    const jobs = [...code.matchAll(/cron\.schedule\('([^']+)', '([^']+)', \$\$SELECT public\.call_send_checkins\('(\w+)'\)\$\$\)/g)]
      .map(m => `${m[1]} ${m[2]} ${m[3]}`);
    expect(jobs.sort()).toEqual([
      'checkins-sat-pdt 0 16 * * 6 weekend', 'checkins-sat-pst 0 17 * * 6 weekend',
      'checkins-thu-pdt 0 16 * * 4 thu', 'checkins-thu-pst 0 17 * * 4 thu',
      'checkins-tue-pdt 0 16 * * 2 tue', 'checkins-tue-pst 0 17 * * 2 tue',
    ]);
  });

  it('calls send-checkins as a trusted, scheduled caller with secrets from Vault only', () => {
    expect(code).toContain("'scheduled', true");
    expect(code).toContain(`'${CRON_SECRET_HEADER}', cron_secret`);
    for (const name of ['checkin_project_url', 'checkin_anon_key', 'checkin_cron_secret']) {
      expect(code).toContain(`vault.decrypted_secrets WHERE name = '${name}'`);
    }
    expect(code).not.toMatch(/eyJhbGci|sb_secret_|supabase\.co/); // no key or URL literal outside comments
  });

  it('only recent, live, opted-in sign-ups pull their study in', () => {
    expect(code).toContain('window_days CONSTANT INTEGER := 8;');
    expect(code).toContain('s.replaced_at IS NULL AND s.unsubscribed_at IS NULL AND s.consent_checkins');
    expect(code).toContain('s.created_at > now() - make_interval(days => window_days)');
  });

  it('is not callable by app roles and rejects an unknown kind', () => {
    expect(code).toContain('REVOKE ALL ON FUNCTION public.call_send_checkins(TEXT) FROM PUBLIC, anon, authenticated;');
    expect(code).toContain("IF p_kind NOT IN ('tue', 'thu', 'weekend') THEN");
  });
});
