<script lang="ts">
  import { MARK } from '../../lib/items';
  import {
    completeBacklogItem,
    pullToToday,
    scheduleItem,
    setRepeat,
    moveItemTo,
    setItemType,
    toggleBlockDone,
  } from '../../actions.svelte';
  import { isBacklog } from '../../lib/backlog';
  import { describeRepeat } from '../../lib/repeat';
  import { shiftDay, splitDay } from '../../lib/time';
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
  let menuX = $state(0);
  let menuY = $state(0);
  let menuEl = $state<HTMLElement | null>(null);

  // Menu jest `fixed`, a nie `absolute`: oba panele mają overflow, a element
  // pozycjonowany bezwzględnie wewnątrz .item (flex, align-items:center)
  // dostaje pozycję statyczną W PIONIE NA ŚRODKU wiersza — więc połowa menu
  // wychodziła nad wiersz i była obcinana przy górnych pozycjach listy.
  // Współrzędne z kliknięcia plus przycięcie do okna działają wszędzie.
  $effect(() => {
    if (!menu || !menuEl) return;
    const pad = 8;
    const r = menuEl.getBoundingClientRect();
    const x = Math.max(pad, Math.min(menuX, innerWidth - pad - r.width));
    const y = Math.max(pad, Math.min(menuY, innerHeight - pad - r.height));
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
  });

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
  // Terminy jako gotowe wybory; „wybierz datę…" otwiera okienko dla reszty.
  type DateChoice = { label: string; day: string | null } | 'pick';
  const DATES = $derived.by((): DateChoice[] => {
    if (!inBacklog) return [];
    return [
      { label: 'jutro', day: shiftDay(currentDay.value, 1) },
      { label: 'za tydzień', day: shiftDay(currentDay.value, 7) },
      'pick',
      { label: 'bez daty', day: null },
    ];
  });

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
  // Pozycja powiązana nie ma czego pokazać w menu: jej znacznik jest statusem
  // bloku, terminy i powtarzalność należą do backlogu. Pusta ramka byłaby
  // gorsza niż brak reakcji, więc nie przechwytujemy prawego przycisku.
  const hasMenu = $derived(TYPES.length + DATES.length + REPEATS.length > 0);

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
    if (!draggable) return;
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

  /** Panel pod kursorem decyduje, czy to przestawienie, czy przeniesienie. */
  function paneUnder(x: number, y: number): 'list' | 'backlog' | null {
    // Brak elementsFromPoint (starsze środowiska, jsdom) znaczy „nie wiem",
    // a nie wiedzieć = zostań w swoim panelu. Przestawienie jest bezpieczne.
    if (typeof document.elementsFromPoint !== 'function') return null;
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.id === 'backlog') return 'backlog';
      if (el.id === 'list') return 'list';
    }
    return null;
  }

  function onPointerUp(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!dragging) return;

    dragging = false;
    suppressClick = true; // po przeciągnięciu i tak przyjdzie click
    const drag = ui.drag;
    ui.drag = null;
    if (!drag) return;

    const target = paneUnder(e.clientX, e.clientY);
    const from = inBacklog ? 'backlog' : 'list';

    if (target === from || target === null) {
      // Pozycja powiązana nie przestawia się — jej miejsce to jej godzina.
      // Przeciągnąć ją jednak wolno: to jedyna droga do odłożenia bloku.
      if (!item.block) moveItemTo(drag.id, drag.toIndex);
      return;
    }
    if (target === 'backlog') {
      // Bez pytania: rzecz odłożona jest najpierw „kiedyś". Termin nadaje się
      // osobno, z menu znacznika — tak samo jak powtarzalność.
      scheduleItem(drag.id, null);
      return;
    }
    pullToToday(drag.id, e.clientX, e.clientY);
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
    if (!hasMenu) return;
    e.preventDefault();
    menuX = e.clientX;
    menuY = e.clientY;
    menu = !menu;
  }}>{MARK[item.type]}</button
>

{#if menu}
  <div bind:this={menuEl} class="bullet-menu" role="menu" style="left:{menuX}px;top:{menuY}px">
    {#each TYPES as t (t.type)}
      <button role="menuitem" class:sel={t.type === item.type} onclick={() => choose(t.type)}>
        <span class="bm-mark">{MARK[t.type]}</span>{t.label}
      </button>
    {/each}
    {#each DATES as d, i (i)}
      <button
        role="menuitem"
        onclick={() => {
          menu = false;
          if (d === 'pick') ui.datePrompt = { itemId: item.id, x: menuX, y: menuY };
          else scheduleItem(item.id, d.day);
        }}
      >
        <span class="bm-mark">{d === 'pick' ? '…' : '→'}</span>{d === 'pick' ? 'wybierz datę…' : d.label}
      </button>
    {/each}
    {#if DATES.length}<div class="bm-sep"></div>{/if}

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
