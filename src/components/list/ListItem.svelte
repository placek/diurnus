<script lang="ts">
  import { app, pushHistory, save, ui, currentDay } from '../../state.svelte';
  import { addItemAfter, addStep, focusItemEnd, tidySteps, cycleItemType, deleteItem, setItemText, splitToDesc } from '../../actions.svelte';
  import { colorOf, iconOf } from '../../lib/categories';
  import Icon from '../Icon.svelte';
  import { fmtQ } from '../../lib/time';
  import type { Item } from '../../lib/types';
  import { categoryOf, itemTone, kindOf, slotOf, todayList } from '../../lib/view';
  import Bullet from './Bullet.svelte';
  import ItemDesc from './ItemDesc.svelte';
  import ItemSteps from './ItemSteps.svelte';

  interface Props {
    item: Item;
  }

  const { item }: Props = $props();

  let el = $state<HTMLInputElement | null>(null);
  /** czy w tej pozycji padł już znak od ostatniego wejścia w nią */
  let dirty = false;
  /** fokus jest w tym wierszu (w tytule albo w opisie) — opis w całości */
  let rowFocus = $state(false);

  // Fokus jest stanem widokowym: mutator mówi, KTÓRA pozycja ma go dostać,
  // a przeniesienie go jest deklaracją tutaj — nie grzebaniem w DOM z mutatora.
  $effect(() => {
    if (ui.focusItem === item.id && el) {
      const at = Math.min(ui.focusCaret ?? el.value.length, el.value.length);
      el.focus();
      el.setSelectionRange(at, at);
      ui.focusItem = null;
      ui.focusCaret = null;
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

  /** Sąsiad w górę trafia w swój koniec — ostatni krok albo koniec opisu — jak w edytorze. */
  function focusSibling(offset: -1 | 1) {
    const target = siblings[index + offset];
    if (!target) return;
    if (offset === -1) focusItemEnd(target);
    else ui.focusItem = target.id;
  }

  /** Pod opisem: pierwszy krok, a bez kroków — następna pozycja. */
  function belowDesc() {
    if (item.steps?.length) ui.focusStep = { id: item.id, n: 0, at: 0 };
    else focusSibling(1);
  }

  function onKeydown(e: KeyboardEvent) {
    const input = e.currentTarget as HTMLInputElement;
    const at = input.selectionStart ?? 0;
    const collapsed = input.selectionStart === input.selectionEnd;

    // Ctrl+Enter: nowy krok, pierwszy pod opisem.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      addStep(item.id, 0);
      return;
    }
    // Shift+Enter: nowa linia pod tytułem — w opisie.
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      splitToDesc(item.id, at);
      return;
    }
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
    // Z końca tytułu w dół: najpierw opis, jeśli jest.
    if (e.key === 'ArrowDown' && at === input.value.length && collapsed && item.desc !== undefined) {
      e.preventDefault();
      ui.focusDesc = { id: item.id, at: 0 };
      return;
    }
    if (e.key === 'ArrowDown' && at === input.value.length && collapsed && item.steps?.length) {
      e.preventDefault();
      ui.focusStep = { id: item.id, n: 0, at: 0 };
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
  class:has-desc={item.desc !== undefined}
  class:has-steps={!!item.steps?.length}
  data-id={item.id}
  style={color ? `--c:var(--${color})` : undefined}
  onfocusin={() => (rowFocus = true)}
  onfocusout={(e) => {
    // Przejście między tytułem a opisem tej samej pozycji nie zwija opisu.
    const row = e.currentTarget as HTMLElement;
    const to = e.relatedTarget as Node | null;
    if (!to || !row.contains(to)) {
      rowFocus = false;
      // Puste kroki sprzątamy dopiero, gdy fokus naprawdę wyszedł. Menu znacznika
      // stoi w wierszu: zamknięte po „Dodaj krok" zabiera przycisk z fokusem, a
      // fokus zaraz wraca do wiersza — do nowego, pustego kroku.
      setTimeout(() => {
        if (!row.contains(document.activeElement)) tidySteps(item.id);
      });
    }
  }}
>
  <Bullet {item} />
  <input
    bind:this={el}
    class="item-text"
    enterkeyhint="enter"
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
  {#if item.steps?.length}<span class="item-meta item-steps-n" title="Kroki">{item.steps.filter((s) => s.done).length}/{item.steps.length}</span>{/if}
  {#if slot !== null}<span class="item-meta item-hour">{fmtQ(currentDay.value, slot)}</span>{/if}
  <!-- Ikona kategorii stoi na samym końcu, za czasem. -->
  {#if cat}<span class="item-cat" title={cat.name}
      ><Icon name={iconOf(app.S.cats, cat)} fallback={cat.name[0] ?? '?'} /></span
    >{/if}
  <ItemDesc
    {item}
    open={rowFocus}
    onEnter={() => addItemAfter(item.id)}
    onDown={belowDesc}
  />
  <ItemSteps
    {item}
    onExit={() => addItemAfter(item.id)}
    onUp={() => {
      if (item.desc !== undefined) ui.focusDesc = { id: item.id, at: -1 };
      else ui.focusItem = item.id;
    }}
    onDown={() => focusSibling(1)}
  />
</div>
