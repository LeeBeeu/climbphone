# Synchronizacja przez Firebase

ClimbPhone trzyma dane w telefonie i działa bez internetu. Synchronizacja jest dodatkiem: po zalogowaniu
kontem Google każda zmiana wysyła się w tle do prywatnej bazy w Firebase, a inne urządzenia (komputer,
nowy telefon) pobierają ją same. Bez konfiguracji (`app/js/firebase-config.js` = `null`) aplikacja działa
jak wcześniej, tylko lokalnie.

## Założenie projektu (jednorazowo, ok. 10 minut)

Osobny projekt, niezależny od Rachunków. Plan darmowy (Spark) wystarcza i nie wymaga karty.

1. https://console.firebase.google.com → **Utwórz projekt** (np. `climbphone`). Google Analytics możesz wyłączyć.
2. **Logowanie**: **Build → Authentication → Get started → Sign-in method → Google** → włącz,
   wybierz swój e-mail pomocy → **Save**.
3. **Dozwolona domena**: **Authentication → Settings → Authorized domains → Add domain** →
   `leebeeu.github.io`. (`localhost` jest już na liście – działa podgląd na komputerze.)
4. **Baza**: **Build → Firestore Database → Create database** → lokalizacja `eur3 (europe)` albo
   `europe-central2 (Warszawa)` → tryb **production**.
5. **Reguły**: w Firestore zakładka **Rules** → zastąp całą treść zawartością pliku
   [`firestore.rules`](../firestore.rules) → **Publish**. Każdy widzi tylko własne dane.
6. **Klucze**: koło zębate → **Project settings → General → Your apps → ikona `</>` (Web)** →
   nazwa np. `climbphone` (Firebase Hosting niepotrzebny) → skopiuj obiekt `firebaseConfig`.
   Wklej go do [`app/js/firebase-config.js`](../app/js/firebase-config.js) w miejsce `null`.
   Te wartości nie są tajne i mogą być w publicznym repozytorium – dane chronią reguły z kroku 5.
7. Podbij `VERSION` w `app/sw.js` i opublikuj.

## Pierwsze włączenie

1. **Najpierw telefon** (tam są prawdziwe dane): ⚙️ Ustawienia → **Synchronizacja → Zaloguj kontem Google**.
   Chmura jest pusta, więc wszystkie dane się wysyłają (ok. 1–2 tys. wpisów, kilka sekund).
2. **Potem komputer / inne urządzenie**: to samo logowanie. Jeśli to urządzenie ma własne dane,
   aplikacja zapyta:
   - **Połącz** – wpisy z obu urządzeń zostają; przy tym samym wpisie wygrywa wersja z chmury,
   - **Zastąp danymi z chmury** – dane tego urządzenia znikają (np. były tylko testy).

## Jak to działa

- Dane: `users/{uid}/records/{kolekcja~id}` – jeden dokument na wpis (trening, przejście, ważenie, plan…),
  odhaczenia planu w danym tygodniu i pojedyncze obiekty (ustawienia, najbliższy trening). Treść jako JSON.
- Lokalnie (`localStorage` → `climbphone.sync`): skróty rekordów i kolejka niewysłanych zmian. Zmiany są
  wykrywane po każdym zapisie, także bez internetu; wysyłają się po połączeniu.
- Konflikt (ten sam wpis zmieniony na dwóch urządzeniach): wygrywa nowsza zmiana. Usunięcie też się synchronizuje.
- „Usuń wszystkie dane” przy włączonej synchronizacji usuwa je także z chmury i z innych urządzeń.
- Wylogowanie zatrzymuje synchronizację; dane na urządzeniu zostają.
- Limity planu Spark: 50 tys. odczytów i 20 tys. zapisów dziennie – przy jednej osobie zużycie to ułamek procenta.

Kod: `app/js/sync.js` (Firebase, logowanie, wysyłanie i pobieranie), `app/js/sync-calc.js` (rekordy, wykrywanie
zmian, łączenie; testy `tests/sync-calc.test.mjs`).
