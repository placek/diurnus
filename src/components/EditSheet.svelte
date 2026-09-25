<script lang="ts">
  import { app, closeAll, commit, currentDay, dispatch, ui, uid } from '../state.svelte';
  import { removeItem } from '../actions.svelte';
  import { catOf, colorOf, iconOf, kids, rootOf, topCats } from '../lib/categories';
  import { SLOT_LEN } from '../lib/machine';
  import type { Event, Item } from '../lib/machine';
  import { NO_CAT_COLOR } from '../lib/stats';
  import { fmtQ } from '../lib/time';
  import { isDone, itemTone, slotOf } from '../lib/view';
  import Icon from './Icon.svelte';

  interface Props {
    edit: NonNullable<typeof ui.edit>;
  }

  const { edit }: Props = $props();

  const item = $derived(app.S.items.find((i) => i.id === edit.id));
  const hasCat = $derived(!!edit.cat && app.S.cats.some((c) => c.id === edit.cat));
  const cur = $derived(hasCat ? catOf(app.S.cats, edit.cat) : null);
  const root = $derived(cur ? rootOf(app.S.cats, cur) : null);
  const subs = $derived(root && !root.archived ? kids(app.S.cats, root.id) : []);
  const slot = $derived(item ? slotOf(item) : null);

  let title = $state('');
  $effect(() => {
    title = item?.text ?? '';
  });

  const CHIP = { done: 'wykonane', active: 'teraz', missed: 'minęło', incoming: 'plan', note: 'notatka' };
  const chip = $derived(item ? CHIP[itemTone(item, currentDay.value, app.now)] : '');

  // Jedyna zmiana stanu w arkuszu: wykonane ↔ otwarte. Tekst i kategoria to
  // dane pozycji, zapisywane w tej samej migawce.
  const toggle = $derived(
    item && isDone(item)
      ? { done: false, label: 'Cofnij wykonanie', icon: 'rotate-left' }
      : { done: true, label: 'Wykonane', icon: 'check' },
  );

  function apply(patch: { done?: boolean } = {}) {
    const i = item;
    if (!i) return;
    const nextTitle = title.trim();
    const catChanged = (i.cat ?? '') !== edit.cat;
    const events: Event[] = [];
    if (patch.done === true) events.push({ type: 'markDone', id: i.id, copyId: uid() });
    if (patch.done === false) events.push({ type: 'markOpen', id: i.id });
    const withData = (items: Item[]) =>
      items.map((x) =>
        x.id === i.id ? { ...x, text: nextTitle, ...(edit.cat ? { cat: edit.cat } : {}) } : x,
      );
    if (events.length) dispatch(events, { after: withData });
    else if (catChanged || nextTitle !== i.text) commit(() => (app.S.items = withData(app.S.items)));
    closeAll();
  }
</script>

<div id="scrim" class="strong" onclick={closeAll} role="presentation"></div>

{#if item}
  <div id="sheet" class="card" style="--c:var(--{cur ? colorOf(app.S.cats, cur) : NO_CAT_COLOR})">
    <div class="sh-head">
      {#if slot !== null}
        <span class="sh-time">{fmtQ(currentDay.value, slot)}–{fmtQ(currentDay.value, slot + SLOT_LEN)}</span>
      {/if}
      <span class="chip">{chip}</span>
      <button class="ib" onclick={closeAll} aria-label="Zamknij"><Icon name="xmark" fallback="×" /></button>
    </div>

    <input id="ttl" maxlength="60" autocomplete="off" placeholder={cur?.name ?? 'Bez kategorii'} bind:value={title} />

    <div id="sheetcats">
      <div class="cats">
        {#each topCats(app.S.cats) as c, i (c.id)}
          <button
            class="cb"
            class:sel={c.id === root?.id}
            title="{c.name}  {i + 1}"
            aria-label={c.name}
            style="--c:var(--{colorOf(app.S.cats, c)})"
            onclick={() => (edit.cat = c.id)}
          >
            <Icon name={iconOf(app.S.cats, c)} fallback={c.name[0] ?? '?'} />
          </button>
        {/each}
      </div>

      {#if root && subs.length}
        <div class="subs">
          {#each [root, ...subs] as c (c.id)}
            <button
              class="sc"
              class:sel={c.id === cur?.id}
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
      <button class="btn danger" onclick={() => { const id = edit.id; closeAll(); removeItem(id); }}>
        <Icon name="trash-can" />Usuń
      </button>
      <span class="sp"></span>
      <button class="btn" onclick={() => apply({ done: toggle.done })}>
        <Icon name={toggle.icon} />{toggle.label}
      </button>
      <button class="btn primary" onclick={() => apply()}>Zapisz</button>
    </div>
  </div>
{/if}
