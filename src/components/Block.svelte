<script lang="ts">
  import { app, ui } from '../state.svelte';
  import { catOf, colorOf, iconOf, pathOf } from '../lib/categories';
  import { STATUS_LABEL } from '../lib/model';
  import { fmtQ, pad, qTime, rel } from '../lib/time';
  import type { Segment } from '../lib/segments';
  import type { Block } from '../lib/types';
  import Icon from './Icon.svelte';
  import {
    advance,
    canMoveTo,
    moveBlock,
    openEdit,
    qAtPoint,
    swallowNextClick,
  } from '../actions.svelte';

  interface Props {
    block: Block;
    seg: Segment;
    hour: number;
  }

  const { block, seg, hour }: Props = $props();

  const cat = $derived(catOf(app.S.cats, block.cat));
  const endQ = $derived(block.q + block.len);

  // Plan, któremu minął czas: widoczny, ale wyblakły — nie zniknął, tylko się nie wydarzył.
  const stale = $derived(
    block.status === 'planned' && rel(block.day, block.q, endQ, app.now) === 'past',
  );

  // Postęp liczony w obrębie SEGMENTU, nie całego bloku: pasek wypełnia się
  // osobno w każdym rzędzie, przez który blok przechodzi.
  const progress = $derived(
    block.status === 'active'
      ? Math.min(
          1,
          Math.max(
            0,
            (app.now - qTime(block.day, seg.from)) /
              (qTime(block.day, seg.to) - qTime(block.day, seg.from)),
          ),
        )
      : 0,
  );

  const countdown = $derived.by(() => {
    const left = Math.max(0, qTime(block.day, endQ) - app.now);
    return `${Math.floor(left / 60000)}:${pad(Math.floor(left / 1000) % 60)}`;
  });

  const tip = $derived(
    `${fmtQ(block.day, block.q)}–${fmtQ(block.day, endQ)}  ${pathOf(app.S.cats, cat)}` +
      `${block.title ? ': ' + block.title : ''} (${STATUS_LABEL[block.status]})`,
  );

  const iconName = $derived(iconOf(app.S.cats, cat));
  const letter = $derived(cat.name[0] ?? '?');

  /* ── Przeciąganie ──
     Blok reaguje na klik (awans), dwuklik i przytrzymanie (edycja) oraz
     przeciągnięcie (zmiana godziny). Tak jak przy znaczniku na liście
     rozróżnia je próg ruchu: dopiero po nim naciśnięcie staje się
     przeciąganiem, więc klik, który drgnął o piksel, nadal awansuje blok. */
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
    grab = under === null ? 0 : Math.max(0, Math.min(block.len - 1, under - block.q));
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
    ui.blockDrag = { id: block.id, len: block.len, q, ok: q !== null && canMoveTo(block.id, q) };
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
    if (!drag || drag.q === null || drag.q === block.q) return;
    moveBlock(block.id, drag.q);
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
  class="blk st-{block.status}"
  class:first={seg.first}
  class:last={seg.last}
  class:stale
  class:hl={ui.hover === block.id}
  class:is-dragging={ui.blockDrag?.id === block.id}
  data-id={block.id}
  title={tip}
  role="presentation"
  style="grid-column:{seg.from - hour * 4 + 2}/span {seg.to - seg.from};--c:var(--{colorOf(
    app.S.cats,
    cat,
  )});--p:{progress.toFixed(4)}"
  onmouseenter={() => (ui.hover = block.id)}
  onmouseleave={() => (ui.hover = null)}
  onclick={() => advance(block)}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  ondblclick={() => openEdit(block.id)}
  oncontextmenu={(e) => {
    e.preventDefault();
    openEdit(block.id);
  }}
>
  {#if seg.first}
    <Icon name={iconName} fallback={letter} />
    <span class="t">{block.title || cat.name}</span>
    {#if block.status === 'active'}<span class="cd">{countdown}</span>{/if}
  {:else}
    <span class="cont"><Icon name={iconName} fallback={letter} /></span>
  {/if}
</div>
