<script lang="ts">
  import { currentDay } from '../state.svelte';
  import { pericopeOf } from '../lib/pericope';

  // Perykopa Ewangelii według św. Jana na ten tydzień — środek linii między
  // medytacją a różańcem. Zmienia się w poniedziałek.
  const p = $derived(pericopeOf(currentDay.value));
</script>

<p
  class="medit pericope"
  title="Ewangelia według św. Jana — perykopa {p.number} do czytania w tym tygodniu (tydzień {p.week}.)"
>
  <span class="medit-ref">Ioannes {p.number}</span>
</p>
