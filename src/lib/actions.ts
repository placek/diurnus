import { rel } from './time';
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

/**
 * Status bloku po przeniesieniu w czasie. Plan i wykonanie to deklaracje
 * użytkownika — zostają. Blok w toku jest stanem chwili: przeniesiony poza
 * TERAZ przestaje trwać, więc dostaje status wynikający z nowego czasu.
 */
export const movedStatus = (b: Block, q: number, now: number): Status =>
  b.status === 'active' ? statusFor(b.day, q, b.len, now) : b.status;
