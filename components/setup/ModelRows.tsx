/**
 * ModelRows.tsx — the "模型 Models" block of the saved-key setup state · 模型设置
 *
 * Three rows, one per configurable role (services/aiDefaults readers/writers):
 * 问一问 Ask AI, 新建查经 Pack generation, 备用 Fallbacks (comma-separated).
 * Each row is a text input prefilled with the current EFFECTIVE value and a
 * "推荐 Recommended" reset that writes the shipped default. Every keystroke
 * is stored (an emptied field clears back to the default; blur re-shows the
 * effective value), so there is no Save step. Senior type floors as the
 * rest of the dialog (ADR-0003 §15).
 */
import React, { useState } from 'react';
import {
  ASK_AI_MODEL, PACK_GENERATION_MODEL, ASK_AI_FALLBACK_MODELS,
  askAIModel, packGenerationModel, askAIFallbackModels,
  setAskAIModel, setPackGenerationModel, setAskAIFallbackModels, parseModelList,
} from '../../services/aiDefaults';
import {
  SETUP_MODELS_TITLE, SETUP_MODEL_ASK, SETUP_MODEL_PACK, SETUP_MODEL_FALLBACKS, SETUP_MODEL_RECOMMENDED,
  recommendedFor,
} from './setupStrings';

export type ModelRowId = 'ask' | 'pack' | 'fallbacks';

interface ModelRow {
  id: ModelRowId;
  label: string;
  /** Current effective value as row text (fallbacks joined by ", "). */
  read: () => string;
  write: (text: string) => void;
  recommended: string;
}

const LIST_SEPARATOR = ', ';

export const MODEL_ROWS: readonly ModelRow[] = [
  { id: 'ask', label: SETUP_MODEL_ASK, read: askAIModel, write: setAskAIModel, recommended: ASK_AI_MODEL },
  { id: 'pack', label: SETUP_MODEL_PACK, read: packGenerationModel, write: setPackGenerationModel, recommended: PACK_GENERATION_MODEL },
  {
    id: 'fallbacks',
    label: SETUP_MODEL_FALLBACKS,
    read: () => askAIFallbackModels().join(LIST_SEPARATOR),
    write: setAskAIFallbackModels,
    recommended: ASK_AI_FALLBACK_MODELS.join(LIST_SEPARATOR),
  },
];

/** True when the row's text means the shipped default (fallbacks compare as parsed lists). */
export function isRecommended(row: ModelRow, text: string): boolean {
  return parseModelList(text).join(LIST_SEPARATOR) === row.recommended;
}

type RowValues = Record<ModelRowId, string>;
const readAll = (): RowValues =>
  Object.fromEntries(MODEL_ROWS.map(r => [r.id, r.read()])) as RowValues;

export interface ModelRowsProps {
  /** Shared ADR-0003 §15 styles from the dialog (≥20px text, ≥48px targets). */
  textStyle: React.CSSProperties;
  controlStyle: React.CSSProperties;
  /** Called after any stored change so the dialog's Test uses the new Ask-AI model. */
  onChanged: () => void;
}

export const ModelRows: React.FC<ModelRowsProps> = ({ textStyle, controlStyle, onChanged }) => {
  const [values, setValues] = useState<RowValues>(readAll);

  const update = (row: ModelRow, text: string) => {
    row.write(text);
    setValues(v => ({ ...v, [row.id]: text }));
    onChanged();
  };

  return (
    <section data-testid="model-rows" className="flex flex-col gap-3">
      <h3 className="font-semibold text-slate-300" style={textStyle}>{SETUP_MODELS_TITLE}</h3>
      {MODEL_ROWS.map(row => (
        <label key={row.id} className="flex flex-col gap-1" data-testid={`model-row-${row.id}`}>
          <span className="text-slate-400" style={textStyle}>{row.label}</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={values[row.id]}
              onChange={e => update(row, e.target.value)}
              onBlur={() => setValues(v => ({ ...v, [row.id]: row.read() }))}
              autoComplete="off"
              spellCheck={false}
              aria-label={row.label}
              className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 text-slate-100 focus:border-amber-400 focus:outline-none"
              style={controlStyle}
            />
            <button
              type="button"
              onClick={() => update(row, row.recommended)}
              disabled={isRecommended(row, values[row.id])}
              aria-label={recommendedFor(row.label)}
              className="rounded-lg border border-slate-600 px-4 text-slate-300 hover:text-slate-100 disabled:opacity-40"
              style={controlStyle}
            >
              {SETUP_MODEL_RECOMMENDED}
            </button>
          </div>
        </label>
      ))}
    </section>
  );
};
