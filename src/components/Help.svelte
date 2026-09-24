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
  <h2>Diurnus</h2>
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
    Ekran dzieli się na trzy panele: dzisiejsza siatka, dzisiejsze notatki i backlog — wszystko,
    co zaplanowane na później albo jeszcze bez terminu. Na wąskim ekranie widać jeden panel naraz;
    przełącza je przycisk w nagłówku.
  </p>

  <h3>Siatka</h3>
  <dl class="keys">
    <dt>Klik w puste pole</dt>
    <dd>
      menu kategorii; nowy blok ma 30 minut albo 15, gdy dalej jest zajęte. Kategoria
      z podkategoriami ma kropkowaną obwódkę i otwiera drugi pierścień, którego środek wybiera
      samą kategorię nadrzędną
    </dd>
    <dt>Klik w blok</dt>
    <dd>
      przyjmuje sugestię albo potwierdza plan według czasu: miniony staje się wykonanym,
      trwający startuje; wykonany i trwający nie reagują
    </dd>
    <dt>Dwuklik, prawy przycisk, przytrzymanie</dt>
    <dd>edycja: nazwa, kategoria i podkategoria, zmiana statusu, usunięcie</dd>
    <dt>Przeciągnięcie bloku</dt>
    <dd>
      przenosi go na inną godzinę, z tą samą długością. Obrys pokazuje cel; czerwony znaczy, że
      miejsce jest zajęte albo poza zakresem dnia — wtedy blok zostaje, gdzie był
    </dd>
    <dt>Blok w toku</dt>
    <dd>
      naraz trwa tylko jeden — start nowego kończy poprzedni. Kończy się sam, gdy minie jego czas;
      przeniesiony poza teraz staje się planem albo wykonanym
    </dd>
    <dt>Usunięcie sugestii</dt>
    <dd>odrzuca ją na stałe — nie wróci</dd>
  </dl>

  <h3 class="kb">Klawiatura na siatce</h3>
  <dl class="keys kb">
    <dt><kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> lub <kbd>hjkl</kbd></dt>
    <dd>kursor o 15 minut lub o godzinę; pierwsze wciśnięcie stawia go na teraz</dd>
    <dt><kbd>Shift</kbd> + <kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> lub <kbd>HJKL</kbd></dt>
    <dd>
      przenosi blok spod kursora o 15 minut lub o godzinę, a kursor jedzie z nim. Zajęte miejsce
      albo koniec dnia zatrzymuje blok i mówi dlaczego
    </dd>
    <dt><kbd>Enter</kbd> <kbd>Spacja</kbd></dt>
    <dd>to samo, co klik w pole pod kursorem</dd>
    <dt><kbd>1</kbd>–<kbd>{topCats(app.S.cats).length}</kbd></dt>
    <dd>
      kategoria w polu kursora: blokowi ją zmienia, puste pole wypełnia. Bez kursora działa na
      bieżący slot
    </dd>
    <dt><kbd>E</kbd> <kbd>Del</kbd></dt>
    <dd>edytuj, usuń blok pod kursorem</dd>
    <dt>W menu kategorii</dt>
    <dd>
      <kbd>1</kbd>–<kbd>9</kbd> wybór; w drugim pierścieniu <kbd>0</kbd> lub <kbd>Enter</kbd>
      kategoria nadrzędna, <kbd>⌫</kbd> powrót
    </dd>
    <dt>W edycji bloku</dt>
    <dd>cyfry zmieniają kategorię; <kbd>Esc</kbd> zamyka bez zapisu</dd>
  </dl>

  <h3>Notatki</h3>
  <dl class="keys">
    <dt>Pisanie w pustym wierszu</dt>
    <dd>tworzy pozycję od pierwszego znaku</dd>
    <dt class="kb"><kbd>Enter</kbd> <kbd>Tab</kbd></dt>
    <dd class="kb">
      nowa pozycja pod bieżącą; zmiana znacznika zadanie → wykonane → notatka
      (<kbd>Shift</kbd> wstecz)
    </dd>
    <dt class="kb"><kbd>⌫</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Esc</kbd></dt>
    <dd class="kb">
      w pustej pozycji usuwa ją; na brzegu tekstu przechodzą do sąsiedniej; wyjście z pola
    </dd>
    <dt>Klik w znacznik</dt>
    <dd>zadanie ↔ wykonane</dd>
    <dt>Prawy przycisk na znaczniku</dt>
    <dd>typ pozycji i kategoria</dd>
    <dt>Przeciągnięcie znacznika</dt>
    <dd>w obrębie listy przestawia; upuszczone na backlogu odkłada pozycję bez terminu</dd>
    <dt>Pozycje z godziną</dt>
    <dd>
      to bloki z siatki: tekst jest nazwą bloku, odhaczenie potwierdza blok, a usunięcie pozycji
      usuwa blok
    </dd>
    <dt>Nowy dzień</dt>
    <dd>niedokończone zadania z ostatniego dnia wracają dziś na górę</dd>
  </dl>

  <h3>Backlog</h3>
  <dl class="keys">
    <dt>Pisanie w pustym wierszu</dt>
    <dd>nowa pozycja bez terminu</dd>
    <dt class="kb"><kbd>Enter</kbd> <kbd>⌫</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Esc</kbd></dt>
    <dd class="kb">jak w notatkach; znacznik zmienia się tylko z menu</dd>
    <dt>Klik w znacznik</dt>
    <dd>
      zrobione — trafia do dzisiejszych notatek. Powtarzalna zostaje w backlogu i przeskakuje na
      następne wystąpienie
    </dd>
    <dt>Prawy przycisk na znaczniku</dt>
    <dd>
      typ i kategoria, a do tego termin (jutro, za tydzień, wybrana data z opcjonalną godziną, bez
      daty) i powtarzalność (codziennie, co tydzień, co miesiąc, co rok)
    </dd>
    <dt>Przeciągnięcie na notatki</dt>
    <dd>
      bierze pozycję na dziś. Pozycja z godziną pyta o kategorię i staje się blokiem, jeśli
      miejsce jest wolne; gdy zajęte, zostaje zwykłą pozycją
    </dd>
    <dt>Termin</dt>
    <dd>pozycja z datą przechodzi do notatek w swoim dniu</dd>
  </dl>

  <h3>Ustawienia i dane</h3>
  <dl class="keys">
    <dt>Kategorie <span class="kb"><kbd>C</kbd></span></dt>
    <dd>nazwa, ikona, kolor, kolejność, podkategorie</dd>
    <dt>Dzień <span class="kb"><kbd>D</kbd></span></dt>
    <dd>
      zakres godzin, pory dnia i powiadomienia kwadrans przed blokiem i na jego starcie — tylko
      przy otwartej karcie
    </dd>
    <dt>Dane</dt>
    <dd>
      wszystko żyje wyłącznie w tej przeglądarce; kopia zapasowa JSON jest jedynym
      zabezpieczeniem, a jej wczytanie zastępuje bieżący stan
    </dd>
    <dt>Motyw</dt>
    <dd>przycisk w nagłówku: automatyczny, jasny, ciemny</dd>
    <dt>Cofanie</dt>
    <dd>
      „Cofnij" w komunikacie <span class="kb">albo <kbd>Ctrl</kbd> <kbd>Z</kbd></span> — cofa
      każdą zmianę po kolei
    </dd>
    <dt class="kb"><kbd>?</kbd> <kbd>Esc</kbd></dt>
    <dd class="kb">ta pomoc; zamknięcie okna lub menu</dd>
  </dl>

  <div class="sh-actions">
    <span class="sp"></span>
    <button class="btn primary" onclick={closeAll}>Zaczynam</button>
  </div>
</div>
