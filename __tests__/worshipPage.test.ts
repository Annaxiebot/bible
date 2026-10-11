// ADR-0022 step 1: one static worship page, links only (nothing embedded, no tracking), linked from the footer.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { WORSHIP_PAGE, WORSHIP_LABEL } from '../components/landing/landingStrings';

const root = path.resolve(__dirname, '..');
const html = readFileSync(path.join(root, 'public', WORSHIP_PAGE), 'utf-8');
const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);

describe('public/worship.html', () => {
  it('lists 赞美之泉, the Family Music Ministry playlist, CityAlight, the Gettys and Hillsong Worship as plain YouTube links without the si= share tracker', () => {
    expect(html).toContain('Family Music Ministry');
    expect(html).toContain('赞美之泉');
    const youtube = links.filter(h => h.includes('youtube.com'));
    expect(youtube).toEqual([
      'https://www.youtube.com/@streamofpraise',
      'https://www.youtube.com/playlist?list=PL3nVTQe5EB2vH1aKcPy7EX-g3wAk9tYwe',
      'https://www.youtube.com/@CityAlight',
      'https://www.youtube.com/@KeithandKristynGetty',
      'https://www.youtube.com/@HillsongWorship',
    ]);
    expect(html).not.toMatch(/[?&]si=/);
  });

  it('embeds nothing — no iframe, no script', () => {
    expect(html).not.toMatch(/<iframe|<script/i);
  });

  it('is titled with its footer label and links home', () => {
    expect(html).toContain(WORSHIP_LABEL.split(' · ')[0]);
    expect(links).toContain('/');
  });
});
