import { useReaderPreferences } from '../../services/readerPreferences';
import { readerStrings, ReaderStrings } from './readerStrings';

/** The reader's strings in the chosen interface language (re-renders on change, any tab). */
export function useReaderStrings(): ReaderStrings {
  return readerStrings(useReaderPreferences().uiLanguage);
}
