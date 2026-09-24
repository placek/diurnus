<script lang="ts">
  import { app, ui, currentDay } from '../state.svelte';
  import { bandAt } from '../lib/model';
  import { segments } from '../lib/segments';
  import { pad, qTime, rel } from '../lib/time';
  import type { Block as BlockT } from '../lib/types';
  import Block from './Block.svelte';
  import { actAt } from '../actions.svelte';

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
      const rr = rel(currentDay.value, q, q + 1, app.now);
      const f =
        rr === 'now'
          ? (app.now - qTime(currentDay.value, q)) /
            (qTime(currentDay.value, q + 1) - qTime(currentDay.value, q))
          : null;
      return { c, q, rr, f };
    }),
  );

  const nowCell = $derived(cells.find((x) => x.f !== null));
  const nowLeft = $derived(nowCell ? (nowCell.c + nowCell.f!) / 4 : null);

  // segments() z oknem jednej godziny zwraca dokładnie fragmenty dla tego rzędu.
  // Podgląd miejsca, które zajmie blok tworzony z otwartego menu.
  const ghost = $derived(
    ui.menu ? segments(ui.menu.fit.q, ui.menu.fit.len, hour, hour + 1) : [],
  );

  // Podgląd miejsca, na które spadnie przeciągany blok; `bad` = zajęte albo
  // poza oknem dnia — blok tam nie wyląduje, ale użytkownik widzi, dlaczego.
  const drop = $derived(
    ui.blockDrag && ui.blockDrag.q !== null
      ? segments(ui.blockDrag.q, ui.blockDrag.len, hour, hour + 1).map((seg) => ({
          seg,
          ok: ui.blockDrag!.ok,
        }))
      : [],
  );

  const segs = $derived(
    blocks.flatMap((b) =>
      segments(b.q, b.len, hour, hour + 1).map((seg) => ({ block: b, seg })),
    ),
  );
</script>

<div
  class="row"
  class:is-now={nowLeft !== null}
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
      role="presentation"
      style="grid-column:{cell.c + 2}{cell.f !== null ? `;--f:${cell.f.toFixed(4)}` : ''}"
      onclick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        actAt(cell.q, r.left + r.width / 2, r.top + r.height / 2);
      }}
    ></div>
  {/each}

  {#each ghost as g (g.from)}
    <div
      class="blk ghost"
      class:first={g.first}
      class:last={g.last}
      style="grid-column:{g.from - hour * 4 + 2}/span {g.to - g.from}"
    ></div>
  {/each}

  {#each drop as { seg, ok } (seg.from)}
    <div
      class="blk ghost drop"
      class:bad={!ok}
      class:first={seg.first}
      class:last={seg.last}
      style="grid-column:{seg.from - hour * 4 + 2}/span {seg.to - seg.from}"
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
