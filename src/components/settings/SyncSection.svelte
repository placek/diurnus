<script lang="ts">
  import { app } from '../../state.svelte';
  import {
    changeToken,
    disconnect,
    dismissConflict,
    finishConnect,
    loadSaved,
    overwriteMine,
    overwriteRejected,
    planConnect,
    prepare,
    sync,
    syncNow,
  } from '../../sync.svelte';
  import type { StoreConfig } from '../../sync.svelte';
  import { describeStatus } from '../../lib/sync/describe';
  import type { FirstPlan, Summary } from '../../lib/sync/engine';
  import Icon from '../Icon.svelte';

  /*
   * Synchronizacja: wybór magazynu, połączenie z repozytorium GitHub (z jednym
   * pytaniem, gdy dane są po obu stronach), stan, konflikty i rozłączenie.
   * Konfiguracja żyje w `diurnus.sync`; sekcja czyta ją przy każdej zmianie stanu
   * synchronizacji, bo połączyć albo rozłączyć mogła też inna karta.
   */

  const SHOWN = 8;
  const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

  const cfg = $derived.by((): StoreConfig | null => {
    void sync.status; // przelicz po każdej zmianie stanu synchronizacji
    return loadSaved().config;
  });

  let kind = $state<'local' | 'github'>('local');
  let repo = $state('');
  let branch = $state('');
  let dir = $state('');
  let token = $state('');

  /** trwa sprawdzanie albo pierwsza wymiana z magazynem */
  let working = $state<string | null>(null);
  let errors = $state<string[]>([]);
  /** repozytorium publiczne — czeka na „Połącz mimo to" */
  let publicCfg = $state<StoreConfig | null>(null);
  /** dane po obu stronach — czeka na wybór */
  let asking = $state<{ cfg: StoreConfig; plan: Extract<FirstPlan, { kind: 'ask' }> } | null>(null);
  let newToken = $state('');
  let editingToken = $state(false);

  const status = $derived(sync.status ? describeStatus(sync.status, app.now) : null);

  const pl = (n: number, one: string, few: string, many: string) =>
    n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;

  const summary = (s: Summary) =>
    `${s.items} ${pl(s.items, 'pozycja', 'pozycje', 'pozycji')}` +
    (s.first ? (s.first === s.last ? `, dzień ${s.first}` : `, ${s.first} – ${s.last}`) : '');

  const fail = (e: unknown) => [e instanceof Error ? e.message : String(e)];

  function reset() {
    working = null;
    publicCfg = null;
    asking = null;
  }

  async function connect() {
    errors = [];
    working = 'Sprawdzam repozytorium…';
    const p = await prepare({ repo, branch, dir, token });
    if (!p.ok) {
      errors = [p.message];
      working = null;
      return;
    }
    if (!p.check.private) {
      publicCfg = p.cfg;
      working = null;
      return;
    }
    await plan(p.cfg);
  }

  async function plan(c: StoreConfig) {
    publicCfg = null;
    working = 'Czytam dziennik z repozytorium…';
    let first: FirstPlan;
    try {
      first = await planConnect(c);
    } catch (e) {
      errors = fail(e);
      working = null;
      return;
    }
    if (first.kind === 'ask') {
      asking = { cfg: c, plan: first };
      working = null;
      return;
    }
    await finish(c, first, first.kind);
  }

  async function finish(c: StoreConfig, p: FirstPlan, choice: 'pull' | 'push') {
    asking = null;
    working = choice === 'pull' ? 'Pobieram dziennik…' : 'Wysyłam dziennik…';
    let errs: string[] | null;
    try {
      errs = await finishConnect(c, p, choice);
    } catch (e) {
      errs = fail(e);
    }
    working = null;
    if (errs) {
      errors = errs;
      return;
    }
    token = '';
    errors = [];
    app.toast = {
      msg: choice === 'pull' ? 'Połączono — dziennik pobrany z repozytorium' : 'Połączono',
      undoable: false,
    };
  }

  function onDisconnect() {
    const ok = confirm(
      'Rozłączyć synchronizację? Dziennik zostaje w tej przeglądarce i w repozytorium; ' +
        'z przeglądarki znika tylko token.',
    );
    if (!ok) return;
    disconnect();
    reset();
    errors = [];
    kind = 'local';
  }

  async function saveToken() {
    errors = [];
    working = 'Sprawdzam token…';
    const e = await changeToken(newToken);
    working = null;
    if (e) {
      errors = [e];
      return;
    }
    newToken = '';
    editingToken = false;
    app.toast = { msg: 'Token zmieniony', undoable: false };
  }
</script>

<section class="sync" aria-label="Synchronizacja">
  <h3 class="sync-h">Synchronizacja</h3>

  {#if cfg}
    <p class="sync-repo">
      <Icon name="github" fallback="GH" />
      <a href="https://github.com/{cfg.owner}/{cfg.repo}" target="_blank" rel="noopener noreferrer"
        >{cfg.owner}/{cfg.repo}</a
      >
      <span class="sync-meta">{cfg.branch}{cfg.dir ? ` · ${cfg.dir}/` : ''}</span>
    </p>
    {#if status}
      <p class="sync-status {status.tone}" role="status">{status.text}</p>
    {/if}
    {#if cfg.expires}
      <p class="hint">Token ważny do <b>{cfg.expires}</b>.</p>
    {/if}

    {#each sync.status?.conflicts ?? [] as c (c.name)}
      <div class="sync-conflict" role="alert">
        <p>
          <code>{c.name}</code> zmienił się też gdzie indziej — została wersja z repozytorium.
          {#if c.mine === null}Tu ten dokument był usunięty.{/if}
        </p>
        <div class="sync-row">
          <button class="btn" onclick={() => overwriteMine(c)}>Nadpisz moją wersją</button>
          <button class="btn" onclick={() => dismissConflict(c.name)}>Zostaw</button>
        </div>
      </div>
    {/each}

    {#if sync.status?.rejected}
      {@const r = sync.status.rejected}
      <div class="import-errors" role="alert">
        <b>Nie wczytano zmian z repozytorium</b> ({r.names.join(', ')}):
        <ul>
          {#each r.errors.slice(0, SHOWN) as err, i (i)}<li>{err}</li>{/each}
        </ul>
        {#if r.errors.length > SHOWN}<p>…i jeszcze {r.errors.length - SHOWN}</p>{/if}
        <p>Popraw je w repozytorium albo nadpisz je wersją z tej przeglądarki.</p>
        <div class="sync-row">
          <button class="btn" onclick={overwriteRejected}>Nadpisz moją wersją</button>
        </div>
      </div>
    {/if}

    {#if editingToken || sync.status?.phase === 'auth'}
      <label class="dp-field">
        Nowy token
        <input
          type="password"
          autocomplete="off"
          spellcheck="false"
          bind:value={newToken}
          placeholder="github_pat_…"
        />
      </label>
      <div class="sync-row">
        <button class="btn primary" disabled={!!working} onclick={saveToken}>Zapisz token</button>
        {#if editingToken}
          <button class="btn" onclick={() => (editingToken = false)}>Anuluj</button>
        {/if}
      </div>
    {/if}

    {#if working}<p class="sync-status busy">{working}</p>{/if}
    {#if errors.length}
      <div class="import-errors" role="alert">
        {#each errors as err, i (i)}<p>{err}</p>{/each}
      </div>
    {/if}

    <div class="sync-row">
      <button
        class="btn"
        disabled={sync.status?.phase === 'busy' || sync.status?.phase === 'auth'}
        onclick={syncNow}
      >
        <Icon name="rotate" fallback="↻" />Synchronizuj teraz
      </button>
      {#if !editingToken && sync.status?.phase !== 'auth'}
        <button class="btn" onclick={() => (editingToken = true)}>Zmień token</button>
      {/if}
      <span class="sp"></span>
      <button class="btn danger" onclick={onDisconnect}>Rozłącz</button>
    </div>
  {:else}
    <div class="sync-kind" role="radiogroup" aria-label="Gdzie trzymać dziennik">
      <label>
        <input type="radio" name="sync-kind" value="local" bind:group={kind} />
        Tylko ta przeglądarka
      </label>
      <label>
        <input type="radio" name="sync-kind" value="github" bind:group={kind} />
        GitHub
      </label>
    </div>

    {#if kind === 'github'}
      <ol class="hint sync-steps">
        <li>Załóż <b>prywatne</b> repozytorium, np. <code>diurnus-data</code> (może być puste).</li>
        <li>
          Utwórz <a href={TOKEN_URL} target="_blank" rel="noopener noreferrer">token fine-grained</a
          >: dostęp tylko do tego repozytorium, uprawnienie <i>Contents: Read and write</i>, z datą
          wygaśnięcia.
        </li>
        <li>Wpisz je poniżej. Token zostaje wyłącznie w tej przeglądarce.</li>
      </ol>

      <label class="dp-field">
        Repozytorium
        <input
          bind:value={repo}
          placeholder="właściciel/nazwa"
          autocomplete="off"
          spellcheck="false"
          disabled={!!working || !!asking || !!publicCfg}
        />
      </label>
      <label class="dp-field">
        Token
        <input
          type="password"
          bind:value={token}
          placeholder="github_pat_…"
          autocomplete="off"
          spellcheck="false"
          disabled={!!working || !!asking || !!publicCfg}
        />
      </label>
      <details class="sync-more">
        <summary>Gałąź i katalog</summary>
        <label class="dp-field">
          Gałąź
          <input bind:value={branch} placeholder="domyślna gałąź repozytorium" spellcheck="false" />
        </label>
        <label class="dp-field">
          Katalog w repozytorium
          <input bind:value={dir} placeholder="korzeń repozytorium" spellcheck="false" />
        </label>
      </details>

      {#if working}<p class="sync-status busy">{working}</p>{/if}
      {#if errors.length}
        <div class="import-errors" role="alert">
          {#each errors.slice(0, SHOWN) as err, i (i)}<p>{err}</p>{/each}
          {#if errors.length > SHOWN}<p>…i jeszcze {errors.length - SHOWN}</p>{/if}
        </div>
      {/if}

      {#if publicCfg}
        {@const c = publicCfg}
        <div class="sync-conflict" role="alert">
          <p>
            Repozytorium <b>{c.owner}/{c.repo}</b> jest <b>publiczne</b> — dziennik będzie widoczny dla
            każdego.
          </p>
          <div class="sync-row">
            <button class="btn" onclick={() => plan(c)}>Połącz mimo to</button>
            <button class="btn" onclick={reset}>Anuluj</button>
          </div>
        </div>
      {:else if asking}
        {@const a = asking}
        <div class="sync-ask" role="alert">
          <p>Dziennik jest i tu, i w repozytorium. Który zostaje?</p>
          <ul>
            <li>W tej przeglądarce: <b>{summary(a.plan.local)}</b></li>
            <li>W repozytorium: <b>{summary(a.plan.remote)}</b></li>
          </ul>
          <div class="sync-row">
            <button class="btn" onclick={() => finish(a.cfg, a.plan, 'pull')}
              >Pobierz z repozytorium</button
            >
            <button class="btn" onclick={() => finish(a.cfg, a.plan, 'push')}>Wyślij moje</button>
            <button class="btn" onclick={reset}>Anuluj</button>
          </div>
          <p class="hint">
            „Pobierz" zastąpi dziennik w tej przeglądarce; „Wyślij moje" zastąpi go w repozytorium
            (poprzednie wersje zostają w historii repozytorium).
          </p>
        </div>
      {:else}
        <button class="btn primary sync-go" disabled={!!working} onclick={connect}>Połącz</button>
      {/if}
    {/if}
  {/if}
</section>
