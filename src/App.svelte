<script lang="ts">
  import {
    activeLayer,
    app,
    closeAll,
    savePrefs,
    startClock,
    startCrossTabSync,
    ui,
    undo,
    win,
  } from './state.svelte';
  import {
    actAt,
    applySuggestions,
    assignDigit,
    cellCenter,
    chooseCat,
    closeMenu,
    openEdit,
    removeBlock,
  } from './actions.svelte';
  import { kids, topCats } from './lib/categories';
  import { clampCursor, keyAction } from './lib/keys';
  import { activeBlock } from './lib/occupancy';
  import { catOf } from './lib/categories';
  import { nextTheme, themeColor } from './lib/theme';
  import { occ } from './lib/occupancy';
  import { nowQ, pad, qTime, shiftDay, today } from './lib/time';
  import Grid from './components/Grid.svelte';
  import Header from './components/Header.svelte';
  import RadialMenu from './components/RadialMenu.svelte';
  import EditSheet from './components/EditSheet.svelte';
  import Help from './components/Help.svelte';
  import Toast from './components/Toast.svelte';
  import Settings from './components/settings/Settings.svelte';

  $effect(() => startClock());
  $effect(() => startCrossTabSync());

  // Motyw: 'auto' zostawia decyzję medium query, więc atrybut jest usuwany,
  // a nie ustawiany na zgadywaną wartość.
  $effect(() => {
    const t = app.prefs.theme;
    const root = document.documentElement;
    if (t === 'auto') delete root.dataset.theme;
    else root.dataset.theme = t;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', themeColor(t, matchMedia('(prefers-color-scheme: dark)').matches));
    }
  });

  // Tytuł karty pokazuje odliczanie aktywnego bloku — timer widoczny bez
  // przełączania się na zakładkę.
  $effect(() => {
    const b = activeBlock(app.S.blocks);
    if (!b) {
      document.title = 'GridDay';
      return;
    }
    const left = Math.max(0, qTime(b.day, b.q + b.len) - app.now);
    document.title =
      `${Math.floor(left / 60000)}:${pad(Math.floor(left / 1000) % 60)}  ` +
      `${b.title || catOf(app.S.cats, b.cat).name}`;
  });

  // Ekran powitalny tylko przy pierwszym uruchomieniu.
  $effect(() => {
    if (!app.prefs.seenHelp) {
      ui.help = true;
      app.prefs.seenHelp = true;
      savePrefs();
    }
  });

  function cycleTheme() {
    app.prefs.theme = nextTheme(app.prefs.theme);
    savePrefs();
  }

  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    const action = keyAction(e.key, {
      layer: activeLayer(),
      inInput: !!target?.matches?.('input'),
      menuHasLevel: !!ui.menu?.level,
      cursorVisible: ui.cursor.visible,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      alt: e.altKey,
    });
    if (!action) return;

    const cursorQ = ui.cursor.visible ? ui.cursor.q : nowQ(app.viewDay, app.now);
    const blockAtCursor = cursorQ === null ? null : occ(app.S.blocks, app.viewDay)[cursorQ];

    switch (action.type) {
      case 'undo':
        e.preventDefault();
        undo();
        break;
      case 'close':
        closeAll();
        break;
      case 'save':
        // Arkusz edycji sam obsługuje zapis przez bind:value; tutaj tylko zamykamy pole.
        if (ui.edit) (document.getElementById('ttl') as HTMLInputElement | null)?.blur();
        break;
      case 'move':
        e.preventDefault();
        if (!ui.cursor.visible) {
          ui.cursor.visible = true;
          ui.cursor.q = nowQ(app.viewDay, app.now) ?? win.q0;
        } else {
          ui.cursor.q = clampCursor(ui.cursor.q, action.delta, win.q0, win.q1);
        }
        break;
      case 'digit':
        if (ui.edit) {
          const c = topCats(app.S.cats)[action.n - 1];
          if (c) ui.edit.cat = c.id;
        } else {
          assignDigit(action.n, cursorQ);
        }
        break;
      case 'act': {
        e.preventDefault();
        if (cursorQ === null) break;
        const c = cellCenter(cursorQ);
        actAt(cursorQ, c?.[0] ?? innerWidth / 2, c?.[1] ?? innerHeight / 2);
        break;
      }
      case 'edit':
        if (blockAtCursor) openEdit(blockAtCursor.id);
        break;
      case 'delete':
        if (blockAtCursor) removeBlock(blockAtCursor.id);
        break;
      case 'day':
        app.viewDay = shiftDay(app.viewDay, action.delta);
        closeAll();
        break;
      case 'today':
        app.viewDay = today();
        closeAll();
        break;
      case 'suggest':
        applySuggestions();
        break;
      case 'settings':
        ui.settings = action.tab;
        break;
      case 'help':
        ui.help = true;
        break;
      case 'menuPick': {
        const items = ui.menu?.level
          ? kids(app.S.cats, ui.menu.level)
          : topCats(app.S.cats);
        const c = items[action.n - 1];
        if (c) chooseCat(c.id);
        break;
      }
      case 'menuParent':
        if (ui.menu?.level) chooseCat(ui.menu.level);
        break;
      case 'menuBack':
        if (ui.menu) ui.menu.level = null;
        break;
    }
  }
</script>

<svelte:window onkeydown={onKeydown} onresize={() => ui.menu && closeMenu()} />

<Header onTheme={cycleTheme} onSuggest={applySuggestions} onHelp={() => (ui.help = true)} onSettings={() => (ui.settings = 'cats')} />
<Grid />

{#if ui.menu}<RadialMenu menu={ui.menu} />{/if}
{#if ui.edit}<EditSheet edit={ui.edit} />{/if}
{#if ui.settings}<Settings tab={ui.settings} />{/if}
{#if ui.help}<Help />{/if}

<Toast />
