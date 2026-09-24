export type Layer = 'grid' | 'menu' | 'edit' | 'settings' | 'help';

export interface KeyContext {
  layer: Layer;
  /** kursor stoi w polu tekstowym */
  inInput: boolean;
  /** menu pokazuje drugi pierścień (podkategorie) */
  menuHasLevel: boolean;
  cursorVisible: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
}

export type KeyAction =
  | { type: 'undo' }
  | { type: 'close' }
  | { type: 'save' }
  | { type: 'move'; delta: number }
  | { type: 'moveBlock'; delta: number }
  | { type: 'digit'; n: number }
  | { type: 'act' }
  | { type: 'edit' }
  | { type: 'delete' }
  | { type: 'settings'; tab: 'cats' | 'day' }
  | { type: 'help' }
  | { type: 'menuPick'; n: number }
  | { type: 'menuParent' }
  | { type: 'menuBack' };

const MOVES: Record<string, number> = {
  ArrowLeft: -1, h: -1,
  ArrowRight: 1, l: 1,
  ArrowUp: -4, k: -4,
  ArrowDown: 4, j: 4,
};

// Shift+h daje 'H', więc wielka litera to ten sam kierunek. Caps Lock bez
// Shifta też daje wielką literę — wtedy nadal chodzi kursor, nie blok.
const direction = (key: string): number | undefined =>
  MOVES[key] ?? (key.length === 1 ? MOVES[key.toLowerCase()] : undefined);

const digit = (key: string) => (/^[1-9]$/.test(key) ? Number(key) : 0);

// Czysta funkcja klawisz + kontekst → akcja. Dzięki temu układ skrótów jest
// testowalny, a komponent tylko wysyła to, co dostanie.
export function keyAction(key: string, ctx: KeyContext): KeyAction | null {
  // W polu tekstowym działają wyłącznie Escape i Enter.
  if (ctx.inInput) {
    if (key === 'Escape') return { type: 'close' };
    if (key === 'Enter') return { type: 'save' };
    return null;
  }

  // Cofanie działa na każdej warstwie.
  if ((ctx.ctrl || ctx.meta) && key.toLowerCase() === 'z') return { type: 'undo' };
  if (ctx.ctrl || ctx.meta || ctx.alt) return null;

  if (key === 'Escape') return { type: 'close' };

  const n = digit(key);

  if (ctx.layer === 'menu') {
    if (n) return { type: 'menuPick', n };
    if (!ctx.menuHasLevel) return null;
    if (key === '0' || key === 'Enter') return { type: 'menuParent' };
    if (key === 'Backspace') return { type: 'menuBack' };
    return null;
  }

  // Ustawienia mają własne pola i przyciski — nie przechwytujemy im klawiszy.
  if (ctx.layer === 'settings') return null;

  if (ctx.layer === 'edit') {
    if (n) return { type: 'digit', n };
    if (key === 'Enter') return { type: 'save' };
    return null;
  }

  if (ctx.layer === 'help') {
    return key === 'Enter' || key === '?' ? { type: 'close' } : null;
  }

  // Shift przenosi blok spod kursora; bez widocznego kursora nie ma czego
  // przenosić, więc pierwszy wciśnięty klawisz tylko go pokazuje.
  const move = direction(key);
  if (move !== undefined) {
    return ctx.shift && ctx.cursorVisible
      ? { type: 'moveBlock', delta: move }
      : { type: 'move', delta: move };
  }
  if (n) return { type: 'digit', n };

  if ((key === 'Enter' || key === ' ') && ctx.cursorVisible) return { type: 'act' };

  const lower = key.toLowerCase();
  if (lower === 'e' && ctx.cursorVisible) return { type: 'edit' };
  if ((key === 'Delete' || key === 'Backspace') && ctx.cursorVisible) return { type: 'delete' };
  if (lower === 'c') return { type: 'settings', tab: 'cats' };
  if (lower === 'd') return { type: 'settings', tab: 'day' };
  if (key === '?') return { type: 'help' };
  return null;
}

/** Kursor nie wychodzi poza widoczne okno doby. */
export const clampCursor = (q: number, delta: number, q0: number, q1: number) =>
  Math.min(q1 - 1, Math.max(q0, q + delta));
