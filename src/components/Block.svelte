<script lang="ts">
  import { app, ui } from '../state.svelte';
  import { catOf, colorOf, iconOf, pathOf } from '../lib/categories';
  import { STATUS_LABEL } from '../lib/model';
  import { fmtQ, pad, qTime, rel } from '../lib/time';
  import type { Segment } from '../lib/segments';
  import type { Block } from '../lib/types';
  import Icon from './Icon.svelte';

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
</script>

<div
  class="blk st-{block.status}"
  class:first={seg.first}
  class:last={seg.last}
  class:stale
  class:hl={ui.hover === block.id}
  data-id={block.id}
  title={tip}
  role="presentation"
  style="grid-column:{seg.from - hour * 4 + 2}/span {seg.to - seg.from};--c:var(--{colorOf(
    app.S.cats,
    cat,
  )});--p:{progress.toFixed(4)}"
  onmouseenter={() => (ui.hover = block.id)}
  onmouseleave={() => (ui.hover = null)}
>
  {#if seg.first}
    <Icon name={iconName} fallback={letter} />
    <span class="t">{block.title || cat.name}</span>
    {#if block.status === 'active'}<span class="cd">{countdown}</span>{/if}
  {:else}
    <span class="cont"><Icon name={iconName} fallback={letter} /></span>
  {/if}
</div>
