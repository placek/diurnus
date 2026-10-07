<script lang="ts">
  import { app, closeAll, commit, currentDay, dispatch, ui, uid } from '../state.svelte';
  import { removeItem } from '../actions.svelte';
  import { NO_CAT_COLOR, catOf, colorOf, iconOf, kids, rootOf, topCats } from '../lib/categories';
  import { SLOT_LEN } from '../lib/machine';
  import type { Event, Item, Step } from '../lib/machine';
  import { MARK } from '../lib/items';
  import { tick } from 'svelte';
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
  let desc = $state('');
  /** kroki w arkuszu — zapisują się razem z resztą, „Zapisz" */
  let steps = $state<{ text: string; done: boolean }[]>([]);
  let stepInputs = $state<HTMLInputElement[]>([]);
  $effect(() => {
    title = item?.text ?? '';
    desc = item?.desc ?? '';
    steps = (item?.steps ?? []).map((s) => ({ ...s }));
  });

  /** Nowy pusty krok za `n` (na końcu bez `n`), od razu z fokusem. */
  async function addSheetStep(n = steps.length - 1) {
    steps.splice(n + 1, 0, { text: '', done: false });
    await tick();
    stepInputs[n + 1]?.focus();
  }

  /** Kroki do zapisu: bez zbędnych spacji, bez pustych. */
  const tidySteps = (xs: readonly Step[]): Step[] =>
    xs.map((s) => ({ text: s.text.trim(), done: s.done })).filter((s) => s.text !== '');

  /** Opis bez końcowych pustych linii; pusty — brak opisu. */
  const tidy = (d: string) => d.replace(/\s+$/, '');

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
    const nextDesc = tidy(desc);
    const catChanged = (i.cat ?? '') !== edit.cat;
    const descChanged = nextDesc !== (i.desc ?? '');
    const nextSteps = tidySteps(steps);
    const stepsChanged = JSON.stringify(nextSteps) !== JSON.stringify(i.steps ?? []);
    const events: Event[] = [];
    if (patch.done === true) events.push({ type: 'markDone', id: i.id, copyId: uid() });
    if (patch.done === false) events.push({ type: 'markOpen', id: i.id });
    const withData = (items: Item[]) =>
      items.map((x) => {
        if (x.id !== i.id) return x;
        const { desc: _old, steps: _oldSteps, ...rest } = x;
        return {
          ...rest,
          text: nextTitle,
          ...(edit.cat ? { cat: edit.cat } : {}),
          ...(nextDesc ? { desc: nextDesc } : {}),
          ...(nextSteps.length ? { steps: nextSteps } : {}),
        };
      });
    if (events.length) dispatch(events, { after: withData });
    else if (catChanged || descChanged || stepsChanged || nextTitle !== i.text)
      commit(() => (app.S.items = withData(app.S.items)));
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
    <textarea id="sheet-desc" rows="3" placeholder="Opis" aria-label="Opis" bind:value={desc}></textarea>

    <!-- Kroki zadania: odhaczenie i tekst; Enter dodaje następny. -->
    <ul class="sh-steps" aria-label="Kroki">
      {#each steps as st, n}
        <li class="step" class:is-done={st.done}>
          <button
            class="step-mark"
            aria-label={st.done ? 'Odznacz krok' : 'Odhacz krok'}
            aria-pressed={st.done}
            onclick={() => (st.done = !st.done)}>{st.done ? MARK.done : MARK.task}</button
          >
          <input
            bind:this={stepInputs[n]}
            class="step-text"
            maxlength="200"
            autocomplete="off"
            aria-label="Krok {n + 1}"
            bind:value={st.text}
            onkeydown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              e.stopPropagation();
              addSheetStep(n);
            }}
          />
          <button class="ib sh-step-x" aria-label="Usuń krok" onclick={() => steps.splice(n, 1)}
            ><Icon name="xmark" fallback="×" /></button
          >
        </li>
      {/each}
    </ul>
    <button class="sh-add-step" onclick={() => addSheetStep()}>+ Dodaj krok</button>

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
