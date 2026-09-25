<script lang="ts">
  import { currentDay, ui, win } from '../../state.svelte';
  import { scheduleItem } from '../../actions.svelte';
  import { QUARTERS, activeHours, pad, pickedQuantum, shiftDay } from '../../lib/time';

  interface Props {
    prompt: NonNullable<typeof ui.datePrompt>;
  }

  const { prompt }: Props = $props();

  // Jutro jako najbliższy sensowny termin — planuje się zwykle na „nie dziś".
  let day = $state(shiftDay(currentDay.value, 1));
  // Dwie listy zamiast pola czasu: `step` w <input type="time"> jest tylko
  // podpowiedzią i przeglądarki pozwalają wpisać dowolną minutę i godzinę.
  // Tu wybór jest ograniczony do tego, co siatka potrafi pokazać: godzin
  // aktywnej części dnia z ustawień i czterech kwadransów.
  let hour = $state(''); // '' = bez pory
  let minute = $state('0');
  const hours = $derived(activeHours(win.startH, win.endH));

  const close = () => (ui.datePrompt = null);

  function confirm() {
    scheduleItem(prompt.itemId, day || null, pickedQuantum(hour, minute));
    close();
  }
</script>

<div id="scrim" onclick={close} role="presentation"></div>

<div
  class="date-prompt card"
  style="left:{prompt.x}px;top:{prompt.y}px"
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
    if (e.key === 'Enter') {
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
    <input type="date" bind:value={day} autofocus />
  </label>
  <div class="dp-field">
    Godzina
    <div class="dp-time">
      <select aria-label="Godzina" bind:value={hour}>
        <option value="">bez pory</option>
        {#each hours as h (h)}
          <option value={String(h)}>{pad(h)}</option>
        {/each}
      </select>
      <span aria-hidden="true">:</span>
      <select aria-label="Minuty" bind:value={minute} disabled={hour === ''}>
        {#each QUARTERS as m (m)}
          <option value={String(m)}>{pad(m)}</option>
        {/each}
      </select>
    </div>
  </div>
  <div class="sh-actions">
    <button class="btn" onclick={() => { day = ''; confirm(); }}>Bez daty</button>
    <span class="sp"></span>
    <button class="btn" onclick={close}>Anuluj</button>
    <button class="btn primary" onclick={confirm}>Zaplanuj</button>
  </div>
</div>
