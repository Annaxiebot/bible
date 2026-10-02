/**
 * signupSchema.ts — the study_signups contract shared by browser and tests · 报名表结构
 *
 * Pure module (no Supabase import) so Playwright specs can import the table
 * name and the row shape. Must match database/signups-schema.sql.
 */

export const SIGNUPS_TABLE = 'study_signups';
export const SIGNUP_LOCALE = 'zh';

export interface SignupInsert {
  pack_id: string;
  leader_id: string;   // the pack's owning leader (StudyPack.leaderId); RLS scopes reads to this uid
  pack_title: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_checkins: boolean;
  locale: string;
}
