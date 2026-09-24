<script lang="ts">
  import { app, ui, win } from '../state.svelte';
  import { tokenStats } from '../lib/stats';
  import { pad, shiftDay, splitDay, today } from '../lib/time';
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
    const [y, m, d] = splitDay(app.viewDay);
    return fmtDate.format(new Date(y, m - 1, d));
  });

  const isToday = $derived(app.viewDay === today());

  const clock = $derived.by(() => {
    const d = new Date(app.now);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  const stats = $derived(tokenStats(app.S.blocks, app.viewDay, app.S.cats, win.q0, win.q1));

  const go = (n: number) => (app.viewDay = shiftDay(app.viewDay, n));
</script>

<header id="top">
  <div class="nav">
    <button class="ib" onclick={() => go(-1)} aria-label="Poprzedni dzień" title="Poprzedni dzień  [">
      <Icon name="chevron-left" fallback="‹" />
    </button>
    <button
      id="date"
      class:is-today={isToday}
      onclick={() => (app.viewDay = today())}
      title="Wróć do dziś  T"
    >
      {label}
    </button>
    <button class="ib" onclick={() => go(1)} aria-label="Następny dzień" title="Następny dzień  ]">
      <Icon name="chevron-right" fallback="›" />
    </button>
    <span id="clock" aria-label="Godzina">{clock}</span>
  </div>

  <TokenPips {stats} />

  <div class="tools">
    {#if ui.narrow}
      <button
        class="ib"
        onclick={() => (ui.pane = ui.pane === 'grid' ? 'list' : 'grid')}
        aria-label="Przełącz panel"
        title="Przełącz siatkę i listę"
      >
        <Icon name={ui.pane === 'grid' ? 'list-check' : 'table-cells'} fallback="≡" />
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
