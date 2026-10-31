/**
 * Shared test fixture paths/ids for the studypack suites (R3: the sample
 * pack's path and id live here once, derived from the canonical constants).
 */
import path from 'path';
import { SAMPLE_PACK_ID } from '../../landing/landingRoute';

export { SAMPLE_PACK_ID };
export const TEST_PACK_PATH = path.resolve(
  __dirname,
  `../../../public/packs/${SAMPLE_PACK_ID}.json`
);

/**
 * The sample pack as it was when the AI request hashes were recorded (ADR-0015
 * "match master" suites). Those suites pin how a request is BUILT; the sample's
 * teaching text has since been corrected (2026-10 review), which changes the
 * request text but not its construction, so they read this frozen copy.
 */
export const REQUEST_HASH_PACK_PATH = path.resolve(__dirname, 'requestHashPack.json');
