<script lang="ts">
  import { app, ui, win, currentDay } from '../state.svelte';
  import { tokenStats } from '../lib/stats';
  import { pad, splitDay } from '../lib/time';
  import Icon from './Icon.svelte';
  import TokenPips from './TokenPips.svelte';

  interface Props {
    onSettings?: () => void;
    onHelp?: () => void;
    onTheme?: () => void;
  }

  const { onSettings, onHelp, onTheme }: Props = $props();

  // Pełna nazwa dnia i miesiąca: "czwartek, 24 września". Wersalikami robi to
  // CSS, żeby odczyt dla czytnika ekranu został naturalny.
  const fmtDate = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const label = $derived.by(() => {
    const [y, m, d] = splitDay(currentDay.value);
    return fmtDate.format(new Date(y, m - 1, d));
  });

  const clock = $derived.by(() => {
    const d = new Date(app.now);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const PANE_ORDER = ['grid', 'list', 'backlog'] as const;
  const PANE_ICON = { grid: 'table-cells', list: 'list-check', backlog: 'layer-group' } as const;
  const PANE_TITLE = {
    grid: 'Siatka — przełącz na notatki',
    list: 'Notatki — przełącz na backlog',
    backlog: 'Backlog — przełącz na siatkę',
  } as const;
  const nextPane = () => PANE_ORDER[(PANE_ORDER.indexOf(ui.pane) + 1) % PANE_ORDER.length]!;

  const stats = $derived(tokenStats(app.S.blocks, currentDay.value, app.S.cats, win.q0, win.q1));

</script>

<header id="top">
  <!-- Lewy dystans równoważy narzędzia po prawej, żeby środek był środkiem
       ekranu, a nie środkiem tego, co zostało. -->
  <div class="hdr-side" aria-hidden="true"></div>

  <div class="hdr-center">
    <div class="hdr-when">
      <span id="date">{label}</span>
      <span id="clock" aria-label="Godzina">{clock}</span>
    </div>
    <TokenPips {stats} />
  </div>

  <div class="tools hdr-side">
    {#if ui.narrow}
      <button class="ib" onclick={() => (ui.pane = nextPane())} aria-label="Przełącz panel" title={PANE_TITLE[ui.pane]}>
        <Icon name={PANE_ICON[ui.pane]} fallback="≡" />
      </button>
    {/if}
    <button class="ib" onclick={onHelp} aria-label="Pomoc" title="Pomoc  ?">
      <Icon name="question" fallback="?" />
    </button>
    <button class="ib" onclick={onTheme} aria-label="Motyw" title="Motyw">
      <Icon name="circle-half-stroke" fallback="◐" />
    </button>
    <button class="ib" onclick={onSettings} aria-label="Ustawienia" title="Ustawienia: kategorie C, dzień D">
      <Icon name="sliders" fallback="U" />
    </button>
  </div>
</header>
