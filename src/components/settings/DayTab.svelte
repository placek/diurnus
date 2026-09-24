<script lang="ts">
  import { COLORS, DEFAULT_DAY, uid } from '../../lib/model';
  import { app, savePrefs } from '../../state.svelte';

  /** Zgoda pytana dopiero przy włączaniu — nieproszony monit ludzie blokują. */
  async function requestNotify(want: boolean, el: HTMLInputElement) {
    if (!want) {
      app.prefs.notify = false;
      savePrefs();
      return;
    }
    if (typeof Notification === 'undefined') {
      el.checked = false;
      app.toast = { msg: 'Ta przeglądarka nie obsługuje powiadomień', undoable: false };
      return;
    }
    const permission =
      Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (permission !== 'granted') {
      el.checked = false;
      app.prefs.notify = false;
      savePrefs();
      app.toast = { msg: 'Przeglądarka odmówiła zgody na powiadomienia', undoable: false };
      return;
    }
    app.prefs.notify = true;
    savePrefs();
  }
  import { clampDayRange, dayPreview } from '../../lib/settings';
  import { pad } from '../../lib/time';
  import type { DaySettings } from '../../lib/types';
  import Icon from '../Icon.svelte';

  interface Props {
    day: DaySettings;
    setDay: (d: DaySettings) => void;
  }

  const { day, setDay }: Props = $props();

  let bpanel = $state<string | null>(null);

  const hours = $derived(day.end - day.start);
  const sorted = $derived(day.bands.slice().sort((a, b) => a.from - b.from));
  const preview = $derived(dayPreview(day));
  const dupCount = $derived.by(() => {
    const m = new Map<number, number>();
    for (const b of day.bands) m.set(b.from, (m.get(b.from) ?? 0) + 1);
    return m;
  });

  const plural = (n: number) =>
    n === 1 ? 'slot' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'sloty' : 'slotów';

  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);

  // Oś podglądu: gęstsza dla krótkiego dnia, rzadsza dla długiego.
  const axisStep = $derived(hours > 16 ? 4 : hours > 8 ? 2 : 1);
  const axis = $derived(
    range(day.start, day.end).filter(
      (x) => (x - day.start) % axisStep === 0 || x === day.end,
    ),
  );

  function addBand() {
    const taken = new Set(day.bands.map((b) => b.from));
    const usedCol = new Set(day.bands.map((b) => b.color));
    let from = day.start;
    while (from < day.end - 1 && taken.has(from)) from++;
    day.bands.push({
      id: uid(),
      name: '',
      from,
      color: COLORS.find((c) => !usedCol.has(c)) ?? COLORS[0],
    });
  }
</script>

<div class="dy-range">
  <label class="dy-f">
    Początek
    <select
      class="cfg-sel"
      value={day.start}
      onchange={(e) => setDay({ ...day, ...clampDayRange(+e.currentTarget.value, day.end) })}
    >
      {#each range(0, 23) as h (h)}<option value={h}>{pad(h)}:00</option>{/each}
    </select>
  </label>
  <span class="dy-dash">–</span>
  <label class="dy-f">
    Koniec
    <select
      class="cfg-sel"
      value={day.end}
      onchange={(e) => setDay({ ...day, ...clampDayRange(day.start, +e.currentTarget.value) })}
    >
      {#each range(day.start + 1, 24) as h (h)}<option value={h}>{pad(h)}:00</option>{/each}
    </select>
  </label>
  <span class="dy-sum">{hours} h, {hours * 2} {plural(hours * 2)}</span>
</div>

<div id="dprev">
  <div class="dp">
    {#each preview as s (s.from)}
      <div
        class="dp-seg"
        class:none={!s.band}
        style="flex:{s.to - s.from}{s.band ? `;--c:var(--${s.band.color})` : ''}"
        title="{pad(s.from)}–{pad(s.to)}{s.band?.name ? '  ' + s.band.name : ''}"
      >
        <span>{s.band?.name ?? ''}</span>
      </div>
    {/each}
  </div>
  <div class="dp-ax">
    {#each axis as x (x)}
      <span style="left:{(((x - day.start) / hours) * 100).toFixed(2)}%">{pad(x)}</span>
    {/each}
  </div>
</div>

<div class="dy-h">Pory dnia</div>

<div class="ce-list">
  {#each sorted as b, i (b.id)}
    {@const next = sorted[i + 1]}
    {@const visible = Math.max(b.from, day.start) < Math.min(next ? next.from : 24, day.end)}
    <div
      class="ce-row band"
      class:out={!visible}
      class:dup={(dupCount.get(b.from) ?? 0) > 1}
      data-bid={b.id}
      style="--c:var(--{b.color})"
      title={visible ? undefined : 'Poza zakresem dnia'}
    >
      <button class="ce-sw" onclick={() => (bpanel = bpanel === b.id ? null : b.id)} title="Kolor" aria-label="Kolor"></button>
      <input class="ce-name" bind:value={b.name} placeholder="Nazwa pory dnia" maxlength="24" />
      <label class="dy-from">
        od
        <select class="cfg-sel" bind:value={b.from}>
          {#each range(0, 23) as h (h)}<option value={h}>{pad(h)}:00</option>{/each}
        </select>
      </label>
      <button class="ib del" onclick={() => setDay({ ...day, bands: day.bands.filter((x) => x.id !== b.id) })} title="Usuń" aria-label="Usuń">
        <Icon name="trash-can" fallback="×" />
      </button>
    </div>

    {#if bpanel === b.id}
      <div class="ce-panel" style="--c:var(--{b.color});margin-left:8px">
        {#each COLORS as col (col)}
          <button class="sw" class:sel={col === b.color} style="--sc:var(--{col})" aria-label={col} onclick={() => { b.color = col; bpanel = null; }}></button>
        {/each}
      </div>
    {/if}
  {/each}
</div>

<div class="dy-h">Powiadomienia</div>
<label class="dy-notify">
  <input
    type="checkbox"
    checked={app.prefs.notify}
    onchange={(e) => requestNotify(e.currentTarget.checked, e.currentTarget)}
  />
  Powiadamiaj o blokach — kwadrans przed i na starcie
</label>
<p class="hint">Powiadomienia padają tylko wtedy, gdy GridDay jest otwarty w karcie.</p>

<button class="btn ce-add" onclick={addBand}><Icon name="plus" fallback="+" />Nowa pora dnia</button>
<button class="linkbtn" onclick={() => setDay(structuredClone(DEFAULT_DAY) as DaySettings)}>
  Przywróć domyślne 06–22
</button>
