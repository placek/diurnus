<script lang="ts">
  import { ICON_PATHS } from '../lib/icons';

  interface Props {
    name: string;
    /** pokazywane, gdy ikona nie istnieje — w prototypie pierwsza litera nazwy kategorii */
    fallback?: string;
  }

  const { name, fallback = '' }: Props = $props();

  const def = $derived(ICON_PATHS[name]);
</script>

{#if def}
  <span class="ic" aria-hidden="true">
    <svg viewBox="0 0 {def[0]} {def[1]}" fill="currentColor"><path d={def[2]} /></svg>
  </span>
{:else}
  <span class="ic ltr" aria-hidden="true">{fallback}</span>
{/if}
