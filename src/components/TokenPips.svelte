<script lang="ts">
  import type { TokenStats } from '../lib/stats';
  import { fmtDur } from '../lib/time';

  interface Props {
    stats: TokenStats;
  }

  const { stats }: Props = $props();

  // Jeden pip = pół godziny = dwa kwanty. Wykonane idą pierwsze, potem plan,
  // reszta zostaje pusta — pasek czyta się jako "ile doby już rozdysponowano".
  const cells = $derived.by(() => {
    const filled: { kind: 'd' | 'p'; color: string }[] = [
      ...stats.done.map((color) => ({ kind: 'd' as const, color })),
      ...stats.plan.map((color) => ({ kind: 'p' as const, color })),
    ].slice(0, stats.totalQ);
    const out: ({ kind: 'd' | 'p'; color: string } | null)[] = [...filled];
    while (out.length < stats.totalQ) out.push(null);
    return out;
  });

  const pips = $derived(
    Array.from({ length: Math.ceil(cells.length / 2) }, (_, i) => cells.slice(i * 2, i * 2 + 2)),
  );

  const tip = $derived(
    stats.perCat.length
      ? stats.perCat
          .map(
            (c) =>
              `${c.name}: ${fmtDur(c.quanta * 15)}` +
              (c.kids.length
                ? ` (${c.kids.map((k) => `${k.name} ${fmtDur(k.quanta * 15)}`).join(', ')})`
                : ''),
          )
          .join('\n')
      : 'Brak wykonanych slotów',
  );
</script>

<div class="tokens" id="tokens" title={tip}>
  <div class="pips" id="pips">
    {#each pips as pair, i (i)}
      <span class="pip">
        {#each pair as cell, j (j)}
          <b class={cell ? cell.kind : ''} style={cell ? `--c:var(--${cell.color})` : ''}></b>
        {/each}
      </span>
    {/each}
  </div>
</div>
