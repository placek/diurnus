import { occ } from './occupancy';
import { rel, shiftDay } from './time';
import type { Block, Status } from './types';

// Znaczenie kliknięcia bierze się z tego, KIEDY ono pada. To jest cały model
// interakcji aplikacji, więc mieszka w czystej funkcji, a nie w komponencie,
// który akurat odebrał zdarzenie.
export function statusFor(day: string, q: number, len: number, now: number): Status {
  const r = rel(day, q, q + len, now);
  return r === 'past' ? 'confirmed' : r === 'now' ? 'active' : 'planned';
}

/** Status docelowy przy akceptacji istniejącej sugestii lub planu. */
export const acceptTarget = (b: Block, now: number): Status =>
  statusFor(b.day, b.q, b.len, now);

export function newBlock(
  day: string,
  q: number,
  len: number,
  cat: string,
  status: Status,
  created: number,
  makeId: () => string,
): Block {
  return { id: makeId(), day, q, len, cat, title: '', status, created };
}

// Potwierdzone bloki sprzed tygodnia wracają jako sugestie. Pomijane są sloty
// zajęte oraz te, w których użytkownik już tę sugestię odrzucił — inaczej
// odrzucenie nie trzymałoby się dłużej niż do następnego kliknięcia.
export function suggestionsFromLastWeek(
  blocks: readonly Block[],
  day: string,
  q0: number,
  q1: number,
  created: number,
  makeId: (i: number) => string,
): Block[] {
  const src = shiftDay(day, -7);
  const source = blocks.filter((b) => b.day === src && b.status === 'confirmed');
  if (!source.length) return [];

  const taken = occ(blocks, day);
  const discarded = blocks.filter((b) => b.day === day && b.status === 'discarded');
  const out: Block[] = [];

  for (const s of source) {
    if (s.q < q0 || s.q + s.len > q1) continue;
    if (discarded.some((d) => d.q === s.q && d.cat === s.cat)) continue;

    let free = true;
    for (let i = s.q; i < s.q + s.len; i++) if (taken[i]) free = false;
    if (!free) continue;

    const nb: Block = {
      id: makeId(out.length),
      day,
      q: s.q,
      len: s.len,
      cat: s.cat,
      title: s.title,
      status: 'suggested',
      created,
    };
    out.push(nb);
    // Nowa sugestia od razu zajmuje miejsce, żeby kolejna nie weszła na nią.
    for (let i = nb.q; i < nb.q + nb.len; i++) taken[i] = nb;
  }
  return out;
}
