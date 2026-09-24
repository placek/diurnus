<script lang="ts">
  import { app, undo } from '../state.svelte';

  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Toast jest jednocześnie afordancją cofania: akcja mówi, co zrobiła,
  // i proponuje odwrócenie — taniej niż dialog potwierdzenia.
  $effect(() => {
    if (!app.toast) return;
    visible = true;
    clearTimeout(timer);
    timer = setTimeout(() => (visible = false), 3600);
    return () => clearTimeout(timer);
  });
</script>

<div id="toast" class:show={visible}>
  {#if app.toast}
    <span>{app.toast.msg}</span>
    {#if app.toast.undoable}
      <button
        onclick={() => {
          undo();
          visible = false;
        }}>Cofnij</button
      >
    {/if}
  {/if}
</div>
