// The one search box + match rule for long lists (R3): studies and the admin's leaders.
import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { filterByQuery, ListSearchBox, LIST_SEARCH_FROM } from '../ListSearch';
import { PACK_SEARCH_FROM } from '../PackListing';

const people = [{ name: 'Anna Xie', email: 'anna@example.com' }, { name: '王明', email: 'wang@example.org' }];
const text = (p: typeof people[number]) => `${p.name} ${p.email}`;

describe('ListSearch', () => {
  it('filterByQuery: case-insensitive contains over the given text; blank keeps all; Chinese works', () => {
    expect(filterByQuery(people, 'ANNA', text)).toEqual([people[0]]);
    expect(filterByQuery(people, 'example.org', text)).toEqual([people[1]]);
    expect(filterByQuery(people, '王', text)).toEqual([people[1]]);
    expect(filterByQuery(people, '   ', text)).toEqual(people);
    expect(filterByQuery(people, 'nobody', text)).toEqual([]);
  });

  it('the study list shares the threshold', () => {
    expect(PACK_SEARCH_FROM).toBe(LIST_SEARCH_FROM);
  });

  it('ListSearchBox: labelled by its placeholder, reports each change', () => {
    const Harness = () => {
      const [q, setQ] = useState('');
      return <><ListSearchBox value={q} onChange={setQ} label="搜索 Search" testId="box" /><output data-testid="q">{q}</output></>;
    };
    render(<Harness />);
    const box = screen.getByRole('searchbox', { name: '搜索 Search' });
    fireEvent.change(box, { target: { value: 'anna' } });
    expect(screen.getByTestId('q')).toHaveTextContent('anna');
  });
});
