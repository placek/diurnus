# Diurnus — maszyna stanów pozycji: projekt

**Status:** graf zaakceptowany, maszyna zaimplementowana jako osobny moduł, aplikacja jeszcze
z niej nie korzysta · **Data:** 2026-09-25 · **Kod:** [`src/lib/machine.ts`](../../../src/lib/machine.ts),
testy [`test/machine.test.ts`](../../../test/machine.test.ts)

## 1. Cel

Jedna, deterministyczna maszyna stanów dla wszystkiego, co żyje w dwóch polach: **dziś**
i **backlogu**. Każda pozycja jest w dokładnie jednym stanie naraz, każde przejście jest
nazwane, a zdarzenie, którego graf nie przewiduje, kończy się nazwaną odmową zamiast cichej
zmiany albo cichego braku zmiany. Siatka dnia nie ma własnych danych: to rzut dzisiejszych
zadań, które mają slot.

Obecny model trzyma dla rzeczy z godziną dwa rekordy, pozycję i blok, i po każdej zmianie
uzgadnia je osobną funkcją. Z tego podziału biorą się stany bez wyjścia: godzina pozycji
z backlogu ginie w jej dniu, przegapiony plan wisi jako „planowany", odłożenie bloku do
backlogu go duplikuje, a zegar zmienia stan poza historią cofania. Nowa maszyna ma te
problemy usunąć z założenia, nie łatać.

## 2. Decyzje

| Pytanie | Decyzja |
|---|---|
| Język | **TypeScript**: unie z dyskryminatorem i sprawdzenie wyczerpania przypadków |
| Tworzenie | W dziś albo w backlogu, zawsze jako otwarte zadanie |
| Odhaczenie | W dziś; odhaczone w backlogu przenosi się do dziś |
| Cofnięcie odhaczenia | Każde wykonane zadanie może znów stać się otwarte |
| Notatka | W obu polach; notatka może wrócić do zadania; **notatka nigdy nie ma czasu** |
| Czas w dziś | Slot: godzina i kwadrans; **slot trwa zawsze 30 minut** |
| Czas w backlogu | Data, data ze slotem albo wzorzec; wzorzec może mieć slot |
| Zmiana czasu | Każde wiązanie można zdjąć albo zamienić na dowolne inne |
| Ruch bez czasu | Pozycja bez czasu przechodzi swobodnie między polami |
| Dziś ze slotem → backlog | Staje się pozycją z dzisiejszą datą i tym samym slotem |
| Backlog ze slotem → dziś | Staje się dzisiejszym zadaniem z tym samym slotem; data przepada |
| Data nadchodzi | O świcie pozycje z datą dziś lub wcześniejszą przychodzą do dziś, ze slotem |
| Wzorzec pasuje | O świcie **kopia** przychodzi do dziś; wzorzec zostaje w backlogu |
| Wzorzec odhaczony w backlogu | Wykonana kopia w dziś; wzorzec zostaje |
| Zajęty slot | Przejście jest **odmawiane** |
| Odmowa przyjścia o świcie | Pozycja zostaje w backlogu z datą i **ponawia o kolejnym świcie** |
| Upływ slotu | Nie zmienia stanu; wykonanie oznacza wyłącznie użytkownik |
| Północ | Otwarte zadania przechodzą do nowego dnia; notatki zostają w swoim dniu |
| Wykonane zadania | Nie ruszają się nigdzie: ani do backlogu, ani o północy |

## 3. Graf

Graf w brzmieniu zaakceptowanym w rozmowie. Każda strzałka ma w testach własny przypadek.

```mermaid
stateDiagram-v2
  direction LR
  state Today {
    T_Task: task
    T_TaskSlot: task @ slot
    T_Done: done
    T_DoneSlot: done @ slot
    T_Note: note
  }
  state Backlog {
    B_Task: task
    B_Date: task @ date
    B_DateSlot: task @ date + slot
    B_Rec: task @ pattern, slot optional
    B_Note: note
  }
  Past: past day, read-only

  [*] --> T_Task: create in today
  [*] --> B_Task: create in backlog

  T_Task --> T_Done: mark done
  T_TaskSlot --> T_DoneSlot: mark done
  T_Done --> T_Task: undo
  T_DoneSlot --> T_TaskSlot: undo
  B_Task --> T_Done: mark done
  B_Date --> T_Done: mark done
  B_DateSlot --> T_DoneSlot: mark done
  B_Rec --> T_Done: mark done, copy
  B_Rec --> T_DoneSlot: mark done, copy with slot

  T_Task --> T_Note: to note
  T_Note --> T_Task: to task
  B_Task --> B_Note: to note
  B_Note --> B_Task: to task

  T_Task --> T_TaskSlot: assign slot
  T_TaskSlot --> T_Task: remove slot
  T_TaskSlot --> T_TaskSlot: change slot

  B_Task --> B_Date: assign date
  B_Task --> B_DateSlot: assign date and slot
  B_Task --> B_Rec: assign pattern
  B_Date --> B_Task: remove time
  B_DateSlot --> B_Task: remove time
  B_Rec --> B_Task: remove time
  B_Date --> B_DateSlot: rebind
  B_DateSlot --> B_Date: rebind
  B_Date --> B_Rec: rebind
  B_Rec --> B_Date: rebind
  B_DateSlot --> B_Rec: rebind
  B_Rec --> B_DateSlot: rebind
  B_Date --> B_Date: change date
  B_DateSlot --> B_DateSlot: change date or slot
  B_Rec --> B_Rec: change pattern

  T_Task --> B_Task: move
  B_Task --> T_Task: move
  T_Note --> B_Note: move
  B_Note --> T_Note: move
  T_TaskSlot --> B_DateSlot: move, date becomes today
  B_DateSlot --> T_TaskSlot: move, date dropped
  B_Date --> T_Task: move, date dropped

  B_Date --> T_Task: day start, date reached
  B_DateSlot --> T_TaskSlot: day start, date reached
  B_Rec --> T_Task: day start, pattern matches, copy
  B_Rec --> T_TaskSlot: day start, pattern with slot matches, copy

  T_Task --> T_Task: midnight, carried
  T_TaskSlot --> T_Task: midnight, carried, slot dropped
  T_Done --> Past: midnight
  T_DoneSlot --> Past: midnight
  T_Note --> Past: midnight
```

Usunięcie zabiera pozycję z każdego stanu; cofnięcie przywraca poprzednią migawkę, jak dziś.

## 4. Reguły poza grafem

- **Slot** to początek na pełnym kwadransie i zawsze 30 minut. W dziś musi zmieścić się
  w godzinach dnia z ustawień i nie może nachodzić na slot innego dzisiejszego zadania,
  także wykonanego.
- **Odmowa** zostawia stan nietknięty. Maszyna zna sześć powodów: nieznana pozycja,
  powtórzony identyfikator, przejście spoza grafu, zajęty slot, slot poza dniem, zła data.
- **Zegar** wchodzi jednym zdarzeniem: przesunięciem dnia. Dla każdego dnia po kolei
  wykonuje północ, potem świt. Aplikacja zamknięta na tydzień przechodzi siedem północy.
- **Północ przed świtem**: przeniesione zadania tracą sloty, zanim przychodzące je zajmą.

## 5. Rozstrzygnięcia implementacji

Graf nie przesądzał kilku szczegółów. Przyjęte rozstrzygnięcia, do zmiany na życzenie:

1. **Spór o slot o świcie.** Najpierw przychodzą pozycje z datą, potem kopie wzorców: data
   jest mocniejszym zobowiązaniem niż wzorzec. W obrębie grupy decyduje kolejność pozycji.
2. **Pierwsze wystąpienie nowego wzorca** liczy się od jutra, bo dzisiejszy świt już minął.
   Wzorzec pasujący do dziś nie przysyła więc kopii dziś.
3. **Odhaczenie wzorca w backlogu** przesuwa jego następne wystąpienie za odhaczone. Jeśli
   wystąpienie było zaległe, następne liczy się od jutra.
4. **Notatką** staje się tylko otwarte zadanie bez czasu, zgodnie z grafem. Zadanie z czasem
   trzeba najpierw go pozbawić. Wykonane zadanie nie staje się notatką.
5. **Kopie wzorca** dostają identyfikator `wzorzec@data`, więc świt jest deterministyczny
   bez generatora identyfikatorów. Kopia odhaczona z backlogu bierze identyfikator ze
   zdarzenia.

## 6. Znana konsekwencja do decyzji

Codzienny wzorzec, którego kopii się nie odhacza, zostawia kopię z każdego dnia: kopia jest
otwartym zadaniem, a otwarte zadania przechodzą na następny dzień. Po tygodniu nieobecności
to siedem kopii. Wynika to wprost z zaakceptowanych reguł; test to dokumentuje. Możliwa
poprawka: wzorzec nie przysyła kopii, dopóki poprzednia jest otwarta.

## 7. Co dalej

Moduł jest gotowy i przetestowany, ale aplikacja nadal działa na starym modelu. Podłączenie to
osobny krok, bo zmienia zachowanie i zapisane dane:

- migracja schematu v5 do nowego modelu, łącznie z usunięciem sugestii i bloków odrzuconych;
- siatka jako rzut dzisiejszych zadań ze slotem, bez klikania „start" i bez samoczynnego
  kończenia bloku;
- okienko daty z ostatnim wyborem 30 minut przed końcem dnia;
- zegar aplikacji wysyłający przesunięcie dnia zamiast mutować stan w timerze;
- kategorie pozostają danymi pozycji, poza maszyną.

## 8. Testy

- Każda strzałka grafu ma przypadek w tabeli testów.
- Każda odmowa ma przypadek, w tym przeszłość tylko do odczytu.
- Północ i świt: przeniesienie, zostawanie w dniu, przyjścia, spór o slot, ponowienie,
  tydzień nieobecności.
- Własności na losowych ciągach zdarzeń z kilku ziaren: niezmienniki po każdym kroku,
  odmowa nie dotyka stanu, ten sam ciąg daje ten sam stan.
- Żaden stan poza przeszłością nie jest ślepym zaułkiem.
- Typy nie pozwalają zbudować wykonanego zadania w backlogu ani notatki z czasem.
