/**
 * CitedVerses.tsx — "引用经文 · Verses cited" under the TV answer · 引用经文
 *
 * On a TV nobody hovers, so the room never sees a cross-reference's text.
 * Under the overlay's latest answer this block prints up to MAX_CITED_REFS
 * valid references from outside the pack (citations.ts), 和合本 then BSB,
 * up to MAX_CITED_VERSES verses each then "…". Muted and set at the TV
 * verse floor (TYPE_SCALE.verse, ADR-0003 §15) — never larger than the
 * answer, never smaller than the floor. It renders inside the block
 * useAnswerFit measures, so the answer shrinks to make room for it.
 */
import React from 'react';
import { CitedRef } from './citations';
import { TYPE_SCALE } from './principles';
import { VERSES_CITED_HEADING } from './tvHints';

const citedStyle: React.CSSProperties = { fontSize: TYPE_SCALE.verse, lineHeight: 1.35 };
const MORE_MARK = '…';

const CitedVerses: React.FC<{ cited: CitedRef[] }> = ({ cited }) => {
  if (cited.length === 0) return null;
  return (
    <section className="mt-[2vh] pt-[1.5vh] border-t border-stl-border text-stl-text-2" style={citedStyle} data-testid="cited-verses">
      <h3 className="text-stl-text-3 font-semibold mb-[0.5vh]">{VERSES_CITED_HEADING}</h3>
      {cited.map(c => (
        <div key={c.label} className="mb-[1vh] last:mb-0" data-testid="cited-ref">
          <p className="text-stl-gold" data-testid="cited-ref-label">{c.label}</p>
          {c.verses.map(v => (
            <p key={v.num} data-testid="cited-verse">
              <span className="text-stl-text-3 mr-2">{v.num}</span>
              {v.cuv}
              {v.en && <span className="block">{v.en}</span>}
            </p>
          ))}
          {c.more && <p data-testid="cited-more">{MORE_MARK}</p>}
        </div>
      ))}
    </section>
  );
};

export default CitedVerses;
