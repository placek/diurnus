<script lang="ts">
  import { app, pushHistory, save, ui } from '../../state.svelte';
  import { addItemAfter, cycleItemType, deleteItem, setItemText } from '../../actions.svelte';
  import { blockOfItem, freeItems, linkedItems } from '../../lib/link';
  import { catOf, colorOf } from '../../lib/categories';
  import { fmtQ } from '../../lib/time';
  import type { Item } from '../../lib/types';
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

  const block = $derived(blockOfItem(app.S.blocks, item));
  const cat = $derived(block ? catOf(app.S.cats, block.cat) : null);
  // Godzina i kolor są wyliczane z bloku, nie przechowywane w pozycji: zmiana
  // kategorii bloku przebarwia pozycję sama, bez trzeciego pola do rozjechania.
  const color = $derived(cat ? colorOf(app.S.cats, cat) : null);

  // Nawigacja klawiszami idzie przez OBIE grupy w kolejności wyświetlania:
  // powiązane według godzin, potem swobodne. Liczenie samych swobodnych
  // dawało dla pozycji powiązanej index -1 i strzałki przestawały działać.
  const siblings = $derived([
    ...linkedItems(app.S.items, app.S.blocks, app.viewDay),
    ...freeItems(app.S.items, app.viewDay),
  ]);
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
  class="item t-{item.type}"
  class:is-linked={!!block}
  class:is-dragging={ui.drag?.id === item.id}
  data-id={item.id}
  style={color ? `--c:var(--${color})` : undefined}
>
  <Bullet {item} draggable={!block} />
  {#if block}<span class="item-hour">{fmtQ(block.day, block.q)}</span>{/if}
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
  {#if item.movedTo}<span class="item-moved">→ {item.movedTo.slice(5)}</span>{/if}
</div>
