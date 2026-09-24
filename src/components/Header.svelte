<script lang="ts">
  import { app, win } from '../state.svelte';
  import { tokenStats } from '../lib/stats';
  import { shiftDay, splitDay, today } from '../lib/time';
  import Icon from './Icon.svelte';
  import TokenPips from './TokenPips.svelte';

  interface Props {
    onSuggest?: () => void;
    onSettings?: () => void;
    onHelp?: () => void;
    onTheme?: () => void;
  }

  const { onSuggest, onSettings, onHelp, onTheme }: Props = $props();

  const fmtDate = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const label = $derived.by(() => {
    const [y, m, d] = splitDay(app.viewDay);
    return fmtDate.format(new Date(y, m - 1, d)).replace(',', '');
  });

  const isToday = $derived(app.viewDay === today());

  const stats = $derived(tokenStats(app.S.blocks, app.viewDay, app.S.cats, win.q0, win.q1));

  const go = (n: number) => (app.viewDay = shiftDay(app.viewDay, n));
</script>

<header id="top">
  <div class="nav">
    <button class="ib" onclick={() => go(-1)} aria-label="Poprzedni dzień" title="Poprzedni dzień  [">
      <Icon name="chevron-left" fallback="‹" />
    </button>
    <button id="date" class:is-today={isToday} onclick={() => (app.viewDay = today())} title="Wróć do dziś  T">
      {label}
    </button>
    <button class="ib" onclick={() => go(1)} aria-label="Następny dzień" title="Następny dzień  ]">
      <Icon name="chevron-right" fallback="›" />
    </button>
  </div>

  <TokenPips {stats} />

  <div class="tools">
    <button class="ib" onclick={onSuggest} aria-label="Sugestie z zeszłego tygodnia" title="Sugestie z zeszłego tygodnia  S">
      <Icon name="wand-magic-sparkles" fallback="S" />
    </button>
    <button class="ib" onclick={onSettings} aria-label="Ustawienia" title="Ustawienia: kategorie C, dzień D">
      <Icon name="sliders" fallback="U" />
    </button>
    <button class="ib" onclick={onTheme} aria-label="Motyw" title="Motyw">
      <Icon name="circle-half-stroke" fallback="◐" />
    </button>
    <button class="ib" onclick={onHelp} aria-label="Pomoc" title="Pomoc  ?">
      <Icon name="keyboard" fallback="?" />
    </button>
  </div>
</header>
