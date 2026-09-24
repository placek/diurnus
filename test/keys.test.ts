import { test, expect } from 'vitest';
import { keyAction, clampCursor } from '../src/lib/keys';
import type { KeyContext } from '../src/lib/keys';

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({
  layer: 'grid',
  inInput: false,
  menuHasLevel: false,
  cursorVisible: true,
  ctrl: false,
  meta: false,
  alt: false,
  ...over,
});

const k = (key: string, over: Partial<KeyContext> = {}) => keyAction(key, ctx(over));

test('hjkl i strzałki poruszają kursorem o kwant i o rząd', () => {
  expect(k('h')).toEqual({ type: 'move', delta: -1 });
  expect(k('ArrowLeft')).toEqual({ type: 'move', delta: -1 });
  expect(k('l')).toEqual({ type: 'move', delta: 1 });
  expect(k('ArrowRight')).toEqual({ type: 'move', delta: 1 });
  expect(k('k')).toEqual({ type: 'move', delta: -4 });
  expect(k('ArrowUp')).toEqual({ type: 'move', delta: -4 });
  expect(k('j')).toEqual({ type: 'move', delta: 4 });
  expect(k('ArrowDown')).toEqual({ type: 'move', delta: 4 });
});

test('cyfra przypisuje kategorię w siatce', () => {
  expect(k('3')).toEqual({ type: 'digit', n: 3 });
  expect(k('9')).toEqual({ type: 'digit', n: 9 });
});

test('zero nie jest cyfrą kategorii w siatce', () => {
  expect(k('0')).toBeNull();
});

test('nawigacja po dniach', () => {
  expect(k('[')).toEqual({ type: 'day', delta: -1 });
  expect(k(',')).toEqual({ type: 'day', delta: -1 });
  expect(k(']')).toEqual({ type: 'day', delta: 1 });
  expect(k('.')).toEqual({ type: 'day', delta: 1 });
  expect(k('t')).toEqual({ type: 'today' });
  expect(k('T')).toEqual({ type: 'today' });
});

test('skróty narzędzi', () => {
  expect(k('s')).toEqual({ type: 'suggest' });
  expect(k('c')).toEqual({ type: 'settings', tab: 'cats' });
  expect(k('d')).toEqual({ type: 'settings', tab: 'day' });
  expect(k('?')).toEqual({ type: 'help' });
});

test('Enter i spacja działają tylko przy widocznym kursorze', () => {
  expect(k('Enter')).toEqual({ type: 'act' });
  expect(k(' ')).toEqual({ type: 'act' });
  expect(k('Enter', { cursorVisible: false })).toBeNull();
});

test('e edytuje, Delete usuwa — tylko przy widocznym kursorze', () => {
  expect(k('e')).toEqual({ type: 'edit' });
  expect(k('Delete')).toEqual({ type: 'delete' });
  expect(k('Backspace')).toEqual({ type: 'delete' });
  expect(k('e', { cursorVisible: false })).toBeNull();
});

test('Ctrl+Z i Cmd+Z cofają na każdej warstwie', () => {
  expect(k('z', { ctrl: true })).toEqual({ type: 'undo' });
  expect(k('Z', { meta: true })).toEqual({ type: 'undo' });
  expect(keyAction('z', ctx({ ctrl: true, layer: 'menu' }))).toEqual({ type: 'undo' });
});

test('inne skróty z modyfikatorem są ignorowane', () => {
  expect(k('l', { ctrl: true })).toBeNull();
  expect(k('t', { alt: true })).toBeNull();
});

test('Escape zamyka wierzchnią warstwę', () => {
  for (const layer of ['grid', 'menu', 'edit', 'settings', 'help'] as const) {
    expect(keyAction('Escape', ctx({ layer }))).toEqual({ type: 'close' });
  }
});

test('przy otwartym menu ruch kursora jest wyłączony', () => {
  expect(k('j', { layer: 'menu' })).toBeNull();
  expect(k('l', { layer: 'menu' })).toBeNull();
});

test('przy otwartym menu cyfra wybiera pozycję pierścienia', () => {
  expect(k('2', { layer: 'menu' })).toEqual({ type: 'menuPick', n: 2 });
});

test('w drugim pierścieniu 0 i Enter wybierają kategorię ogólnie, Backspace cofa', () => {
  const inner = { layer: 'menu', menuHasLevel: true } as const;
  expect(k('0', inner)).toEqual({ type: 'menuParent' });
  expect(k('Enter', inner)).toEqual({ type: 'menuParent' });
  expect(k('Backspace', inner)).toEqual({ type: 'menuBack' });
});

test('w pierwszym pierścieniu 0 i Backspace nic nie robią', () => {
  expect(k('0', { layer: 'menu' })).toBeNull();
  expect(k('Backspace', { layer: 'menu' })).toBeNull();
});

test('przy otwartym arkuszu cyfra zmienia kategorię, Enter zapisuje', () => {
  expect(k('4', { layer: 'edit' })).toEqual({ type: 'digit', n: 4 });
  expect(k('Enter', { layer: 'edit' })).toEqual({ type: 'save' });
  expect(k('j', { layer: 'edit' })).toBeNull();
});

test('ustawienia przechwytują wszystko poza Escape', () => {
  expect(k('j', { layer: 'settings' })).toBeNull();
  expect(k('3', { layer: 'settings' })).toBeNull();
  expect(k('Escape', { layer: 'settings' })).toEqual({ type: 'close' });
});

test('pomoc zamyka się Enterem i pytajnikiem', () => {
  expect(k('Enter', { layer: 'help' })).toEqual({ type: 'close' });
  expect(k('?', { layer: 'help' })).toEqual({ type: 'close' });
  expect(k('j', { layer: 'help' })).toBeNull();
});

test('pisanie w polu tekstowym nie uruchamia skrótów', () => {
  expect(k('j', { inInput: true })).toBeNull();
  expect(k('s', { inInput: true })).toBeNull();
  expect(k('3', { inInput: true })).toBeNull();
  expect(k('Escape', { inInput: true })).toEqual({ type: 'close' });
  expect(k('Enter', { inInput: true })).toEqual({ type: 'save' });
});

test('clampCursor trzyma kursor w widocznym oknie doby', () => {
  expect(clampCursor(40, 4, 24, 88)).toBe(44);
  expect(clampCursor(24, -1, 24, 88)).toBe(24);
  expect(clampCursor(87, 1, 24, 88)).toBe(87);
  expect(clampCursor(26, -4, 24, 88)).toBe(24);
  expect(clampCursor(86, 4, 24, 88)).toBe(87);
});
