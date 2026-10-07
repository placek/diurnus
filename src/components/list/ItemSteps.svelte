<script lang="ts">
  import { pushHistory, save, ui } from '../../state.svelte';
  import { addStep, removeStep, setStepText, toggleStep } from '../../actions.svelte';
  import { MARK } from '../../lib/items';
  import type { Item } from '../../lib/types';

  /*
   * Kroki zadania pod jego opisem — wspólne dla listy dnia i backlogu. Zawsze
   * widoczne: to je się odhacza. Enter dodaje następny krok, Enter w pustym
   * kończy listę i zaczyna nową pozycję; Tab odhacza, jak Tab zmienia znacznik
   * pozycji.
   */

  interface Props {
    item: Item;
    /** Enter w pustym kroku: lista kroków się kończy, pod pozycją rodzi się nowa */
    onExit: () => void;
    /** strzałka w górę z pierwszego kroku */
    onUp: () => void;
    /** strzałka w dół z ostatniego kroku */
    onDown: () => void;
  }

  const { item, onExit, onUp, onDown }: Props = $props();

  const steps = $derived(item.steps ?? []);
  let inputs = $state<HTMLInputElement[]>([]);
  let dirty = false;

  // Zamówienie fokusu z zewnątrz (nowy krok, strzałki).
  $effect(() => {
    const f = ui.focusStep;
    if (!f || f.id !== item.id) return;
    const el = inputs[f.n];
    if (!el) return;
    ui.focusStep = null;
    const at = f.at < 0 ? el.value.length : Math.min(f.at, el.value.length);
    el.focus();
    el.setSelectionRange(at, at);
  });

  const focusStep = (n: number, at: number) => (ui.focusStep = { id: item.id, n, at });

  function onKeydown(e: KeyboardEvent, n: number) {
    const t = e.currentTarget as HTMLInputElement;
    const at = t.selectionStart ?? 0;
    const collapsed = t.selectionStart === t.selectionEnd;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (t.value.trim() === '') {
        removeStep(item.id, n);
        onExit();
      } else addStep(item.id, n + 1);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      toggleStep(item.id, n);
      return;
    }
    if (e.key === 'Backspace' && at === 0 && collapsed && t.value === '') {
      e.preventDefault();
      removeStep(item.id, n);
      if (n > 0) focusStep(n - 1, -1);
      else onUp();
      return;
    }
    if (e.key === 'ArrowUp' && at === 0 && collapsed) {
      e.preventDefault();
      if (n > 0) focusStep(n - 1, -1);
      else onUp();
      return;
    }
    if (e.key === 'ArrowDown' && at === t.value.length && collapsed) {
      e.preventDefault();
      if (n < steps.length - 1) focusStep(n + 1, 0);
      else onDown();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      t.blur();
    }
  }
</script>

{#if steps.length}
  <ul class="item-steps" aria-label="Kroki">
    {#each steps as st, n}
      <li class="step" class:is-done={st.done}>
        <button
          class="step-mark"
          tabindex="-1"
          aria-label={st.done ? 'Odznacz krok' : 'Odhacz krok'}
          aria-pressed={st.done}
          onclick={() => toggleStep(item.id, n)}>{st.done ? MARK.done : MARK.task}</button
        >
        <input
          bind:this={inputs[n]}
          class="step-text"
          value={st.text}
          maxlength="200"
          enterkeyhint="enter"
          autocomplete="off"
          aria-label="Krok {n + 1}"
          oninput={(e) => {
            if (!dirty) {
              pushHistory();
              dirty = true;
            }
            setStepText(item.id, n, e.currentTarget.value);
            save();
          }}
          onfocus={() => (dirty = false)}
          onblur={() => (dirty = false)}
          onkeydown={(e) => onKeydown(e, n)}
        />
      </li>
    {/each}
  </ul>
{/if}
