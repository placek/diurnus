<script lang="ts">
  import { currentDay, ui } from '../../state.svelte';
  import { scheduleItem } from '../../actions.svelte';
  import { shiftDay } from '../../lib/time';

  interface Props {
    prompt: NonNullable<typeof ui.datePrompt>;
  }

  const { prompt }: Props = $props();

  // Jutro jako najbliższy sensowny termin — planuje się zwykle na „nie dziś".
  let day = $state(shiftDay(currentDay.value, 1));
  let time = $state('');

  /** Godzina zaokrąglana W DÓŁ do kwadransa: siatka nie umie pokazać innych. */
  function toQuantum(hhmm: string): number | undefined {
    if (!hhmm) return undefined;
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 4 + Math.floor((m ?? 0) / 15);
  }

  const close = () => (ui.datePrompt = null);

  function confirm() {
    scheduleItem(prompt.itemId, day || null, toQuantum(time));
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
  <label class="dp-field">
    Godzina
    <input type="time" step="900" bind:value={time} placeholder="bez pory" />
  </label>
  <div class="sh-actions">
    <button class="btn" onclick={() => { day = ''; confirm(); }}>Bez daty</button>
    <span class="sp"></span>
    <button class="btn" onclick={close}>Anuluj</button>
    <button class="btn primary" onclick={confirm}>Zaplanuj</button>
  </div>
</div>
