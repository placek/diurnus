<script lang="ts">
  import { app, pushHistory, save, ui, currentDay } from '../../state.svelte';
  import { addItemAfter, cycleItemType, deleteItem, setItemText } from '../../actions.svelte';
  import { colorOf, iconOf } from '../../lib/categories';
  import Icon from '../Icon.svelte';
  import { fmtQ } from '../../lib/time';
  import type { Item } from '../../lib/types';
  import { categoryOf, itemTone, kindOf, slotOf, todayList } from '../../lib/view';
  import Bullet from './Bullet.svelte';

  interface Props {
    item: Item;
  }

  const { item }: Props = $props();

  let el = $state<HTMLInputElement | null>(null);
  /** czy w tej pozycji padł już znak od ostatniego wejścia w nią */
  let dirty = false;

  // Fokus jest stanem widokowym: mutator mówi, KTÓRA pozycja ma go dostać,
  // a przeniesienie go jest deklaracją tutaj — nie grzebaniem w DOM z mutatora.
  $effect(() => {
    if (ui.focusItem === item.id && el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      ui.focusItem = null;
    }
  });

  // Pozycja ze slotem JEST blokiem na siatce — jeden rekord, więc godzina,
  // kategoria i znacznik nie mają się z czym rozjechać.
  const slot = $derived(slotOf(item));
  const cat = $derived(categoryOf(item, app.S.cats));
  const color = $derived(cat ? colorOf(app.S.cats, cat) : null);
  const tone = $derived(itemTone(item, currentDay.value, app.now));

  // Nawigacja klawiszami idzie przez WSZYSTKIE grupy w kolejności wyświetlania:
  // wykonane w kolejności odhaczenia, ze slotem według godzin, potem swobodne.
  const siblings = $derived(todayList(app.S.items));
  const index = $derived(siblings.findIndex((i) => i.id === item.id));

  function focusSibling(offset: -1 | 1) {
    const target = siblings[index + offset];
    if (target) ui.focusItem = target.id;
  }

  function onKeydown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    const at = input.selectionStart ?? 0;
    const collapsed = input.selectionStart === input.selectionEnd;

    if (e.key === 'Enter') {
      e.preventDefault();
      addItemAfter(item.id);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      cycleItemType(item.id, e.shiftKey ? -1 : 1);
      // Wykonane stoją w osobnej grupie, więc zmiana znacznika potrafi przenieść
      // wiersz do innego bloku listy — a nowy wiersz to nowe pole. Fokus idzie
      // za pozycją, nie za elementem.
      ui.focusItem = item.id;
      return;
    }
    if (e.key === 'Backspace' && at === 0 && collapsed && input.value === '') {
      e.preventDefault();
      deleteItem(item.id, siblings[index - 1]?.id ?? null);
      return;
    }
    // Strzałki przechodzą między pozycjami TYLKO na krawędziach tekstu;
    // w środku muszą normalnie poruszać karetką, inaczej nie da się przejść
    // przez długą, zawiniętą pozycję.
    if (e.key === 'ArrowUp' && at === 0 && collapsed && index > 0) {
      e.preventDefault();
      focusSibling(-1);
      return;
    }
    if (
      e.key === 'ArrowDown' &&
      at === input.value.length &&
      collapsed &&
      index < siblings.length - 1
    ) {
      e.preventDefault();
      focusSibling(1);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      input.blur();
    }
  }
</script>

<div
  class="item t-{kindOf(item)} tone-{tone}"
  class:is-linked={slot !== null}
  class:has-cat={!!color}
  class:is-dragging={ui.drag?.id === item.id}
  data-id={item.id}
  style={color ? `--c:var(--${color})` : undefined}
>
  <Bullet {item} />
  <input
    bind:this={el}
    class="item-text"
    value={item.text}
    maxlength="200"
    placeholder={cat ? cat.name : ''}
    autocomplete="off"
    oninput={(e) => {
      // Migawka przy PIERWSZYM znaku w tej pozycji, nie przy wyjściu z niej:
      // commit() po edycji zapisałby stan już zmieniony, więc cofnięcie
      // przywracałoby wpisany tekst zamiast poprzedniego.
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
  {#if slot !== null}<span class="item-meta item-hour">{fmtQ(currentDay.value, slot)}</span>{/if}
  <!-- Ikona kategorii stoi na samym końcu, za czasem. -->
  {#if cat}<span class="item-cat" title={cat.name}
      ><Icon name={iconOf(app.S.cats, cat)} fallback={cat.name[0] ?? '?'} /></span
    >{/if}
</div>
