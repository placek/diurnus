<script lang="ts">
  import { app, ui } from '../state.svelte';
  import { bandAt } from '../lib/model';
  import { segments } from '../lib/segments';
  import { pad, qTime, rel } from '../lib/time';
  import type { Block as BlockT } from '../lib/types';
  import Block from './Block.svelte';

  interface Props {
    hour: number;
    /** indeks rzędu w widocznym oknie; 0 = pierwszy */
    row: number;
    blocks: BlockT[];
  }

  const { hour, row, blocks }: Props = $props();

  const band = $derived(bandAt(app.S.day.bands, hour));
  // Pierwszy rząd zawsze pokazuje nazwę pory, nawet gdy pora zaczęła się wcześniej.
  const bandStart = $derived(!!band && (band.from === hour || row === 0));

  const cells = $derived(
    [0, 1, 2, 3].map((c) => {
      const q = hour * 4 + c;
      const rr = rel(app.viewDay, q, q + 1, app.now);
      const f =
        rr === 'now'
          ? (app.now - qTime(app.viewDay, q)) /
            (qTime(app.viewDay, q + 1) - qTime(app.viewDay, q))
          : null;
      return { c, q, rr, f };
    }),
  );

  const nowCell = $derived(cells.find((x) => x.f !== null));
  const nowLeft = $derived(nowCell ? (nowCell.c + nowCell.f!) / 4 : null);

  // segments() z oknem jednej godziny zwraca dokładnie fragmenty dla tego rzędu.
  const segs = $derived(
    blocks.flatMap((b) =>
      segments(b.q, b.len, hour, hour + 1).map((seg) => ({ block: b, seg })),
    ),
  );
</script>

<div
  class="row"
  class:is-now={nowLeft !== null}
  class:band-start={bandStart && row > 0}
  style="--band:{band ? `var(--${band.color})` : 'transparent'}"
>
  <div class="hour">
    <span class="h">{pad(hour)}</span>
    {#if bandStart && band?.name}<span class="bn">{band.name}</span>{/if}
  </div>

  {#each cells as cell (cell.q)}
    <div
      class="cell q{cell.c} c-{cell.rr}"
      data-q={cell.q}
      style="grid-column:{cell.c + 2}{cell.f !== null ? `;--f:${cell.f.toFixed(4)}` : ''}"
    ></div>
  {/each}

  {#each segs as { block, seg } (block.id + ':' + seg.from)}
    <Block {block} {seg} {hour} />
  {/each}

  {#if ui.cursor.visible && Math.floor(ui.cursor.q / 4) === hour}
    <div class="kcur" style="grid-column:{(ui.cursor.q % 4) + 2}"></div>
  {/if}

  {#if nowLeft !== null}
    <div
      class="nowline"
      style="left:calc(var(--hourw) + (100% - var(--hourw)) * {nowLeft.toFixed(4)})"
    ></div>
  {/if}
</div>
