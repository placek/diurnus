<script lang="ts">
  import { app, currentDay, ui, win } from '../../state.svelte';
  import { scheduleItem } from '../../actions.svelte';
  import { activeHours, pad, pickedQuantum, quartersFor, shiftDay } from '../../lib/time';
  import {
    DAY_SHORT,
    WEEKDAY_CODES,
    describeRule,
    firstFrom,
    formatRRule,
    pin,
    preview,
  } from '../../lib/rrule';
  import type { RRule, Weekday } from '../../lib/rrule';
  import {
    customFromRule,
    defaultCustom,
    monthModes,
    presetOf,
    presets,
    ruleFromCustom,
    shortDate,
    unitLabel,
    validDay,
  } from '../../lib/recurrence-form';
  import type { Custom, PresetKey, Unit } from '../../lib/recurrence-form';
  import { whenOf } from '../../lib/view';

  interface Props {
    prompt: NonNullable<typeof ui.datePrompt>;
  }

  const { prompt }: Props = $props();

  // Okienko zaczyna od tego, co pozycja już ma: dnia (albo najbliższego
  // wystąpienia), pory i reguły. Nowy termin to jutro — dziś już się zaczęło.
  const tomorrow = shiftDay(currentDay.value, 1);
  const item = app.S.items.find((i) => i.id === prompt.itemId);
  const w = item ? whenOf(item) : null;
  const had: RRule | null = w?.type === 'recurring' ? w.rule : null;
  const startDay = w ? (w.type === 'recurring' ? w.next : w.date) : tomorrow;
  const startSlot = w && w.type !== 'date' ? w.slot : null;

  const firstDay = startDay < tomorrow ? tomorrow : startDay;
  let day = $state(firstDay);

  // Dwie listy zamiast pola czasu: `step` w <input type="time"> jest tylko
  // podpowiedzią i przeglądarki pozwalają wpisać dowolną minutę i godzinę.
  // Tu wybór jest ograniczony do tego, co siatka potrafi pokazać: godzin
  // aktywnej części dnia z ustawień i czterech kwadransów.
  let hour = $state(startSlot === null ? '' : String(Math.floor(startSlot / 4)));
  let minute = $state(startSlot === null ? '0' : String((startSlot % 4) * 15));
  const hours = $derived(activeHours(win.startH, win.endH));
  const minutes = $derived(hour === '' ? [0, 15, 30, 45] : quartersFor(Number(hour), win.endH));
  // Przejście na ostatnią godzinę z :45 przesuwa wybór na najpóźniejszy możliwy.
  $effect(() => {
    if (!minutes.includes(Number(minute))) minute = String(minutes.at(-1));
  });

  // Reguła, którą pozycja już ma: gotowy wzorzec, „własne…" albo — gdy formularz
  // jej nie przedstawi — „bez zmian", żeby otwarcie okienka niczego nie psuło.
  const hadCustom = had ? customFromRule(had, firstDay) : null;
  const hadPreset = had ? presetOf(had, firstDay) : null;
  const canKeep = !!had && !hadCustom && !hadPreset;
  let preset = $state<PresetKey>(!had ? 'none' : (hadPreset ?? (hadCustom ? 'custom' : 'keep')));
  let custom = $state<Custom>(hadCustom ?? defaultCustom(firstDay));
  // „Własne…" wybrane pierwszy raz startuje od dnia, który jest wtedy wybrany —
  // nie od tego, który był przy otwarciu okienka.
  let customReady = !!hadCustom;
  function onPreset() {
    if (preset === 'custom' && !customReady) {
      custom = defaultCustom(ok ? day : tomorrow);
      customReady = true;
    }
  }

  const ok = $derived(validDay(day) && day >= tomorrow);
  const options = $derived(ok ? presets(day) : presets(tomorrow));
  const modes = $derived(monthModes(ok ? day : tomorrow));
  // Tryb miesiąca, którego nowy dzień nie ma (np. „ostatni" po zmianie daty), wraca do dnia.
  $effect(() => {
    if (!modes.some((m) => m.mode === custom.monthMode)) custom.monthMode = 'day';
  });

  const rule = $derived.by((): RRule | null => {
    if (!ok) return null;
    if (preset === 'keep') return had;
    if (preset === 'custom') return ruleFromCustom(custom, day);
    return options.find((o) => o.key === preset)?.rule ?? null;
  });

  // Podgląd liczy to samo co maszyna: pierwsze pasujące od wybranego dnia.
  const pinned = $derived(rule && ok ? pin(rule, day) : null);
  const upcoming = $derived(pinned ? preview(pinned, day, 3) : []);
  const noOccurrence = $derived(!!pinned && firstFrom(pinned, day) === null);

  function toggleDay(d: Weekday) {
    custom.weekdays = custom.weekdays.includes(d)
      ? custom.weekdays.filter((x) => x !== d)
      : [...custom.weekdays, d];
  }

  const UNITS: Unit[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

  const close = () => (ui.datePrompt = null);

  function confirm() {
    if (!ok || noOccurrence) return;
    scheduleItem(prompt.itemId, day, pickedQuantum(hour, minute), rule ?? undefined);
    close();
  }

  // Okienko rośnie z formularzem — trzymamy je w całości w widoku. Mierzone po
  // każdej zmianie tego, co zmienia jego wysokość.
  let el = $state<HTMLElement | null>(null);
  let h = $state(0);
  let wdt = $state(0);
  $effect(() => {
    void [preset, custom.unit, custom.end, rule, noOccurrence];
    if (!el) return;
    h = el.offsetHeight;
    wdt = el.offsetWidth;
  });
  const top = $derived(Math.max(8, Math.min(prompt.y, innerHeight - h - 8)));
  const left = $derived(Math.max(8, Math.min(prompt.x, innerWidth - wdt - 8)));
</script>

<div id="scrim" onclick={close} role="presentation"></div>

<div
  class="date-prompt card"
  style="left:{left}px;top:{top}px"
  bind:this={el}
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      confirm();
    }
  }}
  role="dialog"
  aria-label="Zaplanuj pozycję"
  tabindex="-1"
>
  <label class="dp-field">
    Dzień
    <!-- svelte-ignore a11y_autofocus -->
    <input type="date" bind:value={day} min={tomorrow} autofocus />
  </label>
  <div class="dp-field">
    Godzina
    <div class="dp-time">
      <select aria-label="Godzina" bind:value={hour}>
        <option value="">bez pory</option>
        {#each hours as hh (hh)}
          <option value={String(hh)}>{pad(hh)}</option>
        {/each}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label="Minuty" bind:value={minute} disabled={hour === ''}>
        {#each minutes as m (m)}
          <option value={String(m)}>{pad(m)}</option>
        {/each}
      </select>
    </div>
  </div>

  <label class="dp-field">
    Powtarzaj
    <select aria-label="Powtarzaj" bind:value={preset} onchange={onPreset}>
      {#each options as o (o.key)}
        <option value={o.key}>{o.label}</option>
      {/each}
      {#if canKeep && had}
        <option value="keep">bez zmian: {describeRule(had, { left: true })}</option>
      {/if}
      <option value="custom">własne…</option>
    </select>
  </label>

  {#if preset === 'custom'}
    <div class="dp-custom">
      <div class="dp-row">
        co
        <input
          class="dp-num"
          type="number"
          min="1"
          max="999"
          aria-label="Co ile"
          bind:value={custom.interval}
        />
        <select aria-label="Jednostka" bind:value={custom.unit}>
          {#each UNITS as u (u)}
            <option value={u}>{unitLabel(u, custom.interval || 1)}</option>
          {/each}
        </select>
      </div>

      {#if custom.unit === 'WEEKLY'}
        <div class="dp-days" role="group" aria-label="Dni tygodnia">
          {#each WEEKDAY_CODES as d (d)}
            <button
              type="button"
              class="dp-day"
              class:sel={custom.weekdays.includes(d)}
              aria-pressed={custom.weekdays.includes(d)}
              onclick={() => toggleDay(d)}>{DAY_SHORT[d]}</button
            >
          {/each}
        </div>
      {:else if custom.unit === 'MONTHLY'}
        <select aria-label="Dzień miesiąca" bind:value={custom.monthMode}>
          {#each modes as m (m.mode)}
            <option value={m.mode}>{m.label}</option>
          {/each}
        </select>
      {/if}

      <div class="dp-end" role="radiogroup" aria-label="Koniec">
        <label><input type="radio" bind:group={custom.end} value="never" /> bez końca</label>
        <label>
          <input type="radio" bind:group={custom.end} value="count" /> po
          <input
            class="dp-num"
            type="number"
            min="1"
            max="9999"
            aria-label="Ile razy"
            bind:value={custom.count}
            disabled={custom.end !== 'count'}
          />
          {custom.count === 1 ? 'razie' : 'razach'}
        </label>
        <label>
          <input type="radio" bind:group={custom.end} value="until" /> do
          <input
            type="date"
            aria-label="Do dnia"
            min={day}
            bind:value={custom.until}
            disabled={custom.end !== 'until'}
          />
        </label>
      </div>
    </div>
  {/if}

  {#if rule}
    <div class="dp-preview" aria-live="polite">
      <div class="dp-desc">{describeRule(rule, { left: preset === 'keep' })}</div>
      {#if noOccurrence}
        <div class="dp-err">Ta reguła nie ma żadnego wystąpienia od wybranego dnia</div>
      {:else}
        <div class="dp-next">
          → {upcoming.map(shortDate).join(', ')}{upcoming.length === 3 ? '…' : ''}
        </div>
      {/if}
      <code class="dp-rrule">{formatRRule(pinned ?? rule)}</code>
    </div>
  {/if}

  <div class="sh-actions">
    <span class="sp"></span>
    <button class="btn" onclick={close}>Anuluj</button>
    <button class="btn primary" onclick={confirm} disabled={!ok || noOccurrence}>Zaplanuj</button>
  </div>
</div>
