<script lang="ts">
  import { app, closeAll, win } from '../state.svelte';
  import { topCats } from '../lib/categories';
  import { pad } from '../lib/time';

  const slots = $derived(win.hours * 2);
  const plural = (n: number) =>
    n === 1 ? 'slot' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'sloty' : 'slotów';
</script>

<div id="scrim" class="strong" onclick={closeAll} role="presentation"></div>

<div id="helpbox" class="card">
  <h2>GridDay</h2>
  <p>
    Dzień od {pad(win.startH)} do {pad(win.endH)} to {slots}
    {plural(slots)} po 30 minut. Kliknij pole, wybierz kategorię. To, co kliknięcie zrobi, zależy od
    czasu: przeszłość zapisuje wykonanie, teraźniejszość uruchamia odliczanie, przyszłość planuje.
  </p>

  <div class="legend">
    <div class="blk st-suggested first last">sugestia</div>
    <div class="blk st-planned first last">plan</div>
    <div class="blk st-active first last" style="--p:.45">w toku</div>
    <div class="blk st-confirmed first last">wykonane</div>
  </div>

  <p>
    Kategoria z podkategoriami ma kropkowaną obwódkę i otwiera drugi pierścień. Środek drugiego
    pierścienia wybiera samą kategorię nadrzędną. Kategorie, zakres dnia i pory dnia zmienisz w
    ustawieniach.
  </p>

  <dl class="keys">
    <dt>Klik w blok</dt>
    <dd>potwierdź plan lub przyjmij sugestię</dd>
    <dt>Dwuklik, przytrzymanie</dt>
    <dd>edytuj nazwę, kategorię, usuń</dd>
    <dt class="kb"><kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> lub <kbd>hjkl</kbd></dt>
    <dd class="kb">kursor; <kbd>Enter</kbd> akcja, <kbd>E</kbd> edycja, <kbd>Del</kbd> usuń</dd>
    <dt class="kb"><kbd>1</kbd>–<kbd>{topCats(app.S.cats).length}</kbd></dt>
    <dd class="kb">kategoria w polu kursora; bez kursora startuje bieżący slot</dd>
    <dt class="kb"><kbd>0</kbd> <kbd>⌫</kbd></dt>
    <dd class="kb">w drugim pierścieniu: kategoria nadrzędna, powrót</dd>
    <dt class="kb"><kbd>C</kbd> <kbd>D</kbd></dt>
    <dd class="kb">ustawienia: kategorie, dzień</dd>
    <dt class="kb"><kbd>[</kbd> <kbd>]</kbd> <kbd>T</kbd></dt>
    <dd class="kb">poprzedni dzień, następny, dziś</dd>
    <dt class="kb"><kbd>Enter</kbd> <kbd>Tab</kbd></dt>
    <dd class="kb">na liście po prawej: nowa pozycja, zmiana znacznika</dd>
    <dt class="kb"><kbd>Ctrl</kbd> <kbd>Z</kbd></dt>
    <dd class="kb">cofnij</dd>
  </dl>

  <div class="sh-actions">
    <span class="sp"></span>
    <button class="btn primary" onclick={closeAll}>Zaczynam</button>
  </div>
</div>
