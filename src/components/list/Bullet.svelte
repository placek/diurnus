<script lang="ts">
  import { MARK } from '../../lib/items';
  import { migrateItem, migrateToTomorrow, setItemType } from '../../actions.svelte';
  import { app } from '../../state.svelte';
  import { shiftDay } from '../../lib/time';
  import type { Item, ItemType } from '../../lib/types';

  interface Props {
    item: Item;
  }

  const { item }: Props = $props();

  let menu = $state(false);

  // Menu otwiera prawy przycisk, więc zwykły klik nie zamknie go od razu
  // po otwarciu; bez tego nasłuchu nie ma z niego wyjścia poza wyborem typu.
  $effect(() => {
    if (!menu) return;
    const close = () => (menu = false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  });

  const TYPES: { type: ItemType; label: string }[] = [
    { type: 'task', label: 'Zadanie' },
    { type: 'done', label: 'Wykonane' },
    { type: 'note', label: 'Notatka' },
    { type: 'migrated', label: 'Na jutro' },
    { type: 'scheduled', label: 'Na dzień…' },
  ];

  function choose(type: ItemType) {
    menu = false;
    if (type === 'migrated') return migrateToTomorrow(item.id);
    if (type === 'scheduled') {
      const target = prompt('Na który dzień? (RRRR-MM-DD)', shiftDay(app.viewDay, 1));
      if (target && /^\d{4}-\d{2}-\d{2}$/.test(target)) migrateItem(item.id, target, 'scheduled');
      return;
    }
    setItemType(item.id, type);
  }
</script>

<!-- Klik przełącza TYLKO zadanie ↔ wykonane: to ruch wykonywany kilkadziesiąt
     razy dziennie i nie może wymagać celowania w menu. Reszta typów siedzi
     pod prawym przyciskiem, bo dwa z nich zapisują do listy innego dnia. -->
<button
  class="bullet t-{item.type}"
  aria-label="Znacznik: {item.type}"
  onclick={() => setItemType(item.id, item.type === 'done' ? 'task' : 'done')}
  oncontextmenu={(e) => {
    e.preventDefault();
    menu = !menu;
  }}>{MARK[item.type]}</button
>

{#if menu}
  <div class="bullet-menu" role="menu">
    {#each TYPES as t (t.type)}
      <button role="menuitem" class:sel={t.type === item.type} onclick={() => choose(t.type)}>
        <span class="bm-mark">{MARK[t.type]}</span>{t.label}
      </button>
    {/each}
  </div>
{/if}
