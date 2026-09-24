<script lang="ts">
  import { app, ui, currentDay } from '../state.svelte';
  import { chooseCat, closeMenu } from '../actions.svelte';
  import { catOf, colorOf, iconOf, kids, topCats } from '../lib/categories';
  import { fmtQ } from '../lib/time';
  import { ringLayout } from '../lib/radial';
  import Icon from './Icon.svelte';

  const MODE_LABEL = { past: 'wstecz', now: 'start', future: 'plan' } as const;

  interface Props {
    menu: NonNullable<typeof ui.menu>;
  }

  const { menu }: Props = $props();

  const items = $derived(menu.level ? kids(app.S.cats, menu.level) : topCats(app.S.cats));
  const parent = $derived(menu.level ? catOf(app.S.cats, menu.level) : null);

  // Geometria pierścienia i wsunięcie w widok liczy się w lib/radial.ts.
  const layout = $derived(ringLayout(items.length, menu.x, menu.y, innerWidth, innerHeight));
  const placed = $derived(items.map((cat, i) => ({ cat, i, ...layout.items[i]! })));
</script>

<div id="scrim" onclick={closeMenu} role="presentation"></div>

<div id="radial" style="left:{layout.x}px;top:{layout.y}px">
  {#if parent}
    <button
      class="rc pick"
      style="--c:var(--{colorOf(app.S.cats, parent)})"
      aria-label="{parent.name} ogólnie"
      onclick={() => chooseCat(parent.id)}
    >
      <Icon name={iconOf(app.S.cats, parent)} fallback={parent.name[0] ?? '?'} />
      <div class="rl">{parent.name}</div>
      <span class="k">0</span>
    </button>
  {:else}
    <div class="rc">
      <div class="rt">{fmtQ(currentDay.value, menu.fit.q)}</div>
      <div class="rl">{MODE_LABEL[menu.rel]}</div>
    </div>
  {/if}

  {#each placed as p (p.cat.id)}
    <button
      class="rb"
      class:has-kids={!menu.level && kids(app.S.cats, p.cat.id).length > 0}
      aria-label={p.cat.name}
      style="--x:{p.dx.toFixed(1)}px;--y:{p.dy.toFixed(1)}px;--c:var(--{colorOf(
        app.S.cats,
        p.cat,
      )});--d:{p.i * 16}ms"
      onclick={() => chooseCat(p.cat.id)}
    >
      <Icon name={iconOf(app.S.cats, p.cat)} fallback={p.cat.name[0] ?? '?'} />
      <span class="k">{p.i + 1}</span>
    </button>
  {/each}
</div>
