// Tryb prywatny potrafi zabronić dostępu do localStorage, a limit ~5 MB potrafi
// go zapełnić. Obie sytuacje muszą kończyć się wartością zastępczą albo `false`,
// nigdy wyjątkiem przy każdej zmianie stanu.
export function readJSON<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const v = storage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(storage: Storage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
