<script lang="ts">
  import { MARK } from '../../lib/items';
  import {
    migrateItem,
    migrateToTomorrow,
    moveItemTo,
    setItemType,
    toggleBlockDone,
  } from '../../actions.svelte';
  import { app, ui } from '../../state.svelte';
  import { shiftDay } from '../../lib/time';
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

  const IN_PLACE: { type: ItemType; label: string }[] = [
    { type: 'task', label: 'Zadanie' },
    { type: 'done', label: 'Wykonane' },
    { type: 'note', label: 'Notatka' },
  ];
  const MOVES: { type: ItemType; label: string }[] = [
    { type: 'migrated', label: 'Na jutro' },
    { type: 'scheduled', label: 'Na dzień…' },
  ];

  // Pozycja powiązana nie ma własnych znaczników „na miejscu" — jej znacznik
  // jest statusem bloku. Zostają tylko przeniesienia, które nadal mają sens.
  const TYPES = $derived(item.block ? MOVES : [...IN_PLACE, ...MOVES]);

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
    if (item.block) toggleBlockDone(item.id);
    else setItemType(item.id, item.type === 'done' ? 'task' : 'done');
  }

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
  </div>
{/if}
