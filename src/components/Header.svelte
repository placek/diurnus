<script lang="ts">
  import { app, ui } from '../state.svelte';
  import { sync } from '../sync.svelte';
  import { describeStatus } from '../lib/sync/describe';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import TodayHead from './TodayHead.svelte';

  interface Props {
    onSettings?: () => void;
    onHelp?: () => void;
  }

  const { onSettings, onHelp }: Props = $props();

  const PANE_ORDER = ['grid', 'list', 'backlog'] as const;
  const PANE_ICON = { grid: 'table-cells', list: 'list-check', backlog: 'layer-group' } as const;
  const PANE_TITLE = {
    grid: 'Siatka — przełącz na notatki',
    list: 'Notatki — przełącz na backlog',
    backlog: 'Backlog — przełącz na siatkę',
  } as const;
  const nextPane = () => PANE_ORDER[(PANE_ORDER.indexOf(ui.pane) + 1) % PANE_ORDER.length]!;

  // Synchronizacja: ikonka tylko przy połączonym magazynie, kropka — gdy coś jest nie tak.
  const syncText = $derived(sync.status ? describeStatus(sync.status, app.now) : null);
  const syncMark = $derived(
    !syncText
      ? ''
      : syncText.tone === 'error'
        ? 'error'
        : syncText.attention || syncText.tone === 'warn'
          ? 'warn'
          : syncText.tone === 'busy'
            ? 'busy'
            : '',
  );
</script>

<header id="top">
  <!-- Lewa strona równoważy narzędzia po prawej, żeby środek był środkiem
       ekranu: logo, a na wąskim ekranie także przełącznik panelu — po lewej od daty. -->
  <div class="hdr-side hdr-lead">
    <span class="hdr-logo"><Logo /></span>
    {#if ui.narrow}
      <button
        class="ib"
        onclick={() => (ui.pane = nextPane())}
        aria-label="Przełącz panel"
        title={PANE_TITLE[ui.pane]}
      >
        <Icon name={PANE_ICON[ui.pane]} fallback="≡" />
      </button>
    {/if}
  </div>

  <!-- Na szerokim ekranie data i zegar stoją w nagłówku sekcji dziś,
       która zachodzi na ten pasek; tu zostaje pusty środek. Na wąskim widać
       jeden panel naraz, więc nagłówek dnia zostaje tutaj. -->
  <div class="hdr-center">
    {#if ui.narrow}<TodayHead />{/if}
  </div>

  <div class="tools hdr-side">
    <!-- Chmura tylko mówi, jak idzie synchronizacja; zarządza się nią w ustawieniach. -->
    {#if syncText}
      <span
        class="ib sync-ind {syncMark}"
        role="status"
        aria-label="Synchronizacja: {syncText.text}"
        title={syncText.text}
      >
        <Icon name="cloud" fallback="☁" />
      </span>
    {/if}
    <button
      class="ib"
      onclick={onSettings}
      aria-label="Ustawienia"
      title="Ustawienia: kategorie C, dzień D"
    >
      <Icon name="gear" fallback="⚙" />
    </button>
    <button class="ib" onclick={onHelp} aria-label="Pomoc" title="Pomoc  ?">
      <Icon name="question" fallback="?" />
    </button>
  </div>
</header>
