import { describe, it, expect } from 'vitest';
import { BACKUP_KIND, backupFileName, buildBackup, readBackup } from '../packBackup';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

describe('packBackup', () => {
  it('one file holds every study and reads back to the same packs', () => {
    const text = buildBackup([pack, { ...pack, id: 'second' }], '2026-10-06T00:00:00.000Z');
    expect(JSON.parse(text).kind).toBe(BACKUP_KIND);
    expect(readBackup(JSON.parse(text))).toEqual([pack, { ...pack, id: 'second' }]);
  });

  it('an old single-pack export still restores', () => {
    expect(readBackup(JSON.parse(JSON.stringify(pack)))).toEqual([pack]);
  });

  it('anything else is refused', () => {
    expect(() => readBackup({ hello: 'world' })).toThrow();
    expect(() => readBackup(null)).toThrow();
    expect(() => readBackup({ kind: BACKUP_KIND })).toThrow();
  });

  it('names the file by date', () => {
    expect(backupFileName('2026-10-06')).toBe('scripturetolife-studies-2026-10-06.json');
  });
});
