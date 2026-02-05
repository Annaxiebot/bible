import { useState, useEffect, createContext, useContext } from 'react';
import { SeasonTheme, getSeasonTheme, applyThemeToDOM } from '../services/seasonTheme';

// Create a context so all components can access the theme
const SeasonThemeContext = createContext<SeasonTheme>(getSeasonTheme());

export const SeasonThemeProvider = SeasonThemeContext.Provider;

export function useSeasonTheme(): SeasonTheme {
  return useContext(SeasonThemeContext);
}

/**
 * Hook for the root component — initializes theme and applies CSS vars.
 * Returns the current theme. Call this once in App.tsx.
 */
export function useSeasonThemeInit(): SeasonTheme {
  const [theme] = useState<SeasonTheme>(() => getSeasonTheme());

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  return theme;
}
