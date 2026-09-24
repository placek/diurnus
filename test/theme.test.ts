import { test, expect } from 'vitest';
import { nextTheme, themeColor, THEME_LABEL } from '../src/lib/theme';

test('cykl motywu: auto → ciemny → jasny → auto', () => {
  expect(nextTheme('auto')).toBe('dark');
  expect(nextTheme('dark')).toBe('light');
  expect(nextTheme('light')).toBe('auto');
});

test('nieznana wartość wraca do auto', () => {
  expect(nextTheme('bzdura' as never)).toBe('auto');
});

test('kolor paska adresu idzie za faktycznym motywem, nie za ustawieniem', () => {
  expect(themeColor('dark', false)).toBe('#282828');
  expect(themeColor('light', true)).toBe('#fbf1c7');
  expect(themeColor('auto', true)).toBe('#282828');
  expect(themeColor('auto', false)).toBe('#fbf1c7');
});

test('każdy motyw ma polską etykietę', () => {
  expect(Object.keys(THEME_LABEL).sort()).toEqual(['auto', 'dark', 'light']);
});
