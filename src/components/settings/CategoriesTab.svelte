<script lang="ts">
  import { COLORS, ICONS, MAX_KIDS, MAX_TOP, uid } from '../../lib/model';
  import { moveUp } from '../../lib/settings';
  import type { DraftCategory } from '../../lib/settings';
  import Icon from '../Icon.svelte';

  interface Panel {
    id: string;
    kind: 'icon' | 'color';
  }

  interface Props {
    draft: DraftCategory[];
    setDraft: (d: DraftCategory[]) => void;
  }

  const { draft, setDraft }: Props = $props();

  let panel = $state<Panel | null>(null);

  const alive = (c: DraftCategory) => !c._del && !c.archived;
  const tops = $derived(draft.filter((c) => !c.parent && alive(c)));
  const kidsOf = (id: string) => draft.filter((c) => c.parent === id && alive(c));

  const togglePanel = (id: string, kind: Panel['kind']) => {
    panel = panel?.id === id && panel.kind === kind ? null : { id, kind };
  };

  function addTop() {
    const usedCol = new Set(tops.map((t) => t.color));
    draft.push({
      id: uid(),
      name: '',
      icon: 'circle',
      color: COLORS.find((c) => !usedCol.has(c)) ?? COLORS[0],
      parent: null,
    });
    panel = null;
  }

  function addKid(parent: string) {
    const at = draft.reduce((acc, x, i) => (x.id === parent || x.parent === parent ? i : acc), -1);
    draft.splice(at + 1, 0, { id: uid(), name: '', icon: null, parent });
    panel = null;
  }

  function remove(c: DraftCategory) {
    c._del = true;
    if (!c.parent) for (const x of draft) if (x.parent === c.id) x._del = true;
    panel = null;
  }
</script>

<div class="ce-list">
  {#each tops as t (t.id)}
    {@const ks = kidsOf(t.id)}
    <div class="ce-row top" data-id={t.id} style="--c:var(--{t.color})">
      <button class="ce-ic" onclick={() => togglePanel(t.id, 'icon')} title="Ikona">
        <Icon name={t.icon ?? 'circle'} fallback={(t.name || '?')[0] ?? '?'} />
      </button>
      <input class="ce-name" bind:value={t.name} placeholder="Nazwa kategorii" maxlength="32" />
      <button class="ce-sw" onclick={() => togglePanel(t.id, 'color')} title="Kolor" aria-label="Kolor"></button>
      <button class="ib" onclick={() => setDraft(moveUp(draft, t.id))} title="Przesuń wyżej" aria-label="Przesuń wyżej">
        <Icon name="arrow-up" fallback="↑" />
      </button>
      <button class="ib" onclick={() => addKid(t.id)} disabled={ks.length >= MAX_KIDS} title="Dodaj podkategorię" aria-label="Dodaj podkategorię">
        <Icon name="plus" fallback="+" />
      </button>
      <button class="ib del" onclick={() => remove(t)} title="Usuń" aria-label="Usuń">
        <Icon name="trash-can" fallback="×" />
      </button>
    </div>

    {#if panel?.id === t.id}
      <div class="ce-panel" style="--c:var(--{t.color})">
        {#if panel.kind === 'color'}
          {#each COLORS as col (col)}
            <button class="sw" class:sel={col === t.color} style="--sc:var(--{col})" aria-label={col} onclick={() => { t.color = col; panel = null; }}></button>
          {/each}
        {:else}
          {#each ICONS as n (n)}
            <button class:sel={t.icon === n} aria-label={n} onclick={() => { t.icon = n; panel = null; }}>
              <Icon name={n} fallback={n[0] ?? '?'} />
            </button>
          {/each}
        {/if}
      </div>
    {/if}

    {#each ks as k (k.id)}
      <div class="ce-row kid" data-id={k.id} style="--c:var(--{t.color})">
        <button class="ce-ic" class:inh={!k.icon} onclick={() => togglePanel(k.id, 'icon')} title="Ikona">
          <Icon name={k.icon ?? t.icon ?? 'circle'} fallback={(k.name || '?')[0] ?? '?'} />
        </button>
        <input class="ce-name" bind:value={k.name} placeholder="Nazwa podkategorii" maxlength="32" />
        <button class="ib" onclick={() => setDraft(moveUp(draft, k.id))} title="Przesuń wyżej" aria-label="Przesuń wyżej">
          <Icon name="arrow-up" fallback="↑" />
        </button>
        <span class="ce-gap"></span>
        <button class="ib del" onclick={() => remove(k)} title="Usuń" aria-label="Usuń">
          <Icon name="trash-can" fallback="×" />
        </button>
      </div>

      {#if panel?.id === k.id && panel.kind === 'icon'}
        <div class="ce-panel kidp" style="--c:var(--{t.color})">
          <button class:sel={!k.icon} title="Jak kategoria nadrzędna" onclick={() => { k.icon = null; panel = null; }}>
            <Icon name={t.icon ?? 'circle'} fallback="·" />
          </button>
          {#each ICONS as n (n)}
            <button class:sel={k.icon === n} aria-label={n} onclick={() => { k.icon = n; panel = null; }}>
              <Icon name={n} fallback={n[0] ?? '?'} />
            </button>
          {/each}
        </div>
      {/if}
    {/each}
  {/each}
</div>

<button class="btn ce-add" onclick={addTop} disabled={tops.length >= MAX_TOP}>
  <Icon name="plus" fallback="+" />Nowa kategoria
</button>
