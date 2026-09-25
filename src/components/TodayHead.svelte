<script lang="ts">
  import { app, win, currentDay } from '../state.svelte';
  import { tokenStats } from '../lib/stats';
  import { pad, splitDay } from '../lib/time';
  import TokenPips from './TokenPips.svelte';

  // Nagłówek dnia: data, zegar i pasek postępu. Na szerokim ekranie stoi na
  // górze sekcji dziś, na wąskim — w pasku u góry, żeby był widoczny przy
  // każdym panelu.

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

  const stats = $derived(tokenStats(app.S.items, app.S.cats, win.q0, win.q1));
</script>

<div class="hdr-when">
  <span id="date">{label}</span>
  <span id="clock" aria-label="Godzina">{clock}</span>
</div>
<TokenPips {stats} />
