<script lang="ts">
  import { currentDay } from '../state.svelte';
  import { roman } from '../lib/meditation';
  import { rosaryOf } from '../lib/rosary';

  // Część różańca na dziś (po łacinie); tajemnice w podpowiedzi. Na ekranie
  // dotykowym podpowiedzi nie ma, więc tam (`expandable`) dotknięcie rozwija
  // tajemnice w samej linii.
  interface Props {
    expandable?: boolean;
  }

  const { expandable = false }: Props = $props();

  const part = $derived(rosaryOf(currentDay.value));
  const list = $derived(part.mysteries.map((m, i) => `${roman(i + 1)}. ${m}`).join('\n'));
  let open = $state(false);
</script>

<p class="medit rosary" title={list}>
  {#if expandable}
    <button
      type="button"
      class="rosary-toggle medit-ref"
      aria-expanded={open}
      onclick={() => (open = !open)}>{part.name}</button
    >{#if open}<span class="medit-theme">
        — {part.mysteries.map((m, i) => `${roman(i + 1)}. ${m}`).join(' · ')}</span
      >{/if}
  {:else}
    <span class="medit-ref">{part.name}</span>
  {/if}
</p>
