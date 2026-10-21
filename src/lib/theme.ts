import type { Prefs, State, Theme } from './types';

export const THEMES: readonly Theme[] = ['auto', 'light', 'dark'];
export const isTheme = (x: unknown): x is Theme => (THEMES as readonly unknown[]).includes(x);

/** Motyw w użyciu: wspólny z ustawień, a dopóki go nie ma — ten z przeglądarki. */
export const themeOf = (s: Pick<State, 'theme'>, prefs: Pick<Prefs, 'theme'>): Theme =>
  s.theme ?? prefs.theme;

export const THEME_LABEL: Record<Prefs['theme'], string> = {
  auto: 'systemowy',
  dark: 'ciemny',
  light: 'jasny',
};

const NEXT: Record<Prefs['theme'], Prefs['theme']> = {
  auto: 'dark',
  dark: 'light',
  light: 'auto',
};

export const nextTheme = (t: Prefs['theme']): Prefs['theme'] => NEXT[t] ?? 'auto';

/** Kolor paska adresu na mobile — musi nadążać za faktycznie użytym motywem. */
export const themeColor = (t: Prefs['theme'], systemDark: boolean) =>
  t === 'dark' || (t === 'auto' && systemDark) ? '#282828' : '#fbf1c7';
