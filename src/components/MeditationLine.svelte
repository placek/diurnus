<script lang="ts">
  import { currentDay } from '../state.svelte';
  import { meditationOf, roman } from '../lib/meditation';

  // Medytacja poranna pod datą: rozdział „De Imitatione Christi" i Psalm na
  // dzisiejszy dzień roku, z myślą przewodnią. Pełny opis w podpowiedzi.
  const m = $derived(meditationOf(currentDay.value));
  const ref = $derived(`Liber ${roman(m.liber)}, Caput ${roman(m.caput)} · Psalm ${m.psalm}`);
</script>

<p
  class="medit"
  title="De Imitatione Christi, {`Liber ${roman(m.liber)}, Caput ${roman(m.caput)}`} · Psalm {m.psalm}: {m.theme}"
>
  <span class="medit-ref">{ref}</span>
  <span class="medit-theme">— {m.theme}</span>
</p>
