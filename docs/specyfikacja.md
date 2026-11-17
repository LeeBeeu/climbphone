# ClimbPhone — specyfikacja funkcjonalna

Stan na: 2026-11-17 · wersja 1.1

Źródła: analiza „Crimpd, Lattice i Libra — specyfikacja funkcjonalności” (17.11.2026), szkic specyfikacji z tego samego dnia i kod w repozytorium. Bierzemy wybrane funkcje tych aplikacji, nie ich kopię.

Legenda statusu: ✅ zrobione · 🟡 częściowo · ⬜ do zrobienia

## Cel i zasady

Aplikacja ma być osobistym narzędziem wspinacza. Łączy notowanie masy ciała (wzorem Libry), wykonywanie i logowanie treningów (wzorem Crimpd) oraz prostą adaptację planu (wzorem Lattice). Pierwszy etap to moduł masy ciała, bo jest powiązany z celami i siłą względną w treningu.

**Zasady produktowe**

1. Jeden użytkownik (właściciel), bez subskrypcji i funkcji społecznościowych, dopóki nie zdecydujemy inaczej.
2. Polski interfejs i polskie realia: skala Kurtyki obok francuskiej, UIAA i Font.
3. Najszybszy możliwy wpis: waga rano jednym tapnięciem, seria w treningu jednym dotknięciem.
4. Trend ważniejszy od pojedynczego pomiaru: aplikacja ma uspokajać, nie straszyć dziennymi wahaniami.
5. Offline-first: wszystko działa bez sieci, dane są u użytkownika, eksport zawsze dostępny.
6. Każda liczba wyliczana przez aplikację ma widoczny wzór (luka w Crimpd: niewyjaśniony workload).
7. **Gotowość do migracji**: dane mają jawny model z nazwami pól jak w tej specyfikacji, a obliczenia są w osobnych modułach bez kodu ekranu, z testami. Przejście na inny stos (np. Flutter + Supabase) oznacza przepisanie interfejsu, nie danych ani logiki.

## Decyzje

| Decyzja | Wybór | Uzasadnienie |
| --- | --- | --- |
| Stos | PWA: HTML, CSS i JavaScript bez frameworka i bez kroku budowania | Aplikacja już działa na komputerze i Samsungu; jeden kod, offline. Flutter + Supabase możliwy później (zasada 7). |
| Dane | Lokalnie na urządzeniu (localStorage), przenoszenie plikiem kopii | Bez kont i chmury; dane u użytkownika. Synchronizacja dopiero, gdy będzie potrzebna. |
| Hosting | GitHub Pages (repozytorium LeeBeeu/climbphone, folder `app/`) | HTTPS jest wymagane do instalacji PWA na Androidzie. Dane prywatne (`data/`) nie trafiają do repozytorium. |
| Metoda trendu wagi | Domyślnie jak w Librze (stała czasowa τ = 7 dni); Hacker's Diet (α = 0,1) jako opcja | Sprawdzone na prawdziwym eksporcie z Libry: trend zgodny w 342 na 342 pomiarach (po zaokrągleniu do 0,1 kg). Szkic zakładał Hacker's Diet. Szczegóły w sekcji „Wzory”. |
| Ekran startowy | Waga | Wymóg MC-01: wpis porannej wagi z ekranu głównego. |
| Format importu z Libry | Potwierdzony na pliku z 17.11.2026 | Opis w sekcji „Format CSV z Libry”. |

## Stan obecny aplikacji

| Obszar | Stan dziś | Uwagi |
| --- | --- | --- |
| Stos technologiczny | PWA: czysty JavaScript (moduły ES), CSS z tokenami kolorów, service worker; testy obliczeń w Node (`npm test`) | Bez zależności npm. Lokalny podgląd: `npm start` (port 5173). |
| Platformy | Przeglądarka na komputerze; Samsung (Android) jako zainstalowana PWA z https://leebeeu.github.io/climbphone/ | Działa offline po pierwszym uruchomieniu. |
| Przechowywanie danych | Lokalnie: jeden obiekt w localStorage (`climbphone.v1`) na każdym urządzeniu osobno | Kopia i przenoszenie: Ustawienia → Eksport/Import (JSON). |
| Gotowe ekrany i funkcje | Waga, Timer, Dziennik, Przejścia, Plany, Ustawienia | Szczegóły w tabeli poniżej. |
| Struktura danych | Kolekcje: `weightEntries`, `weightGoals`, `sessions`, `ascents`, `plans`, `planChecks`, `timerPresets`, `settings` | Model wagi w sekcji Etapu 1; pozostałe opisane w kodzie (`app/js/store.js`). |

**Ekrany dziś**

| Ekran | Co robi | Odpowiednik w etapach |
| --- | --- | --- |
| Waga | Szybki wpis, trend, tempo, cel i prognoza, wykres, lista pomiarów, import i eksport CSV | Etap 1 (MVP gotowe, odebrane na telefonie 17.11.2026) |
| Timer | Protokoły zwisów (repeaters, max hangs, wytrzymałość, rozgrzewka) i własne; fazy przygotowanie, zwis, odpoczynek, przerwa między seriami; dźwięk, wibracja, blokada wygaszania ekranu; obciążenie w kg albo % masy ciała (z trendu wagi); zapis do dziennika z obciążeniem | Etap 2: timer 🟡 |
| Dziennik | Sesje treningowe: data, rodzaj, czas, RPE, notatki; podsumowanie tygodnia i miesiąca | Etap 2: podstawa kalendarza 🟡 |
| Przejścia | Drogi i bouldery w modelu 8a.nu: rejon, sektor, styl (OS, Flash, RP, wędka, próba), próby, ocena, soft/hard, FA, charakter drogi; import z 8a.nu; logbook z sortowaniem po dacie i trudności; scorecard i piramida wycen | Etap 4: drogi w skałach 🟡 (brak GPS i zdjęć) |
| Plany | Plany tygodniowe z dniami i ćwiczeniami do odhaczania, dwa szablony, edytor | Etap 3: plan 🟡 (brak faz i objętości) |
| Ustawienia | Skale wycen, ustawienia trendu wagi, kopia zapasowa, import z 8a.nu, instalacja | NF-08 ✅ |

## Etapy

Kolejność bez zmian, ale zakres przestawiony tak, żeby nie budować drugi raz tego, co już działa.

| Etap | Nazwa | Zakres | Stan |
| --- | --- | --- | --- |
| 1 | Masa ciała | Wpis i trend; tempo i prognoza celu; import i eksport CSV | ✅ MVP (17.11.2026), v2 do zrobienia |
| 2 | Rdzeń treningowy | Profil (nowy); biblioteka ćwiczeń (nowa); **rozbudowa obecnego timera** o logowanie serii, wznowienie i „Dopasuj”; kalendarz na bazie obecnego dziennika | ⬜ |
| 3 | Plan i postępy | **Rozbudowa obecnych planów** o fazy i objętość; tygodniowy check-in; testy; analityka | ⬜ |
| 4 | Wyróżniki | Drogi w skałach: **dodać GPS, zdjęcia i historię prób** (reszta gotowa); tensjometr Tindeq; sesja wspinania na żywo | 🟡 |

Każdy kolejny etap rozpisujemy szczegółowo dopiero przed jego startem.

## Etap 1 — Masa ciała: wpis, trend, cel

Moduł odpowiada na trzy pytania: ile ważę naprawdę (trend), w jakim tempie się zmieniam i kiedy dojdę do celu. Wzorem jest Libra i metoda The Hacker's Diet.

**Wpis pomiaru**

| ID | Wymaganie | Priorytet | Stan |
| --- | --- | --- | --- |
| MC-01 | Szybki wpis z ekranu głównego: pole wagi wstępnie wypełnione ostatnim pomiarem, zmiana o ±0,1 kg, zapis jednym tapnięciem | MVP | ✅ |
| MC-02 | Data i godzina domyślnie „teraz”, z możliwością zmiany (wpis wstecz) | MVP | ✅ |
| MC-03 | Pola opcjonalne: % tkanki tłuszczowej, notatka tekstowa | MVP | ✅ |
| MC-04 | Wiele wpisów dziennie; wartość dnia: pierwszy pomiar albo średnia dnia (ustawienie) | MVP | ✅ W metodzie Libry trend liczy się z każdego pomiaru, a wartość dnia to punkt na wykresie. |
| MC-05 | Walidacja: zakres 30–200 kg, pytanie „Na pewno?” przy zmianie o ponad 2 kg wobec trendu | MVP | ✅ |
| MC-06 | Codzienne przypomnienie o wybranej godzinie, domyślnie rano | v2 | ⬜ PWA: powiadomienia wymagają zgody i nie gwarantują dokładnej godziny. |

**Trend i tempo**

| ID | Wymaganie | Priorytet | Stan |
| --- | --- | --- | --- |
| MC-10 | Linia trendu wygładzająca dzienne wahania; metoda i parametr do zmiany w ustawieniach | MVP | ✅ Domyślnie metoda Libry (τ = 7 dni), opcjonalnie Hacker's Diet (α = 0,1). |
| MC-11 | Dni bez pomiaru nie dodają punktów; linia trendu jest ciągła | MVP | ✅ W metodzie Libry przerwa osłabia stary trend (tak liczy Libra), w Hacker's Diet go nie zmienia. |
| MC-12 | Tempo w kg/tydzień z nachylenia trendu z ostatnich 14 dni | MVP | ✅ |
| MC-13 | Ocena tempa wobec celu: w zakresie, za szybko, za wolno, stoi; dodatkowo „w przeciwną stronę” i „w celu” | MVP | ✅ |

**Cel i prognoza**

| ID | Wymaganie | Priorytet | Stan |
| --- | --- | --- | --- |
| MC-20 | Cel jako przedział masy (np. 74–76 kg) i docelowe tempo (np. od −0,3 do −0,5 kg/tydzień); zmiana celu zapisuje poprzedni w historii | MVP | ✅ |
| MC-21 | Prognozowana data wejścia w przedział celu z bieżącego trendu i tempa; linia prognozy na wykresie | MVP | ✅ Działa też dla celu „przybrać”. |
| MC-22 | Gdy tempo prowadzi od celu albo jest bliskie zeru: „przy obecnym tempie cel nie jest osiągany” zamiast daty | MVP | ✅ |
| MC-23 | Reguła zastoju: trend stoi przez 14 dni (zmiana poniżej 0,2 kg) → podpowiedź użytkownika, domyślnie „Więcej spacerów, nie mniej kalorii.”; treść edytowalna | MVP | ✅ |
| MC-24 | Po wejściu w przedział celu tryb utrzymania: ocena, czy trend mieści się w przedziale | v2 | 🟡 Jest status „w celu”; brak osobnego trybu. |

## Etap 1 — Masa ciała: ekrany i powiązanie z treningiem

Moduł ma jeden ekran „Waga” (ekran startowy) z sekcjami: wpis, kafel, wykres, cel, lista pomiarów, import i eksport.

**Ekrany**

| ID | Ekran | Zawartość | Priorytet | Stan |
| --- | --- | --- | --- | --- |
| MC-30 | Wykres | Punkty dzienne w tle, linia trendu, przedział celu jako pas, linia prognozy; przewijanie; przycisk „Dziś”; przycisk zapisu nie zasłania wykresu | MVP | 🟡 Przewijanie przeciąganiem działa; powiększanie gestem (pinch) do v2, zamiast niego zakresy z MC-31. |
| MC-31 | Wykres — zakres | 2 tygodnie, 3 miesiące, rok, całość; rysowane tylko widoczne dane | MVP | ✅ |
| MC-32 | Kafel | Trend, zmiana od tygodnia, tempo z oceną, dni do celu z datą; ostrzeżenie, gdy ostatni pomiar jest starszy niż 7 dni | MVP | ✅ |
| MC-33 | Statystyki | Zmiana w kg i % za tydzień, miesiąc, od początku; BMI opcjonalne i domyślnie ukryte | v2 | ⬜ |
| MC-34 | Zmiany miesięczne | Wykres słupkowy zmian trendu miesiąc do miesiąca | v2 | ⬜ (zmiana miesiąca jest już w nagłówkach listy) |
| MC-35 | Lista pomiarów | Najnowsze na górze, wartość, trend, % tłuszczu, notatka; edycja i usunięcie; zmiana trendu dla każdego miesiąca | MVP | ✅ |

**Okresy z nazwami**

| ID | Wymaganie | Priorytet | Stan |
| --- | --- | --- | --- |
| MC-40 | Okres: nazwa, data od–do, np. „redukcja”, „blok Chulilla”; autouzupełnianie nazw | v2 | ⬜ |
| MC-41 | Okresy widoczne jako pasy na wykresie wagi, a później także na wykresach treningu | v2 | ⬜ |

**Powiązanie z treningiem**

| ID | Wymaganie | Priorytet | Stan |
| --- | --- | --- | --- |
| MC-50 | Aktualna masa w treningu = trend z dnia treningu (nie pojedynczy pomiar) | v2 | ✅ Timer bierze trend z ostatniego pomiaru (`currentBodyWeight()` w `load-calc.js`); gdy pomiar ma ponad 7 dni, prosi o zważenie się; bez pomiarów masę wpisuje się w timerze. |
| MC-51 | Przy zwisach i podciąganiu z obciążeniem: obciążenie łączne = masa + dodatkowy ciężar, oraz % masy ciała | v2 | ✅ Zwisy: w timerze dociążenie w kg (ujemne = odciążenie na bloczku) albo cel w % masy ciała przeliczany na kg z krokiem 0,5 kg; obciążenie widać w trakcie treningu, w podsumowaniu można poprawić faktyczne dociążenie; sesja w dzienniku zapisuje `hang_load` {`body_weight_kg`, `added_kg`, `total_kg`, `pct_bw`} z masą „zamrożoną” w dniu treningu; timer podpowiada ostatnie obciążenie z tym protokołem. Serie logowane osobno, sesja bierze najcięższą ukończoną. Ćwiczenia poza timerem (dziennik): podciąganie, dipy itp. jako serie powtórzenia × dociążenie, % MC z trendu wagi w dniu treningu (`body_weight_kg` w sesji); ćwiczenia z ciężarem (martwy ciąg itp.) w kg bez % MC; ćwiczenia z masą ciała są też na wykresie siły względnej (najcięższa seria dnia). |
| MC-52 | Wykres siły względnej (np. max zwis na 20 mm w % masy) obok trendu wagi | v2 | 🟡 Pod wykresem wagi, ta sama oś czasu, zakres i przewijanie; wybór protokołu z timera; punkt = najwyższy % MC dnia (`strengthSeries()`), linia 100% = sama masa ciała; ostatni i najlepszy wynik. Sesja bez zapisanej masy bierze trend z dnia treningu. Wyniki testów (np. max zwis na 20 mm) dojdą w Etapie 3. |

**Import i eksport**

| ID | Wymaganie | Priorytet | Stan |
| --- | --- | --- | --- |
| MC-60 | Import historii z CSV z Libry, z podglądem (liczba nowych, duplikatów, błędów, zakres dat) i pominięciem duplikatów | MVP | ✅ Sprawdzone na prawdziwym eksporcie: 342 pomiary, 1 duplikat pominięty. |
| MC-61 | Eksport wszystkich pomiarów do CSV (data ISO 8601 z przesunięciem strefy, kg, % tłuszczu, notatka) | MVP | ✅ |
| MC-62 | Health Connect na Androidzie (Samsung Health), waga Withings | Później | ⬜ Health Connect nie jest dostępny z PWA; wymagałby aplikacji natywnej. |
| MC-63 | Masa mięśniowa z Libry (kolumna `muscle mass`) | Do decyzji | ⬜ Import ją dziś pomija. |

## Etap 1 — dane, wzory i odbiór

Trend, tempo i prognozę liczymy w locie, nie zapisujemy ich. Kod: `app/js/weight-calc.js` (obliczenia), `app/js/weight-csv.js` (CSV), `app/js/weight.js` (ekran), testy w `tests/`.

**Model danych** (nazwy pól jak w docelowej bazie)

| Zbiór | Pola | Uwagi |
| --- | --- | --- |
| `weight_entries` (`weightEntries`) | `id`, `measured_at` (ISO 8601 z przesunięciem strefy), `weight_kg`, `body_fat_pct?`, `note`, `source` (`manual`, `import`), `created_at`, `updated_at` | Jeden wiersz na pomiar |
| `weight_goal` (`weightGoals`) | `id`, `target_min_kg`, `target_max_kg`, `pace_min_kg_week`, `pace_max_kg_week`, `start_date`, `ended_at?`, `plateau_hint` | Aktywny cel = ostatni bez `ended_at`; poprzednie zostają jako historia |
| `periods` | `id`, `name`, `date_from`, `date_to`, `color?` | v2, wspólne dla wagi i treningu |
| `settings` | `weight_trend_method` (`libra`, `ema`), `weight_trend_tau_days`, `weight_trend_alpha`, `weight_daily_mode` (`first`, `mean`), `reminder_time?`, `show_bmi`, `height_cm?` | Ostatnie trzy w v2 |

**Wzory** (widoczne w aplikacji pod „ⓘ Jak to liczymy?”, z bieżącymi liczbami)

Trend, metoda Libry (domyślna). Każdy pomiar W, Δt to czas od poprzedniego pomiaru w dniach, τ = 7:

```latex
T_n = W_n + (T_{n-1} - W_n) \, e^{-\Delta t / \tau}, \quad T_0 = W_0, \ \tau = 7 \text{ dni}
```

Po jednym dniu nowy pomiar waży ok. 13% (1 − e^(−1/7)), po długiej przerwie trend szybko zbliża się do nowego pomiaru. Tak liczy Libra: sprawdzone na jej eksporcie, zgodność 342/342 po zaokrągleniu do 0,1 kg (największa różnica 0,049 kg, czyli tylko zaokrąglenie).

Trend, metoda The Hacker's Diet (opcja). Wartość dnia W wg trybu dnia, liczona tylko dla dni z pomiarem:

```latex
T_n = T_{n-1} + \alpha \, (W_n - T_{n-1}), \quad T_0 = W_0, \ \alpha = 0{,}1
```

Tempo to nachylenie prostej dopasowanej metodą najmniejszych kwadratów do trendu z ostatnich 14 dni (licząc od ostatniego pomiaru), przeliczone na tydzień:

```latex
v = 7 \cdot \frac{\sum (d_i - \bar d)(T_i - \bar T)}{\sum (d_i - \bar d)^2} \ \text{[kg/tydz.]}
```

Prognoza: dni do celu = |trend − granica celu| / (|v| / 7), gdzie granica to górna przy chudnięciu i dolna przy przybieraniu. Liczona tylko, gdy v prowadzi do celu i |v| ≥ 0,05 kg/tydz. Jeśli wyliczona data wypada przed dziś (dawno nie było pomiaru), aplikacja prosi o pomiar zamiast pokazywać datę z przeszłości.

Zastój: |trend dziś − trend sprzed 14 dni| < 0,2 kg (wymaga historii z co najmniej 14 dni).

Obciążenie na chwytotablicy (MC-50, MC-51; kod `app/js/load-calc.js`). M to masa ciała z trendu, D to dociążenie (ujemne = odciążenie na bloczku). Procent liczymy od całkowitego obciążenia chwytów, jak w Lattice:

```latex
\text{obciążenie} = M + D, \qquad \%MC = \frac{M + D}{M} \cdot 100, \qquad D_{\text{z }\%} = \operatorname{round}_{0{,}5}\!\left(M \cdot \left(\tfrac{\%}{100} - 1\right)\right)
```

Przykład: M = 80,8 kg, cel 110% → D = 8,08 → +8 kg, obciążenie 88,8 kg.

**Format CSV z Libry** (eksport z 17.11.2026)

```text
#Version: 6
#Units: kg

#date;weight;weight trend;body fat;body fat trend;muscle mass;muscle mass trend;log
2026-11-05T05:19:57.749Z;80.4;80.8;;;;;
```

Separator `;`, linie zaczynające się od `#` to metadane i nagłówek, data w UTC, notatka w kolumnie `log`. Import obsługuje też przecinek dziesiętny, jednostkę `lb` i własny eksport ClimbPhone (`measured_at,weight_kg,body_fat_pct,note`). Duplikat = ta sama minuta i ta sama waga (±0,05 kg).

**Kryteria odbioru Etapu 1**

- [x] Wpis porannej wagi z ekranu głównego zajmuje najwyżej 2 tapnięcia (otwarcie aplikacji i „Zapisz wagę”, gdy waga jak ostatnio; każda zmiana o 0,1 kg to jedno tapnięcie więcej albo wpis z klawiatury)
- [x] Trend zgadza się z ręcznym wyliczeniem (testy, do 0,01 kg) i z trendem Libry (342/342)
- [x] Import CSV z Libry wczytuje całą historię bez duplikatów; format sprawdzony na prawdziwym eksporcie, także na telefonie Samsung (17.11.2026)
- [x] Prognoza pokazuje datę albo komunikat o nieosiąganiu celu, nigdy datę z przeszłości (test)
- [x] Reguła zastoju działa na danych testowych z 14-dniowym płaskim trendem (test)
- [x] Aplikacja działa bez sieci na komputerze i na telefonie Samsung (sprawdzone na telefonie 17.11.2026)
- [x] Eksport CSV daje się ponownie zaimportować bez utraty danych (test)

## Kolejne moduły

Po masie ciała budujemy rdzeń treningowy (Etap 2), potem plan i testy (Etap 3), a na końcu wyróżniki (Etap 4). Szczegóły każdego modułu rozpiszemy jak w Etapie 1, gdy przyjdzie jego kolej.

| Etap | Moduł | Zakres | Wzorzec | Stan dziś |
| --- | --- | --- | --- | --- |
| 2 | Profil | Masa (trend z modułu wagi), wzrost, wyceny max, sesyjna i flash dla dróg i boulderów, z historią zmian; jednostki | Crimpd | ⬜ Skale wycen są w Ustawieniach |
| 2 | Biblioteka ćwiczeń i treningów | Własne ćwiczenia i treningi; typ (Endurance, Power Endurance, Strength & Power, Conditioning, Technique) i cel; serie o różnych parametrach; ćwiczenia jednostronne; rozmiar krawądki w mm | Crimpd v9 | 🟡 Własne protokoły timera (tylko zwisy) |
| 2 | Timer | Fazy przygotowanie, praca, przerwa, pauza; dźwięki planowane z wyprzedzeniem; blokada wygaszania ekranu; wznowienie przerwanego treningu; „Dopasuj” serie i przerwy przed startem tylko na tę sesję | Crimpd + Lattice | 🟡 Są fazy, pauza, pomijanie, dźwięki, wibracja i blokada ekranu. Brak dźwięków planowanych z wyprzedzeniem, wznowienia i „Dopasuj”. |
| 2 | Logowanie serii | Obciążenie (ujemne = odciążenie), powtórzenia, wysiłek 1–5, ukończenie, notatki; „Ostatnio: 32,5 kg” i wstępne wypełnienie z poprzedniej sesji | Crimpd + Lattice | 🟡 Zwisy w timerze: w przerwie między seriami liczba ukończonych powtórzeń i dociążenie kolejnych serii (±0,5 kg); w podsumowaniu poprawka każdej serii; sesja zapisuje `hang_sets` [{`set`, `reps_planned`, `reps_done`, `added_kg`}], a `hang_load` bierze najcięższą serię z ukończonym powtórzeniem; „Ostatnio” przy protokole. Wstępne wypełnienie: po wyborze protokołu dociążenie z najcięższej ukończonej serii ostatniej sesji i podpowiedź `progression()`: wszystkie powtórzenia w seriach z tym obciążeniem → +0,5 kg, co najmniej 75% → bez zmian, mniej → −0,5 kg (przycisk „Zastosuj”; nieudana cięższa próba nie obniża oceny). Ćwiczenia poza timerem w formularzu dziennika: `exercises` [{`name`, `bodyweight`, `sets`: [{`reps`, `added_kg`}]}], katalog wbudowany + własne, serie wypełniane z ostatniego wykonania, „+ Seria” kopiuje poprzednią (`app/js/exercises.js`). Brak: wysiłku 1–5. |
| 2 | Tryb prób wspinaczkowych | „Start próby” i „Start przerwy”, czas drogi i odpoczynku; do ARC i 4×4 | Lattice | ⬜ |
| 2 | Kalendarz | Tydzień rozwijany do miesiąca; kolor według typu; statusy wykonany, częściowo, pominięty | Crimpd v9 | 🟡 Dziennik sesji jest podstawą danych |
| 3 | Plan | Tygodnie z fazami (Base, Rest, Peak, Taper), mikrocykl 3:1, objętość tygodniowa, pula treningów na tydzień i „Kopiuj poprzedni tydzień” | Crimpd + Lattice | 🟡 Plany tygodniowe z odhaczaniem, bez faz |
| 3 | Tygodniowy check-in | Obciążenie, samopoczucie, motywacja, gotowość (normalnie, deload, odpoczynek, kontuzja); sugestia Zwiększ, Utrzymaj, Zmniejsz według spisanych reguł | Lattice | ⬜ |
| 3 | Testy | Max zwis na 20 mm, podciągnięcie z obciążeniem, czas ARC; historia, wykres, wynik w % masy ciała | Crimpd + Lattice | ⬜ |
| 3 | Analityka | Kafle z porównaniem okresów, regularność, przejścia według wyceny, siła według ćwiczenia, workload z jawnym wzorem, „Project grade” i „Forma” | Crimpd + Lattice | 🟡 Scorecard i piramida wycen przejść |
| 4 | Drogi w skałach | Rejon, sektor, nazwa, styl (OS, flash, RP), próby, projekty, GPS, zdjęcia | Luka w obu | 🟡 Wszystko poza GPS i zdjęciami; import z 8a.nu |
| 4 | Tensjometr | Tindeq Progressor przez Bluetooth: siła palców w kg, krzywa siły | Luka w obu | ⬜ Web Bluetooth działa w Chrome na Androidzie |
| 4 | Sesja wspinania na żywo | Licznik prób i przejść, tagi miejsca, kąta, stylu i chwytów | Crimpd 8.3 | ⬜ |

## Wymagania niefunkcjonalne

| ID | Wymaganie | Stan |
| --- | --- | --- |
| NF-01 | Offline-first: każdy wpis zapisuje się lokalnie natychmiast; synchronizacja, jeśli będzie, działa w tle | ✅ (bez synchronizacji) |
| NF-02 | Kod w lokalnym repozytorium Git; dane użytkownika poza repozytorium | ✅ `data/` w `.gitignore` |
| NF-03 | Ta sama logika obliczeń na komputerze i telefonie, z testami jednostkowymi | ✅ dla wagi, obciążenia i ćwiczeń: 33 testy (`npm test`), w tym porównanie z prawdziwym eksportem Libry, gdy jest `data/libra.csv` |
| NF-04 | Dźwięki timera niezależne od obciążenia aplikacji; ekran nie gaśnie w trakcie treningu | 🟡 Blokada ekranu jest; dźwięki do zaplanowania z wyprzedzeniem (Etap 2) |
| NF-05 | Przywracanie stanu: ostatni ekran, niezapisany wpis, przerwany trening (do 3 godzin) | ⬜ |
| NF-06 | Jasny i ciemny motyw z jednego zestawu tokenów kolorów | ✅ |
| NF-07 | Wykres płynny przy kilku latach codziennych pomiarów (ok. 2000 punktów) | 🟡 Sprawdzone na 8 latach z Libry (327 dni z pomiarem); 2000 punktów do sprawdzenia |
| NF-08 | Kopia zapasowa: eksport wszystkich danych do pliku jednym przyciskiem | ✅ |
| NF-09 | Gotowość do migracji (zasada 7): jawny model danych, obliczenia bez kodu ekranu, eksport jako ścieżka przeniesienia | ✅ dla wagi |

## Decyzje do podjęcia

- [x] Stos: PWA (17.11.2026)
- [x] Dane: tylko lokalnie, przenoszenie plikiem (17.11.2026)
- [x] Format eksportu z Libry: sprawdzony na prawdziwym pliku (17.11.2026)
- [x] Metoda trendu: jak w Librze (τ = 7 dni), Hacker's Diet jako opcja (17.11.2026)
- [ ] Wartości startowe celu: przedział masy, docelowe tempo, treść podpowiedzi przy zastoju (ustawiane w aplikacji, sekcja „Cel”)
- [ ] Masa mięśniowa z Libry: importować i pokazywać czy pominąć
- [ ] Aplikacja tylko dla mnie czy także dla innych (wpływa na konto, onboarding i treść treningów)
- [ ] Treść treningów: własne protokoły (max hangs, repeatery, ARC, 4×4) czy biblioteka budowana od zera
- [ ] Wzór workload: prosty (czas pod napięciem × intensywność × ukończenie), opisany w aplikacji
- [ ] Synchronizacja komputer ↔ telefon: czy i kiedy (wymaga backendu, np. Supabase)
