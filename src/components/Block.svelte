<script lang="ts">
  import { app, currentDay, ui } from '../state.svelte';
  import { colorOf, iconOf, pathOf } from '../lib/categories';
  import { SLOT_LEN } from '../lib/machine';
  import type { Item } from '../lib/machine';
  import { NO_CAT_COLOR } from '../lib/stats';
  import { fmtQ, pad, qTime } from '../lib/time';
  import type { Segment } from '../lib/segments';
  import { categoryOf, isDone, itemTone, slotOf } from '../lib/view';
  import type { Tone } from '../lib/view';
  import Icon from './Icon.svelte';
  import {
    canMoveTo,
    moveBlock,
    openEdit,
    qAtPoint,
    swallowNextClick,
    toggleDone,
  } from '../actions.svelte';

  interface Props {
    /** dzisiejsze zadanie ze slotem — siatka jest ich rzutem */
    item: Item;
    seg: Segment;
    hour: number;
  }

  const { item, seg, hour }: Props = $props();

  const day = $derived(currentDay.value);
  const slot = $derived(slotOf(item)!);
  const endQ = $derived(slot + SLOT_LEN);
  const cat = $derived(categoryOf(item, app.S.cats));
  const color = $derived(cat ? colorOf(app.S.cats, cat) : NO_CAT_COLOR);

  // Czas zmienia wygląd, nigdy stan: wykonanie oznacza tylko użytkownik.
  const tone = $derived(itemTone(item, day, app.now));
  const STATUS_CLASS: Record<Tone, string> = {
    done: 'st-confirmed',
    active: 'st-active',
    missed: 'st-planned',
    incoming: 'st-planned',
    note: 'st-planned',
  };
  const TONE_LABEL: Record<Tone, string> = {
    done: 'wykonane',
    active: 'teraz',
    missed: 'minęło',
    incoming: 'plan',
    note: 'notatka',
  };

  // Postęp liczony w obrębie SEGMENTU, nie całego slotu: pasek wypełnia się
  // osobno w każdym rzędzie, przez który slot przechodzi.
  const progress = $derived(
    tone === 'active'
      ? Math.min(
          1,
          Math.max(
            0,
            (app.now - qTime(day, seg.from)) / (qTime(day, seg.to) - qTime(day, seg.from)),
          ),
        )
      : 0,
  );

  const countdown = $derived.by(() => {
    const left = Math.max(0, qTime(day, endQ) - app.now);
    return `${Math.floor(left / 60000)}:${pad(Math.floor(left / 1000) % 60)}`;
  });

  const label = $derived(item.text || cat?.name || 'Bez kategorii');
  const tip = $derived(
    `${fmtQ(day, slot)}–${fmtQ(day, endQ)}  ${cat ? pathOf(app.S.cats, cat) : 'Bez kategorii'}` +
      `${item.text ? ': ' + item.text : ''} (${TONE_LABEL[tone]})`,
  );

  const iconName = $derived(cat ? iconOf(app.S.cats, cat) : '');
  const letter = $derived(cat?.name[0] ?? '·');

  /* ── Przeciąganie ──
     Blok reaguje na klik (wykonane ↔ otwarte), dwuklik i przytrzymanie
     (edycja) oraz przeciągnięcie (zmiana godziny). Tak jak przy znaczniku na
     liście rozróżnia je próg ruchu: dopiero po nim naciśnięcie staje się
     przeciąganiem, więc klik, który drgnął o piksel, nadal przełącza. */
  const THRESHOLD = 4;

  let startX = 0;
  let startY = 0;
  /** o ile kwantów od początku bloku chwycono — blok idzie za kursorem, nie skacze do niego */
  let grab = 0;
  let dragging = false;

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return; // prawy przycisk należy do edycji
    startX = e.clientX;
    startY = e.clientY;
    dragging = false;
    const under = qAtPoint(e.clientX, e.clientY);
    grab = under === null ? 0 : Math.max(0, Math.min(SLOT_LEN - 1, under - slot));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (!el.hasPointerCapture(e.pointerId)) return;

    if (!dragging) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return;
      dragging = true;
      ui.hover = null;
    }
    const under = qAtPoint(e.clientX, e.clientY);
    const q = under === null ? null : under - grab;
    // Wykonane zadanie nie zmienia godziny — cel świeci na czerwono.
    const ok = q !== null && !isDone(item) && canMoveTo(item.id, q);
    ui.blockDrag = { id: item.id, len: SLOT_LEN, q, ok };
  }

  function onPointerUp(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!dragging) return;

    dragging = false;
    swallowNextClick(); // po przeciągnięciu i tak przyjdzie click
    const drag = ui.blockDrag;
    ui.blockDrag = null;
    // Upuszczenie poza siatką albo na zajęte miejsce nic nie zmienia — cel
    // był widoczny jako duch, więc brak ruchu jest odpowiedzią.
    if (!drag || drag.q === null || drag.q === slot) return;
    moveBlock(item.id, drag.q);
  }

  /** Przerwane przez system (np. gest przeglądarki): nic nie przenosimy. */
  function onPointerCancel(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!dragging) return;
    dragging = false;
    swallowNextClick();
    ui.blockDrag = null;
  }
</script>

<div
  class="blk {STATUS_CLASS[tone]}"
  class:first={seg.first}
  class:last={seg.last}
  class:stale={tone === 'missed'}
  class:no-cat={!cat}
  class:hl={ui.hover === item.id}
  class:is-dragging={ui.blockDrag?.id === item.id}
  data-id={item.id}
  title={tip}
  role="presentation"
  style="grid-column:{seg.from - hour * 4 + 2}/span {seg.to -
    seg.from};--c:var(--{color});--p:{progress.toFixed(4)}"
  onmouseenter={() => (ui.hover = item.id)}
  onmouseleave={() => (ui.hover = null)}
  onclick={() => toggleDone(item.id)}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  ondblclick={() => openEdit(item.id)}
  oncontextmenu={(e) => {
    e.preventDefault();
    openEdit(item.id);
  }}
>
  {#if seg.first}
    <Icon name={iconName} fallback={letter} />
    <span class="t">{label}</span>
    {#if tone === 'active'}<span class="cd">{countdown}</span>{/if}
  {:else}
    <span class="cont"><Icon name={iconName} fallback={letter} /></span>
  {/if}
</div>
