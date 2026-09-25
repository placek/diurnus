<script lang="ts">
  import { app, closeAll, commit, ui } from '../../state.svelte';
  import { buildCats, duplicateBandStart } from '../../lib/settings';
  import { slotFits } from '../../lib/machine';
  import { fmtQ } from '../../lib/time';
  import { slotOf, timedToday } from '../../lib/view';
  import type { DraftCategory } from '../../lib/settings';
  import type { DaySettings } from '../../lib/types';
  import Icon from '../Icon.svelte';
  import CategoriesTab from './CategoriesTab.svelte';
  import DayTab from './DayTab.svelte';
  import DataTab from './DataTab.svelte';

  interface Props {
    tab: 'cats' | 'day' | 'data';
  }

  const { tab }: Props = $props();

  // Edycja pracuje na kopii. Zmiana koloru na żywym stanie przemalowywałaby
  // siatkę pod arkuszem przy każdym kliknięciu, a "Anuluj" nie miałby czego cofać.
  let draft = $state<DraftCategory[]>(structuredClone($state.snapshot(app.S.cats)) as DraftCategory[]);
  let day = $state<DaySettings>(structuredClone($state.snapshot(app.S.day)) as DaySettings);

  const originalIds = new Set(app.S.cats.map((c) => c.id));

  function save() {
    const used = new Set(app.S.items.flatMap((i) => (i.cat ? [i.cat] : [])));
    const cats = buildCats(draft, originalIds, used, app.S.cats);
    if (!cats) {
      app.toast = { msg: 'Zostaw co najmniej jedną kategorię', undoable: false };
      ui.settings = 'cats';
      return;
    }
    if (duplicateBandStart(day.bands)) {
      app.toast = { msg: 'Dwie pory dnia zaczynają się o tej samej godzinie', undoable: false };
      ui.settings = 'day';
      return;
    }
    // Zwężenie dnia nie może ukryć dzisiejszych zadań ze slotem: slot musi
    // mieścić się w dniu, więc zmiana, która by go wyrzuciła, jest odmawiana.
    const outside = timedToday(app.S.items).filter(
      (i) => !slotFits(slotOf(i)!, { q0: day.start * 4, q1: day.end * 4 }),
    );
    if (outside.length) {
      const at = outside.map((i) => fmtQ(app.S.today, slotOf(i)!)).join(', ');
      app.toast = { msg: `Dziś są zadania poza nowym zakresem: ${at}`, undoable: false };
      ui.settings = 'day';
      return;
    }
    const nextDay: DaySettings = {
      start: day.start,
      end: day.end,
      bands: day.bands
        .slice()
        .sort((a, b) => a.from - b.from)
        .map((b) => ({ ...b, name: b.name.trim() })),
    };
    closeAll();
    commit(
      () => {
        app.S.cats = cats;
        app.S.day = nextDay;
      },
      'Ustawienia zapisane',
      true,
    );
  }
</script>

<div id="scrim" class="strong" onclick={closeAll} role="presentation"></div>

<div id="cats" class="card">
  <div class="sh-head">
    <div class="tabs" role="tablist">
      <button class="tab" class:sel={tab === 'cats'} onclick={() => (ui.settings = 'cats')} role="tab">Kategorie</button>
      <button class="tab" class:sel={tab === 'day'} onclick={() => (ui.settings = 'day')} role="tab">Dzień</button>
      <button class="tab" class:sel={tab === 'data'} onclick={() => (ui.settings = 'data')} role="tab">Dane</button>
    </div>
    <button class="ib" onclick={closeAll} aria-label="Zamknij"><Icon name="xmark" fallback="×" /></button>
  </div>

  {#if tab === 'day'}
    <DayTab {day} setDay={(d) => (day = d)} />
  {:else if tab === 'data'}
    <DataTab />
  {:else}
    <CategoriesTab {draft} setDraft={(d) => (draft = d)} />
  {/if}

  <div class="sh-actions">
    <span class="sp"></span>
    {#if tab === 'data'}
      <button class="btn primary" onclick={closeAll}>Zamknij</button>
    {:else}
      <button class="btn" onclick={closeAll}>Anuluj</button>
      <button class="btn primary" onclick={save}>Zapisz</button>
    {/if}
  </div>
</div>
