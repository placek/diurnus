<script lang="ts">
  import { tick } from 'svelte';
  import { pushHistory, save, ui } from '../../state.svelte';
  import { mergeDescUp, setItemDesc, tidyDesc } from '../../actions.svelte';
  import type { Item } from '../../lib/types';

  /*
   * Opis pod tytułem pozycji — wspólny dla listy dnia i backlogu. Poza fokusem
   * widać najwyżej dwie linie; w fokusie całość, w polu, które rośnie z treścią.
   * Shift+Enter dodaje linię (domyślne zachowanie pola), Enter — nową pozycję,
   * jak w tytule.
   */

  interface Props {
    item: Item;
    /** wiersz pozycji ma fokus — opis w całości i do edycji */
    open: boolean;
    /** Enter bez Shift: nowa pozycja pod tą */
    onEnter: () => void;
    /** strzałka w dół z ostatniej linii */
    onDown: () => void;
  }

  const { item, open, onEnter, onDown }: Props = $props();

  let el = $state<HTMLTextAreaElement | null>(null);
  let dirty = false;
  /** fokus zamówiony klikiem w skrócony opis albo przez `ui.focusDesc` */
  let want = $state<number | null>(null);

  const text = $derived(item.desc ?? '');
  const editing = $derived(open || want !== null);

  function grow() {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // Zamówienie fokusu z zewnątrz (Shift+Enter w tytule, strzałki).
  $effect(() => {
    const f = ui.focusDesc;
    if (f && f.id === item.id) {
      want = f.at < 0 ? text.length : f.at;
      ui.focusDesc = null;
    }
  });

  $effect(() => {
    if (want === null || !el) return;
    const at = Math.min(want, el.value.length);
    want = null;
    el.focus();
    el.setSelectionRange(at, at);
  });

  $effect(() => {
    void text;
    if (el) tick().then(grow);
  });

  function onKeydown(e: KeyboardEvent) {
    const t = e.currentTarget as HTMLTextAreaElement;
    const at = t.selectionStart ?? 0;
    const collapsed = t.selectionStart === t.selectionEnd;

    // Shift+Enter zostaje polu: nowa linia opisu.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnter();
      return;
    }
    if (e.key === 'Backspace' && at === 0 && collapsed) {
      e.preventDefault();
      mergeDescUp(item.id);
      return;
    }
    if (e.key === 'ArrowUp' && collapsed && !t.value.slice(0, at).includes('\n')) {
      e.preventDefault();
      ui.focusItem = item.id;
      return;
    }
    if (e.key === 'ArrowDown' && collapsed && !t.value.slice(at).includes('\n')) {
      e.preventDefault();
      onDown();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      t.blur();
    }
  }
</script>

{#if editing}
  <textarea
    bind:this={el}
    class="item-desc"
    value={text}
    rows="1"
    aria-label="Opis"
    spellcheck="false"
    oninput={(e) => {
      if (!dirty) {
        pushHistory();
        dirty = true;
      }
      setItemDesc(item.id, e.currentTarget.value);
      save();
      grow();
    }}
    onfocus={() => (dirty = false)}
    onblur={() => {
      dirty = false;
      tidyDesc(item.id);
    }}
    onkeydown={onKeydown}
  ></textarea>
{:else if text}
  <!-- Skrót: dwie linie; klik otwiera opis do edycji na końcu. -->
  <div
    class="item-desc clamp"
    role="button"
    tabindex="-1"
    onclick={() => (want = text.length)}
    onkeydown={() => {}}
  >
    {text}
  </div>
{/if}
