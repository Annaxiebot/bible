import { describe, it, expect, vi } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SectionEditor from '../SectionEditor';
import { PackSection } from '../../studypack/packTypes';
import { NS_QUESTION_REMOVE } from '../newStudyStrings';

/** Minimal stateful host so removals re-render the list like the real editor. */
const Host: React.FC<{ initial: string[]; onChange?: (q: string[]) => void }> = ({ initial, onChange }) => {
  const [section, setSection] = useState<PackSection>({ kind: 'discussion', heading: '讨论 Discussion', questions: initial });
  return (
    <SectionEditor
      section={section}
      onPatch={patch => { setSection(s => ({ ...s, ...patch })); onChange?.(patch.questions ?? []); }}
    />
  );
};

describe('SectionEditor question list keys', () => {
  it('keeps the surviving textarea node when an earlier question is removed', () => {
    const onChange = vi.fn();
    render(<Host initial={['first', 'second']} onChange={onChange} />);
    const before = screen.getAllByRole('textbox');
    const secondNode = before[1];
    fireEvent.click(screen.getByLabelText(`${NS_QUESTION_REMOVE} 1`));
    const after = screen.getAllByRole('textbox');
    expect(after).toHaveLength(1);
    expect(after[0]).toHaveValue('second');
    // Stable keys: React must keep the second row's DOM node, not recycle the first.
    expect(after[0]).toBe(secondNode);
    expect(onChange).toHaveBeenCalledWith(['second']);
  });
});
