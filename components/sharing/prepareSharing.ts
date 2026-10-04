/**
 * prepareSharing.ts — previous pack → anonymised material → AI draft → section · 生成上周分享
 *
 * ADR-0008 pipeline:
 * 1. loadSharingMaterial (RLS reads as the leader; scrubbed; no identifiers).
 * 2. No sign-ups and no shared answers → SharingError('nothing').
 *    No shared answers → the section from practice counts only: NO AI call.
 * 3. Otherwise one streamed completion, role 'sharing' (aiTransport: the
 *    proxy picks the model and counts the quota). A reply that is not valid
 *    JSON, or does not validate, gets ONE fresh retry; a second failure is
 *    SharingError('invalid-reply'). AI transport failures keep askAIErrors'
 *    bilingual line (quota / no-credit / sign in) as SharingError('ai').
 * A cancel (signal) throws an AbortError the caller ignores.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PackSection, StudyPack } from '../studypack/packTypes';
import { packContentLanguage } from '../studypack/packTypes';
import { streamChatCompletionDetailed, AIRequestMeta } from '../studypack/askAIStream';
import { asAskAIError } from '../studypack/askAIErrors';
import { extractJsonObject } from '../newstudy/generatedPack';
import { loadSharingMaterial, SharingMaterial } from './sharingData';
import { buildSharingRequestBody } from './sharingPrompt';
import { validateSharingReply, SharingDraft, SharingError } from './sharingReply';
import { sharingSection } from './sharingSection';
import { SH_ERR_LOAD, SH_ERR_NOTHING, SH_ERR_INVALID } from './sharingStrings';

/** Quota role on the hosted proxy + X-Title for an own key (ASCII only). */
const SHARING_REQUEST: AIRequestMeta = { role: 'sharing', title: 'Scripture to Life - Last week sharing' };
/** Attempts at a valid reply: the first plus one retry. */
export const SHARING_ATTEMPTS = 2;

export interface PreparedSharing {
  section: PackSection;
  /** False on the zero-answer path (counts only, no AI call). */
  aiUsed: boolean;
}

function cancelled(): Error {
  return new DOMException('Sharing cancelled', 'AbortError');
}

async function loadOrThrow(client: SupabaseClient, previous: StudyPack, uid: string): Promise<SharingMaterial> {
  try {
    return await loadSharingMaterial(client, previous, uid);
  } catch (err) {
    // Rethrown typed, with the PostgREST message (leaderData's bilingual line) kept.
    throw new SharingError('load', `${SH_ERR_LOAD}: ${(err as Error).message}`);
  }
}

/** One completion → validated draft, or null when the reply did not parse / validate. AI failures throw SharingError('ai'). */
async function attempt(body: string, current: StudyPack, material: SharingMaterial, signal: AbortSignal): Promise<SharingDraft | null> {
  let text: string;
  try {
    text = (await streamChatCompletionDetailed(body, () => undefined, signal, SHARING_REQUEST)).text;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    // Typed: quota / no-credit / sign in / network keep askAIErrors' bilingual line.
    throw new SharingError('ai', asAskAIError(err, '').message);
  }
  if (signal.aborted) throw cancelled();
  try {
    return validateSharingReply(extractJsonObject(text), packContentLanguage(current), material.scrub);
  } catch {
    // Not silent: null makes the caller retry once and then throw SharingError('invalid-reply').
    return null;
  }
}

async function draftWithRetry(current: StudyPack, material: SharingMaterial, signal: AbortSignal): Promise<SharingDraft> {
  const body = buildSharingRequestBody({ current, material });
  for (let i = 0; i < SHARING_ATTEMPTS; i++) {
    const draft = await attempt(body, current, material, signal);
    if (draft) return draft;
  }
  throw new SharingError('invalid-reply', SH_ERR_INVALID);
}

export interface SharingRequest {
  client: SupabaseClient;
  uid: string;
  current: StudyPack;
  previous: StudyPack;
  signal: AbortSignal;
  /** 'drafting' once the material is loaded and the AI call starts. */
  onDrafting?: () => void;
}

export async function prepareSharing({ client, uid, current, previous, signal, onDrafting }: SharingRequest): Promise<PreparedSharing> {
  const material = await loadOrThrow(client, previous, uid);
  if (signal.aborted) throw cancelled();
  if (material.sharedAnswers.length === 0) {
    if (material.practices.length === 0) throw new SharingError('nothing', SH_ERR_NOTHING);
    return { section: sharingSection(null, material.practices), aiUsed: false };
  }
  onDrafting?.();
  const draft = await draftWithRetry(current, material, signal);
  return { section: sharingSection(draft, material.practices), aiUsed: true };
}
