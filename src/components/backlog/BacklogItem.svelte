<script lang="ts">
  import { app, currentDay, pushHistory, save, ui } from '../../state.svelte';
  import { addItemAfter, deleteItem, setItemText } from '../../actions.svelte';
  import { backlogItems, sortBacklog } from '../../lib/backlog';
  import { describeRepeat } from '../../lib/repeat';
  import { fmtQ } from '../../lib/time';
  import type { Item } from '../../lib/types';
  import Bullet from '../list/Bullet.svelte';

  interface Props {
    item: Item;
  }

  const { item }: Props = $props();

  let el = $state<HTMLInputElement | null>(null);
  let dirty = false;

  $effect(() => {
    if (ui.focusItem === item.id && el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      ui.focusItem = null;
    }
  });

  const siblings = $derived(sortBacklog(backlogItems(app.S.items, currentDay.value)));
  const index = $derived(siblings.findIndex((i) => i.id === item.id));

  const fmtShort = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  // Metryka mówi, co o pozycji wiadomo: wzorzec, albo data i ewentualna pora.
  const meta = $derived.by(() => {
    if (item.repeat) return describeRepeat(item.repeat);
    if (!item.day) return '';
    const [y, m, d] = item.day.split('-').map(Number);
    const date = fmtShort.format(new Date(y!, m! - 1, d!)).replace(',', '');
    return item.at !== undefined ? `${date} ${fmtQ(item.day, item.at)}` : date;
  });

  function onKeydown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    const at = input.selectionStart ?? 0;
    const collapsed = input.selectionStart === input.selectionEnd;

    if (e.key === 'Enter') {
      e.preventDefault();
      addItemAfter(item.id);
      return;
    }
    if (e.key === 'Backspace' && at === 0 && collapsed && input.value === '') {
      e.preventDefault();
      deleteItem(item.id, siblings[index - 1]?.id ?? null);
      return;
    }
    if (e.key === 'ArrowUp' && at === 0 && collapsed && index > 0) {
      e.preventDefault();
      ui.focusItem = siblings[index - 1]!.id;
      return;
    }
    if (e.key === 'ArrowDown' && at === input.value.length && collapsed && index < siblings.length - 1) {
      e.preventDefault();
      ui.focusItem = siblings[index + 1]!.id;
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      input.blur();
    }
  }
</script>

<div class="item backlog-item t-{item.type}" class:is-dragging={ui.drag?.id === item.id} data-id={item.id}>
  <Bullet {item} />
  <input
    bind:this={el}
    class="item-text"
    value={item.text}
    maxlength="200"
    autocomplete="off"
    oninput={(e) => {
      if (!dirty) {
        pushHistory();
        dirty = true;
      }
      setItemText(item.id, e.currentTarget.value);
      save();
    }}
    onfocus={() => (dirty = false)}
    onblur={() => (dirty = false)}
    onkeydown={onKeydown}
  />
  {#if meta}<span class="backlog-meta">{meta}</span>{/if}
</div>
