export interface Segment {
  hour: number; // rząd siatki
  from: number; // pierwszy kwant segmentu (od północy)
  to: number; // pierwszy kwant poza segmentem
  first: boolean; // początek bloku — zaokrąglić lewe rogi
  last: boolean; // koniec bloku — zaokrąglić prawe rogi
}

// Blok [q, q+len) pocięty na fragmenty mieszczące się w pojedynczych rzędach.
// Blok startujący o :45 daje dwa segmenty w sąsiednich rzędach; zaokrąglone
// są tylko rogi skrajne, więc wizualnie czyta się jako jedna całość.
// Przycięcie do widocznego okna dzieje się tutaj — komponenty nie liczą geometrii.
export function segments(q: number, len: number, startH: number, endH: number): Segment[] {
  const a = q;
  const e = q + len;
  const out: Segment[] = [];
  for (let hour = startH; hour < endH; hour++) {
    const rs = hour * 4;
    const from = Math.max(a, rs);
    const to = Math.min(e, rs + 4);
    if (to <= from) continue;
    out.push({ hour, from, to, first: from === a, last: to === e });
  }
  return out;
}
