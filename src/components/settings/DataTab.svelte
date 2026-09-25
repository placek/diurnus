<script lang="ts">
  import { app, closeAll, replaceState } from '../../state.svelte';
  import { bundleParse } from '../../lib/backup';
  import { collect, filesToZip } from '../../lib/md/archive';
  import { parseFiles, renderFiles } from '../../lib/md/files';
  import type { FileError } from '../../lib/md/files';
  import type { State } from '../../lib/types';
  import Icon from '../Icon.svelte';

  let fileInput = $state<HTMLInputElement | null>(null);
  /** Powody odrzucenia ostatniego wczytania — po jednym na linię pliku. */
  let errors = $state<string[]>([]);
  const SHOWN = 12;

  const count = $derived(app.S.items.length);
  // Dni z zapisem: minione, w których coś zostało, i dziś, jeśli coś w nim jest.
  const days = $derived(
    new Set(
      app.S.items.flatMap((i) =>
        i.state.tag === 'past-done' || i.state.tag === 'past-note'
          ? [i.state.day]
          : i.state.tag === 'today-task' || i.state.tag === 'today-note'
            ? [app.S.today]
            : [],
      ),
    ).size,
  );

  const pl = (n: number, one: string, few: string, many: string) =>
    n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

  const where = (e: FileError) =>
    e.file ? `${e.file}${e.line !== null ? `:${e.line}` : ''}: ` : '';

  function download() {
    let files: Record<string, string>;
    try {
      files = renderFiles($state.snapshot(app.S) as State);
    } catch (err) {
      app.toast = { msg: err instanceof Error ? err.message : 'Nie udało się zapisać', undoable: false };
      return;
    }
    const name = `diurnus-${app.S.today}.zip`;
    const zip = filesToZip(files);
    const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const n = Object.keys(files).length;
    app.toast = { msg: `Zapisano ${name} — ${n} ${pl(n, 'plik', 'pliki', 'plików')}`, undoable: false };
  }

  /** Wczytanie zastępuje wszystko, więc pyta wprost — „Cofnij" byłby kłamstwem. */
  function replaceWith(state: State) {
    const ok = confirm(
      `Zastąpić bieżący stan dziennikiem z ${state.items.length} ${pl(state.items.length, 'pozycją', 'pozycjami', 'pozycjami')}? Tej operacji nie można cofnąć.`,
    );
    if (!ok) return;
    replaceState(state);
    closeAll();
    app.toast = { msg: 'Dziennik wczytany', undoable: false };
  }

  async function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const picked = [...(input.files ?? [])];
    // Czyścimy od razu, żeby wybór TYCH SAMYCH plików znów wywołał zdarzenie.
    input.value = '';
    errors = [];
    if (!picked.length) return;

    // Stara kopia JSON: już się jej nie tworzy, ale ta pobrana wcześniej musi się wczytać.
    if (picked.length === 1 && /\.json$/i.test(picked[0]!.name)) {
      try {
        replaceWith(bundleParse(await picked[0]!.text()).state);
      } catch (err) {
        errors = [err instanceof Error ? err.message : 'Nie udało się wczytać pliku'];
      }
      return;
    }

    const entries = await Promise.all(
      picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    const got = collect(entries);
    if (!got.ok) {
      errors = got.errors;
      return;
    }
    const parsed = parseFiles(got.files);
    if (!parsed.ok) {
      errors = parsed.errors.map((x) => `${where(x)}${x.message}`);
      return;
    }
    replaceWith(parsed.state);
  }
</script>

<div class="ce-list">
  <p class="hint">
    W pamięci przeglądarki: <b>{count}</b>
    {pl(count, 'pozycja', 'pozycje', 'pozycji')} z <b>{days}</b> {pl(days, 'dnia', 'dni', 'dni')}.
  </p>
  <p class="hint">
    Dane żyją wyłącznie w tej przeglądarce. Wyczyszczenie danych witryny kasuje je bezpowrotnie —
    pobrany dziennik to jedyne zabezpieczenie.
  </p>

  <button class="btn ce-add" onclick={download}>
    <Icon name="download" fallback="↓" />Pobierz dziennik (Markdown)
  </button>
  <button class="btn ce-add" onclick={() => fileInput?.click()}>
    <Icon name="upload" fallback="↑" />Wczytaj dziennik
  </button>
  <input
    bind:this={fileInput}
    type="file"
    multiple
    accept=".zip,.md,.toml,.json,application/zip"
    hidden
    onchange={onPick}
  />

  {#if errors.length}
    <div class="import-errors" role="alert">
      <b>Nie wczytano niczego:</b>
      <ul>
        {#each errors.slice(0, SHOWN) as err, i (i)}<li>{err}</li>{/each}
      </ul>
      {#if errors.length > SHOWN}<p>…i jeszcze {errors.length - SHOWN}</p>{/if}
    </div>
  {/if}

  <p class="hint">
    Archiwum ZIP zawiera plik dziś (<code>RRRR-MM-DD.md</code>), <code>BACKLOG.md</code>, pliki
    minionych dni i ustawienia <code>.diurnus.toml</code>. Wczytać można to archiwum albo te pliki
    zaznaczone razem; wczyta się też starsza kopia JSON.
  </p>
  <p class="hint">Wczytanie <b>zastąpi</b> cały bieżący stan.</p>
</div>
