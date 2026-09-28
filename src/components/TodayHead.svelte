<script lang="ts">
  import { app, currentDay } from '../state.svelte';
  import { pad, splitDay } from '../lib/time';

  // Nagłówek dnia: data i zegar. Na szerokim ekranie stoi na
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

  // Wąski telefon: skrót „pon., 28 wrz" — pełna nazwa nie mieści się obok narzędzi.
  const fmtShort = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const short = $derived.by(() => {
    const [y, m, d] = splitDay(currentDay.value);
    return fmtShort.format(new Date(y, m - 1, d));
  });

  const clock = $derived.by(() => {
    const d = new Date(app.now);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
</script>

<div class="hdr-when">
  <span id="date"><span class="d-long">{label}</span><span class="d-short">{short}</span></span>
  <span id="clock" aria-label="Godzina">{clock}</span>
</div>
