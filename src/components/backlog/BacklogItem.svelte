<script lang="ts">
  import { app, currentDay, pushHistory, save, ui } from '../../state.svelte';
  import { addItemAfter, addStep, focusItemEnd, tidySteps, deleteItem, setItemText, splitToDesc } from '../../actions.svelte';
  import { describeRule } from '../../lib/rrule';
  import { colorOf, iconOf } from '../../lib/categories';
  import Icon from '../Icon.svelte';
  import { fmtQ } from '../../lib/time';
  import type { Item } from '../../lib/types';
  import { backlogOrder, categoryOf, itemTone, kindOf, soonOf, whenOf } from '../../lib/view';
  import Bullet from '../list/Bullet.svelte';
  import ItemDesc from '../list/ItemDesc.svelte';
  import ItemSteps from '../list/ItemSteps.svelte';

  interface Props {
    item: Item;
  }

  const { item }: Props = $props();

  let el = $state<HTMLInputElement | null>(null);
  let dirty = false;
  /** fokus jest w tym wierszu (w tytule albo w opisie) — opis w całości */
  let rowFocus = $state(false);

  $effect(() => {
    if (ui.focusItem === item.id && el) {
      const at = Math.min(ui.focusCaret ?? el.value.length, el.value.length);
      el.focus();
      el.setSelectionRange(at, at);
      ui.focusItem = null;
      ui.focusCaret = null;
    }
  });

  // Ten sam schemat barw co lista dnia. Pozycja backlogu nie ma slotu dziś, więc
  // ton wynika z samego typu; godzina (data z porą albo wzorzec z porą) daje tło
  // bloku, tak jak slot na liście dnia.
  const tone = $derived(itemTone(item, currentDay.value, app.now));
  const cat = $derived(categoryOf(item, app.S.cats));
  const color = $derived(cat ? colorOf(app.S.cats, cat) : null);
  const timed = $derived.by(() => {
    const w = whenOf(item);
    return !!w && w.type !== 'date' && w.slot !== null;
  });

  // Kolejność wyświetlania: sekcja po sekcji (pozycje spoza projektów, potem projekty).
  const siblings = $derived(backlogOrder(app.S.items, app.S.cats));
  const index = $derived(siblings.findIndex((i) => i.id === item.id));

  const fmtShort = new Intl.DateTimeFormat('pl-PL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const fmtDay = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return fmtShort.format(new Date(y!, m! - 1, d!)).replace(',', '');
  };

  // Metryka mówi, co o pozycji wiadomo: wzorzec, albo data i ewentualna pora.
  const meta = $derived.by(() => {
    const w = whenOf(item);
    if (!w) return '';
    if (w.type === 'recurring')
      return w.slot === null
        ? describeRule(w.rule, { left: true })
        : `${describeRule(w.rule, { left: true })} ${fmtQ(currentDay.value, w.slot)}`;
    return w.type === 'dateSlot' ? `${fmtDay(w.date)} ${fmtQ(w.date, w.slot)}` : fmtDay(w.date);
  });

  // Termin w najbliższych dniach: słowo „jutro", „za 3 dni"… w barwie od czerwieni do żółci.
  const soon = $derived(soonOf(item, currentDay.value));

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
    if (e.key === 'Backspace' && at === 0 && collapsed && input.value === '') {
      e.preventDefault();
      deleteItem(item.id, siblings[index - 1]?.id ?? null);
      return;
    }
    if (e.key === 'ArrowUp' && at === 0 && collapsed && index > 0) {
      e.preventDefault();
      focusSibling(-1);
      return;
    }
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
    if (e.key === 'ArrowDown' && at === input.value.length && collapsed && index < siblings.length - 1) {
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
  class="item backlog-item t-{kindOf(item)} tone-{tone}"
  class:is-linked={timed}
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
  {#if item.steps?.length}<span class="item-meta item-steps-n" title="Kroki">{item.steps.filter((s) => s.done).length}/{item.steps.length}</span>{/if}
  {#if soon}<b class="backlog-soon soon-{Math.max(soon.days, 1)}">{soon.label}</b>{/if}
  {#if meta}<span class="item-meta backlog-meta">{meta}</span>{/if}
  <!-- Ikona kategorii stoi na samym końcu, za terminem. -->
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
