<script lang="ts">
  import { MARK } from '../../lib/items';
  import {
    completeBacklogItem,
    setRepeat,
    moveItemTo,
    setItemType,
    toggleBlockDone,
  } from '../../actions.svelte';
  import { isBacklog } from '../../lib/backlog';
  import { describeRepeat } from '../../lib/repeat';
  import { splitDay } from '../../lib/time';
  import type { Repeat } from '../../lib/types';
  import { app, currentDay, ui } from '../../state.svelte';
  import type { Item, ItemType } from '../../lib/types';

  interface Props {
    item: Item;
    /** pozycja powiązana nie przeciąga się — jej miejsce to jej godzina */
    draggable?: boolean;
  }

  const { item, draggable = true }: Props = $props();

  let menu = $state(false);

  // Menu otwiera prawy przycisk, więc zwykły klik nie zamknie go od razu
  // po otwarciu; bez tego nasłuchu nie ma z niego wyjścia poza wyborem typu.
  $effect(() => {
    if (!menu) return;
    const close = () => (menu = false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  });

  // Pozycja powiązana nie ma własnych znaczników — jej znacznik jest statusem
  // bloku, więc menu jest dla niej puste. Przenoszenie odbywa się
  // przeciągnięciem do backlogu, nie z tego menu.
  const IN_PLACE: { type: ItemType; label: string }[] = [
    { type: 'task', label: 'Zadanie' },
    { type: 'done', label: 'Wykonane' },
    { type: 'note', label: 'Notatka' },
  ];

  const TYPES = $derived(item.block ? [] : IN_PLACE);

  // Wzorce budowane z dzisiejszej daty — „co poniedziałek" znaczy ten dzień
  // tygodnia, „3. każdego miesiąca" ten dzień miesiąca. Bez osobnego formularza.
  const inBacklog = $derived(isBacklog(item, currentDay.value));
  const REPEATS = $derived.by((): (Repeat | undefined)[] => {
    if (!inBacklog) return [];
    const [, month, dom] = splitDay(currentDay.value);
    const weekday = new Date(app.now).getDay();
    return [
      { kind: 'daily' },
      { kind: 'weekly', weekday },
      { kind: 'monthly', dayOfMonth: dom },
      { kind: 'yearly', month, dayOfMonth: dom },
      undefined,
    ];
  });

  /* ── Przeciąganie ──
     Znacznik pełni trzy role: klik przełącza zadanie/wykonane, prawy przycisk
     otwiera menu, a przeciągnięcie przestawia pozycję. Rozróżnia je próg
     ruchu — dopiero po nim naciśnięcie staje się przeciąganiem, więc klik,
     który drgnął o piksel, nadal przełącza znacznik. */
  const THRESHOLD = 4;

  let startX = 0;
  let startY = 0;
  let dragging = false;
  let suppressClick = false;

  /** Miejsce wstawienia w liście dnia BEZ przeciąganej pozycji: liczba
   *  pozostałych wierszy, których środek jest powyżej kursora. */
  function insertionIndex(y: number, skipId: string): number {
    const rows = [...document.querySelectorAll<HTMLElement>('#list .item[data-id]')].filter(
      (r) => r.dataset.id !== skipId,
    );
    let idx = 0;
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (y > r.top + r.height / 2) idx++;
    }
    return idx;
  }

  function onPointerDown(e: PointerEvent) {
    if (!draggable) return; // pozycja powiązana: jej miejsce to jej godzina
    if (e.button !== 0) return; // prawy przycisk należy do menu
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el.hasPointerCapture(e.pointerId)) return;

    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return;
      dragging = true;
      menu = false;
    }
    ui.drag = { id: item.id, toIndex: insertionIndex(e.clientY, item.id) };
  }

  function onPointerUp(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!dragging) return;

    dragging = false;
    suppressClick = true; // po przeciągnięciu i tak przyjdzie click
    const drag = ui.drag;
    ui.drag = null;
    if (drag) moveItemTo(drag.id, drag.toIndex);
  }

  function onClick() {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    // Trzy konteksty, trzy znaczenia kliknięcia w znacznik.
    if (item.block) toggleBlockDone(item.id);
    else if (isBacklog(item, currentDay.value)) completeBacklogItem(item.id);
    else setItemType(item.id, item.type === 'done' ? 'task' : 'done');
  }

  function choose(type: ItemType) {
    menu = false;
    setItemType(item.id, type);
  }
</script>

<!-- Klik przełącza TYLKO zadanie ↔ wykonane: to ruch wykonywany kilkadziesiąt
     razy dziennie i nie może wymagać celowania w menu. Reszta typów siedzi
     pod prawym przyciskiem, bo dwa z nich zapisują do listy innego dnia. -->
<button
  class="bullet t-{item.type}"
  class:is-repeat={!!item.repeat}
  aria-label="Znacznik: {item.type}"
  onclick={onClick}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
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
    {#each REPEATS as r, i (i)}
      <button
        role="menuitem"
        class:sel={r === undefined ? !item.repeat : JSON.stringify(r) === JSON.stringify(item.repeat)}
        onclick={() => {
          menu = false;
          setRepeat(item.id, r);
        }}
      >
        <span class="bm-mark">{r ? '○' : '·'}</span>{r ? describeRepeat(r) : 'bez powtarzania'}
      </button>
    {/each}
  </div>
{/if}
