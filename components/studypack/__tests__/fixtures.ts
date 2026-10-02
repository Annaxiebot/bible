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
