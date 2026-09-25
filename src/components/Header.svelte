<script lang="ts">
  import { ui } from '../state.svelte';
  import Icon from './Icon.svelte';
  import TodayHead from './TodayHead.svelte';

  interface Props {
    onSettings?: () => void;
    onHelp?: () => void;
    onTheme?: () => void;
  }

  const { onSettings, onHelp, onTheme }: Props = $props();

  const PANE_ORDER = ['grid', 'list', 'backlog'] as const;
  const PANE_ICON = { grid: 'table-cells', list: 'list-check', backlog: 'layer-group' } as const;
  const PANE_TITLE = {
    grid: 'Siatka — przełącz na notatki',
    list: 'Notatki — przełącz na backlog',
    backlog: 'Backlog — przełącz na siatkę',
  } as const;
  const nextPane = () => PANE_ORDER[(PANE_ORDER.indexOf(ui.pane) + 1) % PANE_ORDER.length]!;
</script>

<header id="top">
  <!-- Lewy dystans równoważy narzędzia po prawej, żeby środek był środkiem
       ekranu, a nie środkiem tego, co zostało. -->
  <div class="hdr-side" aria-hidden="true"></div>

  <!-- Na szerokim ekranie data i pasek postępu stoją w nagłówku sekcji dziś,
       która zachodzi na ten pasek; tu zostaje pusty środek. Na wąskim widać
       jeden panel naraz, więc nagłówek dnia zostaje tutaj. -->
  <div class="hdr-center">
    {#if ui.narrow}<TodayHead />{/if}
  </div>

  <div class="tools hdr-side">
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
    <!-- Kod źródłowy: zwykły link w nowej karcie, żeby nie zamykać dnia. -->
    <a
      class="ib"
      href="https://github.com/placek/diurnus"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Kod na GitHubie"
      title="Kod na GitHubie"
    >
      <Icon name="github" fallback="GH" />
    </a>
    <button class="ib" onclick={onHelp} aria-label="Pomoc" title="Pomoc  ?">
      <Icon name="question" fallback="?" />
    </button>
    <button class="ib" onclick={onTheme} aria-label="Motyw" title="Motyw">
      <Icon name="circle-half-stroke" fallback="◐" />
    </button>
    <button
      class="ib"
      onclick={onSettings}
      aria-label="Ustawienia"
      title="Ustawienia: kategorie C, dzień D"
    >
      <Icon name="gear" fallback="⚙" />
    </button>
  </div>
</header>
