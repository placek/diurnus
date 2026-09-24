import { normalize } from './model';
import type { Prefs, State } from './types';

const MAGIC = 'diurnus.backup';
/** Kopie pobrane przed zmianą nazwy projektu muszą nadal się wczytywać. */
const ACCEPTED = new Set([MAGIC, 'gridday.backup']);

// Przywrócenie kopii to nie pierwsze uruchomienie, więc ekran powitalny
// domyślnie się nie pokazuje.
const PREFS_DEFAULT: Prefs = { theme: 'auto', seenHelp: true, notify: false };

// Zegar jest parametrem, a nie Date.now() w środku, żeby wynik dał się
// porównać w teście.
export function bundleExport(state: State, prefs: Prefs, nowMs: number): string {
  return JSON.stringify(
    { magic: MAGIC, exported: new Date(nowMs).toISOString(), state, prefs },
    null,
    2,
  );
}

// Trzy tryby awarii mają osobne komunikaty: plik nie jest JSON-em (serwer
// oddał stronę logowania), jest JSON-em, ale nie kopią Diurnus, albo jest
// kopią bez bloków. Jeden ogólny komunikat zostawiałby użytkownika ze
// zgadywaniem, który plik wybrał.
export function bundleParse(text: string): { state: State; prefs: Prefs } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Plik nie jest poprawnym JSON-em');
  }

  const b = parsed as { magic?: string; state?: { blocks?: unknown }; prefs?: Partial<Prefs> };
  if (!b || typeof b !== 'object' || Array.isArray(b) || !ACCEPTED.has(b.magic ?? '')) {
    throw new Error('To nie jest kopia zapasowa Diurnus');
  }
  if (!b.state || !Array.isArray(b.state.blocks)) {
    throw new Error('Kopia nie zawiera bloków');
  }

  return {
    state: normalize(b.state),
    prefs: { ...PREFS_DEFAULT, ...(b.prefs ?? {}) },
  };
}
