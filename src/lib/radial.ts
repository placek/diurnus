export interface RingItem {
  /** przesunięcie względem środka menu, w pikselach */
  dx: number;
  dy: number;
}

export interface RingLayout {
  r: number;
  /** środek menu po wsunięciu w widok */
  x: number;
  y: number;
  items: RingItem[];
}

const GAP = 52; // minimalny odstęp między środkami ikon
const MARGIN = 30;
// Z podpisami pod ikonami (podkategorie) pozycje potrzebują więcej miejsca:
// podpis jest szerszy od ikony i nie może najechać na sąsiada ani na środek.
const LABELED_GAP = 108;
const LABEL_H = 24;

// Promień rośnie z liczbą pozycji, żeby ikony nigdy na siebie nie zachodziły:
// obwód musi pomieścić `count` ikon co GAP pikseli. Minimum jest mniejsze na
// wąskich ekranach, gdzie duży pierścień nie zmieściłby się w widoku.
export function ringLayout(
  count: number,
  cx: number,
  cy: number,
  viewportW: number,
  viewportH: number,
  labeled = false,
): RingLayout {
  const min = labeled ? (viewportW < 420 ? 84 : 92) : viewportW < 420 ? 60 : 66;
  const r = Math.max(min, (count * (labeled ? LABELED_GAP : GAP)) / (2 * Math.PI));
  const m = r + MARGIN;
  // Podpis wisi pod ikoną, więc od dołu trzeba zostawić na niego miejsce.
  const below = labeled ? LABEL_H : 0;

  const items: RingItem[] = Array.from({ length: count }, (_, i) => {
    // Start u góry (−π/2), dalej zgodnie z ruchem wskazówek zegara.
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
  });

  return {
    r,
    x: Math.min(Math.max(cx, m), viewportW - m),
    y: Math.min(Math.max(cy, m + 8), viewportH - m - below),
    items,
  };
}
