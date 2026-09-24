<script lang="ts">
  import { app, closeAll, commit, ui } from '../state.svelte';
  import { removeBlock } from '../actions.svelte';
  import { acceptTarget } from '../lib/actions';
  import { catOf, colorOf, iconOf, kids, rootOf, topCats } from '../lib/categories';
  import { STATUS_LABEL } from '../lib/model';
  import { fmtQ } from '../lib/time';
  import type { Status } from '../lib/types';
  import Icon from './Icon.svelte';

  interface Props {
    edit: NonNullable<typeof ui.edit>;
  }

  const { edit }: Props = $props();

  const block = $derived(app.S.blocks.find((b) => b.id === edit.id));
  const cur = $derived(catOf(app.S.cats, edit.cat));
  const root = $derived(rootOf(app.S.cats, cur));
  const subs = $derived(root.archived ? [] : kids(app.S.cats, root.id));

  let title = $state('');
  $effect(() => {
    title = block?.title ?? '';
  });

  const TOGGLE_LABEL: Record<Status, string> = {
    confirmed: 'Wykonane',
    active: 'Start',
    planned: 'Akceptuj',
    suggested: '',
    discarded: '',
  };

  // Przycisk zmiany statusu zależy od tego, gdzie blok leży względem TERAZ.
  const toggle = $derived.by(() => {
    if (!block) return null;
    if (block.status === 'confirmed') return { status: 'planned' as Status, label: 'Do planu', icon: 'rotate-left' };
    if (block.status === 'active') return { status: 'confirmed' as Status, label: 'Zakończ', icon: 'check' };
    const t = acceptTarget(block, app.now);
    return t === block.status ? null : { status: t, label: TOGGLE_LABEL[t], icon: 'check' };
  });

  function apply(patch: { status?: Status } = {}) {
    const b = block;
    if (!b) return;
    const nextTitle = title.trim();
    const changed =
      edit.cat !== b.cat || nextTitle !== b.title || (patch.status && patch.status !== b.status);
    if (changed) {
      commit(() => {
        b.cat = edit.cat;
        b.title = nextTitle;
        // Druga strona lustra: tytuł bloku jest tekstem jego pozycji.
        const linked = app.S.items.find((i) => i.block === b.id);
        if (linked) linked.text = nextTitle;
        if (patch.status) b.status = patch.status;
      });
    }
    closeAll();
  }
</script>

<div id="scrim" class="strong" onclick={closeAll} role="presentation"></div>

{#if block}
  <div id="sheet" class="card" style="--c:var(--{colorOf(app.S.cats, cur)})">
    <div class="sh-head">
      <span class="sh-time">{fmtQ(block.day, block.q)}–{fmtQ(block.day, block.q + block.len)}</span>
      <span class="chip">{STATUS_LABEL[block.status]}</span>
      <button class="ib" onclick={closeAll} aria-label="Zamknij"><Icon name="xmark" fallback="×" /></button>
    </div>

    <input id="ttl" maxlength="60" autocomplete="off" placeholder={cur.name} bind:value={title} />

    <div id="sheetcats">
      <div class="cats">
        {#each topCats(app.S.cats) as c, i (c.id)}
          <button
            class="cb"
            class:sel={c.id === root.id}
            title="{c.name}  {i + 1}"
            aria-label={c.name}
            style="--c:var(--{colorOf(app.S.cats, c)})"
            onclick={() => (edit.cat = c.id)}
          >
            <Icon name={iconOf(app.S.cats, c)} fallback={c.name[0] ?? '?'} />
          </button>
        {/each}
      </div>

      {#if subs.length}
        <div class="subs">
          {#each [root, ...subs] as c (c.id)}
            <button
              class="sc"
              class:sel={c.id === cur.id}
              style="--c:var(--{colorOf(app.S.cats, c)})"
              onclick={() => (edit.cat = c.id)}
            >
              {#if c.parent}<Icon name={iconOf(app.S.cats, c)} fallback={c.name[0] ?? '?'} />{/if}
              {c.parent ? c.name : `${root.name} ogólnie`}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="sh-actions">
      <button class="btn danger" onclick={() => { const id = edit.id; closeAll(); removeBlock(id); }}>
        <Icon name="trash-can" />Usuń
      </button>
      <span class="sp"></span>
      {#if toggle}
        <button class="btn" onclick={() => apply({ status: toggle.status })}>
          <Icon name={toggle.icon} />{toggle.label}
        </button>
      {/if}
      <button class="btn primary" onclick={() => apply()}>Zapisz</button>
    </div>
  </div>
{/if}
