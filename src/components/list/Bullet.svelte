<script lang="ts">
  import { MARK } from '../../lib/items';
  import {
    completeBacklogItem,
    moveItemTo,
    moveToBacklog,
    moveToToday,
    openCategoryMenu,
    scheduleItem,
    setItemType,
    setRepeat,
    toggleDone,
  } from '../../actions.svelte';
  import { describeRepeat } from '../../lib/repeat';
  import { isBacklog as inBacklogPane, kindOf, openFree, slotOf, whenOf } from '../../lib/view';
  import { shiftDay, splitDay } from '../../lib/time';
  import type { Repeat } from '../../lib/types';
  import { app, currentDay, ui } from '../../state.svelte';
  import type { Item, ItemType } from '../../lib/types';

  interface Props {
    item: Item;
  }

  const { item }: Props = $props();

  const kind = $derived(kindOf(item));
  const rule = $derived.by(() => {
    const w = whenOf(item);
    return w?.type === 'recurring' ? w.rule : undefined;
  });

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

  // Znaczniki w miejscu. Notatka nie ma czasu, więc zadanie ze slotem jej nie
  // proponuje; w backlogu „wykonane" nie jest znacznikiem, tylko kliknięciem,
  // które przenosi rzecz do dziś.
  const IN_PLACE: { type: ItemType; label: string }[] = [
    { type: 'task', label: 'Zadanie' },
    { type: 'done', label: 'Wykonane' },
    { type: 'note', label: 'Notatka' },
  ];

  const TYPES = $derived(
    IN_PLACE.filter(
      (t) =>
        !(inBacklog && t.type === 'done') &&
        !(t.type === 'note' && (slotOf(item) !== null || whenOf(item) !== null)),
    ),
  );


  // Wzorce budowane z dzisiejszej daty — „co poniedziałek" znaczy ten dzień
  // tygodnia, „3. każdego miesiąca" ten dzień miesiąca. Bez osobnego formularza.
  const inBacklog = $derived(inBacklogPane(item));
  // Terminy jako gotowe wybory; „wybierz datę…" otwiera okienko dla reszty.
  type DateChoice = { label: string; day: string | null } | 'pick';
  const DATES = $derived.by((): DateChoice[] => {
    if (!inBacklog || kind === 'note') return [];
    return [
      { label: 'jutro', day: shiftDay(currentDay.value, 1) },
      { label: 'za tydzień', day: shiftDay(currentDay.value, 7) },
      'pick',
      { label: 'bez daty', day: null },
    ];
  });

  const REPEATS = $derived.by((): (Repeat | undefined)[] => {
    if (!inBacklog || kind === 'note') return [];
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
  // Kategoria jest zawsze do wyboru, więc menu nigdy nie jest puste.
  const hasMenu = true;

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

  /** Miejsce wstawienia wśród przestawialnych pozycji dnia BEZ przeciąganej:
   *  liczba pozostałych takich wierszy, których środek jest powyżej kursora.
   *  Wykonane i zadania ze slotem stoją nad nimi, ale się nie liczą — indeks
   *  dotyczy tej samej listy co `moveFree` i kreska wstawienia. */
  function insertionIndex(y: number, skipId: string): number {
    const movable = new Set(openFree(app.S.items).map((i) => i.id));
    const rows = [...document.querySelectorAll<HTMLElement>('#list .item[data-id]')].filter(
      (r) => r.dataset.id !== skipId && movable.has(r.dataset.id!),
    );
    let idx = 0;
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (y > r.top + r.height / 2) idx++;
    }
    return idx;
  }

  function onPointerDown(e: PointerEvent) {
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
      // Przestawiają się tylko pozycje swobodne dziś; zadanie ze slotem ma
      // miejsce wyznaczone godziną, a backlog układa się sam według terminów.
      if (from === 'list') moveItemTo(drag.id, drag.toIndex);
      return;
    }
    // Między polami: maszyna decyduje, co przechodzi i z jakim czasem.
    if (target === 'backlog') moveToBacklog(drag.id);
    else moveToToday(drag.id);
  }

  function onClick() {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    // W backlogu kliknięcie to „zrobione" i przeniesienie do dziś; w dziś
    // przełącza wykonane ↔ otwarte. Notatka nie ma czego przełączać.
    if (kind === 'note') return;
    if (inBacklog) completeBacklogItem(item.id);
    else toggleDone(item.id);
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
  class="bullet t-{kind}"
  class:is-repeat={!!rule}
  aria-label="Znacznik: {kind}"
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
  }}>{MARK[kind]}</button
>

{#if menu}
  <div bind:this={menuEl} class="bullet-menu" role="menu" style="left:{menuX}px;top:{menuY}px">
    {#each TYPES as t (t.type)}
      <button role="menuitem" class:sel={t.type === kind} onclick={() => choose(t.type)}>
        <span class="bm-mark">{MARK[t.type]}</span>{t.label}
      </button>
    {/each}
    <!-- Jedna pozycja, jedna kategoria: ta sama na liście i na siatce. -->
    <button
      role="menuitem"
      onclick={() => {
        menu = false;
        openCategoryMenu(item.id, menuX, menuY);
      }}
    >
      <span class="bm-mark">#</span>Kategoria…
    </button>
    <div class="bm-sep"></div>

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
        class:sel={r === undefined ? !rule : JSON.stringify(r) === JSON.stringify(rule)}
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
