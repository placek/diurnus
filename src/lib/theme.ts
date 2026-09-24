import type { Prefs } from './types';

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
