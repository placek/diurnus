import { test, expect } from 'vitest';
import { ringLayout } from '../src/lib/radial';

const VW = 1200;
const VH = 800;

test('pozycje leżą na okręgu o wyliczonym promieniu', () => {
  const l = ringLayout(6, 600, 400, VW, VH);
  for (const p of l.items) {
    expect(Math.hypot(p.dx, p.dy)).toBeCloseTo(l.r, 5);
  }
});

test('pierwsza pozycja jest na górze okręgu', () => {
  const l = ringLayout(6, 600, 400, VW, VH);
  expect(l.items[0]!.dx).toBeCloseTo(0, 5);
  expect(l.items[0]!.dy).toBeCloseTo(-l.r, 5);
});

test('pozycje idą zgodnie z ruchem wskazówek zegara', () => {
  const l = ringLayout(4, 600, 400, VW, VH);
  expect(l.items[1]!.dx).toBeGreaterThan(0); // prawo
  expect(l.items[2]!.dy).toBeGreaterThan(0); // dół
  expect(l.items[3]!.dx).toBeLessThan(0); // lewo
});

test('promień rośnie z liczbą pozycji, żeby ikony nie zachodziły', () => {
  const few = ringLayout(3, 600, 400, VW, VH).r;
  const many = ringLayout(20, 600, 400, VW, VH).r;
  expect(many).toBeGreaterThan(few);
});

test('mała liczba pozycji nie schodzi poniżej minimalnego promienia', () => {
  expect(ringLayout(1, 600, 400, VW, VH).r).toBe(66);
});

test('na wąskim ekranie minimalny promień jest mniejszy', () => {
  expect(ringLayout(1, 200, 400, 400, 800).r).toBe(60);
});

test('menu przy lewej krawędzi jest wsuwane w widok', () => {
  const l = ringLayout(6, 0, 400, VW, VH);
  expect(l.x).toBeGreaterThanOrEqual(l.r + 30);
});

test('menu przy prawej krawędzi jest wsuwane w widok', () => {
  const l = ringLayout(6, VW, 400, VW, VH);
  expect(l.x).toBeLessThanOrEqual(VW - (l.r + 30));
});

test('menu przy górnej i dolnej krawędzi mieści się w pionie', () => {
  expect(ringLayout(6, 600, 0, VW, VH).y).toBeGreaterThanOrEqual(
    ringLayout(6, 600, 0, VW, VH).r + 30,
  );
  const bottom = ringLayout(6, 600, VH, VW, VH);
  expect(bottom.y).toBeLessThanOrEqual(VH - (bottom.r + 30));
});

test('menu na środku dużego ekranu nie jest przesuwane', () => {
  const l = ringLayout(6, 600, 400, VW, VH);
  expect(l.x).toBe(600);
  expect(l.y).toBe(400);
});

test('zero pozycji nie wywraca obliczeń', () => {
  const l = ringLayout(0, 600, 400, VW, VH);
  expect(l.items).toEqual([]);
  expect(l.r).toBe(66);
});

test('pierścień z podpisami jest szerszy i zostawia pod sobą miejsce na podpis', () => {
  expect(ringLayout(1, 600, 400, VW, VH, true).r).toBe(92);
  expect(ringLayout(8, 600, 400, VW, VH, true).r).toBeGreaterThan(
    ringLayout(8, 600, 400, VW, VH).r,
  );
  const bottom = ringLayout(6, 600, VH, VW, VH, true);
  expect(bottom.y).toBeLessThanOrEqual(VH - (bottom.r + 30 + 24));
});
