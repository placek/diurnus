import { parse as parseToml } from 'smol-toml';
import { COLORS } from '../model';
import type { Category, DaySettings } from '../types';
import { TAG, tagsFor } from './slug';

/*
 * `.diurnus.toml`: kategorie i ustawienia doby. Zapis jest ręczny, żeby był
 * bajt w bajt powtarzalny; odczyt idzie przez `smol-toml` i ścisłą walidację —
 * nieznany klucz to błąd, a nie cicho pominięta literówka.
 */

export interface Config {
  cats: Category[];
  day: DaySettings;
}

const str = (s: string) => JSON.stringify(s); // podstawowy łańcuch TOML

export function renderConfig(cfg: Config): string {
  const tags = tagsFor(cfg.cats);
  const out: string[] = ['[day]', `start = ${cfg.day.start}`, `end = ${cfg.day.end}`];
  for (const b of [...cfg.day.bands].sort((a, b) => a.from - b.from)) {
    out.push(
      '',
      '[[day.bands]]',
      `name = ${str(b.name)}`,
      `from = ${b.from}`,
      `color = ${str(b.color)}`,
    );
  }
  for (const c of cfg.cats) {
    out.push('', '[[categories]]', `tag = ${str(tags.get(c.id)!)}`, `name = ${str(c.name)}`);
    if (c.icon) out.push(`icon = ${str(c.icon)}`);
    if (c.parent) out.push(`parent = ${str(tags.get(c.parent) ?? c.parent)}`);
    else out.push(`color = ${str(c.color ?? 'yellow')}`);
    if (c.archived) out.push('archived = true');
  }
  return out.join('\n') + '\n';
}

export type ConfigResult = { ok: true; config: Config } | { ok: false; errors: string[] };

const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function onlyKeys(o: Record<string, unknown>, keys: string[], where: string, errors: string[]) {
  for (const k of Object.keys(o))
    if (!keys.includes(k)) errors.push(`${where}: nieznany klucz „${k}"`);
}

/** Identyfikator kategorii po odczycie to jej tag; pory dnia — `band-GG`. */
export function parseConfig(text: string): ConfigResult {
  let raw: unknown;
  try {
    raw = parseToml(text);
  } catch (e) {
    return { ok: false, errors: [`niepoprawny TOML: ${(e as Error).message.split('\n')[0]}`] };
  }
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['plik nie jest tabelą TOML'] };
  onlyKeys(raw, ['day', 'categories'], 'plik', errors);

  const d = raw['day'];
  let day: DaySettings = { start: 6, end: 22, bands: [] };
  if (!isObj(d)) errors.push('brak tabeli [day]');
  else {
    onlyKeys(d, ['start', 'end', 'bands'], '[day]', errors);
    const { start, end } = d;
    if (!isInt(start) || !isInt(end) || start < 0 || end > 24 || start >= end)
      errors.push('[day]: start i end to pełne godziny, 0 ≤ start < end ≤ 24');
    const bands = d['bands'] ?? [];
    if (!Array.isArray(bands)) errors.push('[day]: bands musi być listą [[day.bands]]');
    const out: DaySettings['bands'] = [];
    const froms = new Set<number>();
    (Array.isArray(bands) ? bands : []).forEach((b: unknown, n) => {
      const where = `[[day.bands]] nr ${n + 1}`;
      if (!isObj(b)) return errors.push(`${where}: to nie jest tabela`);
      onlyKeys(b, ['name', 'from', 'color'], where, errors);
      if (typeof b['name'] !== 'string') errors.push(`${where}: brak nazwy`);
      if (!isInt(b['from']) || b['from'] < 0 || b['from'] > 23)
        errors.push(`${where}: from to godzina 0–23`);
      else if (froms.has(b['from']))
        errors.push(`${where}: dwie pory zaczynają się o ${b['from']}`);
      else froms.add(b['from']);
      if (!(COLORS as readonly string[]).includes(b['color'] as string))
        errors.push(`${where}: nieznany kolor „${String(b['color'])}"`);
      out.push({
        id: `band-${String(b['from'])}`,
        name: String(b['name'] ?? ''),
        from: Number(b['from']),
        color: String(b['color']),
      });
    });
    if (isInt(start) && isInt(end)) day = { start, end, bands: out };
  }

  const list = raw['categories'];
  const cats: Category[] = [];
  if (!Array.isArray(list) || !list.length) errors.push('brak kategorii [[categories]]');
  else {
    const tags = new Set<string>();
    list.forEach((c: unknown, n) => {
      const where = `[[categories]] nr ${n + 1}`;
      if (!isObj(c)) return errors.push(`${where}: to nie jest tabela`);
      onlyKeys(c, ['tag', 'name', 'icon', 'color', 'parent', 'archived'], where, errors);
      const tag = c['tag'];
      if (typeof tag !== 'string' || !TAG.test(tag)) errors.push(`${where}: tag musi być slugiem`);
      else if (tags.has(tag)) errors.push(`${where}: tag „${tag}" się powtarza`);
      else tags.add(tag);
      if (typeof c['name'] !== 'string' || !c['name'].trim()) errors.push(`${where}: brak nazwy`);
      if (c['icon'] !== undefined && typeof c['icon'] !== 'string')
        errors.push(`${where}: icon to napis`);
      if (c['archived'] !== undefined && c['archived'] !== true)
        errors.push(`${where}: archived może mieć tylko wartość true`);
      const parent = c['parent'];
      if (parent === undefined) {
        if (!(COLORS as readonly string[]).includes(c['color'] as string))
          errors.push(`${where}: kategoria główna potrzebuje koloru z listy`);
      } else if (c['color'] !== undefined)
        errors.push(`${where}: podkategoria nie ma własnego koloru`);
      cats.push({
        id: String(tag),
        tag: String(tag),
        name: String(c['name'] ?? ''),
        icon: typeof c['icon'] === 'string' ? c['icon'] : null,
        parent: typeof parent === 'string' ? parent : null,
        ...(parent === undefined ? { color: String(c['color']) } : {}),
        ...(c['archived'] === true ? { archived: true } : {}),
      });
    });
    // Rodzic musi istnieć i być kategorią główną.
    for (const c of cats) {
      if (!c.parent) continue;
      const p = cats.find((x) => x.id === c.parent);
      if (!p) errors.push(`kategoria „${c.tag}": nie ma rodzica „${c.parent}"`);
      else if (p.parent)
        errors.push(`kategoria „${c.tag}": rodzic „${c.parent}" sam jest podkategorią`);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, config: { cats, day } };
}
