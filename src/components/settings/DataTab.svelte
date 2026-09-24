<script lang="ts">
  import { app, closeAll, save, savePrefs } from '../../state.svelte';
  import { bundleExport, bundleParse } from '../../lib/backup';
  import { dayKey } from '../../lib/time';
  import Icon from '../Icon.svelte';

  let fileInput = $state<HTMLInputElement | null>(null);

  const blocks = $derived(app.S.blocks.filter((b) => b.status !== 'discarded').length);
  const days = $derived(new Set(app.S.blocks.map((b) => b.day)).size);

  const pl = (n: number, one: string, few: string, many: string) =>
    n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

  function download() {
    const name = `gridday-${dayKey(new Date())}.json`;
    const json = bundleExport($state.snapshot(app.S), $state.snapshot(app.prefs), Date.now());
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    app.toast = { msg: `Zapisano ${name}`, undoable: false };
  }

  async function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    // Czyścimy od razu, żeby wybór TEGO SAMEGO pliku znów wywołał zdarzenie.
    input.value = '';
    if (!file) return;

    try {
      const got = bundleParse(await file.text());
      // Wczytanie kasuje też historię cofania, więc toast z "Cofnij" byłby
      // kłamstwem — stąd pytanie wprost.
      const ok = confirm(
        `Zastąpić bieżący stan kopią z ${got.state.blocks.length} blokami? Tej operacji nie można cofnąć.`,
      );
      if (!ok) return;
      app.S = got.state;
      app.prefs = got.prefs;
      save();
      savePrefs();
      closeAll();
      app.toast = { msg: 'Kopia wczytana', undoable: false };
    } catch (err) {
      app.toast = { msg: err instanceof Error ? err.message : 'Nie udało się wczytać pliku', undoable: false };
    }
  }
</script>

<div class="ce-list">
  <p class="hint">
    W pamięci przeglądarki: <b>{blocks}</b>
    {pl(blocks, 'blok', 'bloki', 'bloków')} z <b>{days}</b> {pl(days, 'dnia', 'dni', 'dni')}.
  </p>
  <p class="hint">
    Dane żyją wyłącznie w tej przeglądarce. Wyczyszczenie danych witryny kasuje je bezpowrotnie —
    kopia zapasowa to jedyne zabezpieczenie.
  </p>

  <button class="btn ce-add" onclick={download}>
    <Icon name="download" fallback="↓" />Pobierz kopię zapasową
  </button>
  <button class="btn ce-add" onclick={() => fileInput?.click()}>
    <Icon name="upload" fallback="↑" />Wczytaj kopię zapasową
  </button>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onPick} />

  <p class="hint">Wczytanie kopii <b>zastąpi</b> cały bieżący stan.</p>
</div>
