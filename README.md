# Rachunki – wspólne płatności domowe

Aplikacja na telefon (PWA) i stronę w przeglądarce do wspólnego planowania i odhaczania
stałych płatności: woda, prąd, czynsz, przedszkole, ubezpieczenia.

- Płatność dodajesz raz (kwota, dzień, co ile miesięcy), a pojawia się w każdym miesiącu, w którym trzeba ją zapłacić.
- Lista miesiąca jest pogrupowana: **Po terminie**, **Termin w ciągu 3 dni**, **Do zapłaty**, **Zapłacone**.
- Niezapłacone płatności z poprzednich miesięcy są w czerwonej ramce na górze, dopóki ktoś ich nie odhaczy.
- Kliknięcie kółka oznacza płatność jako zapłaconą. Widać, kto zapłacił i kiedy. Można cofnąć.
- Wszyscy domownicy widzą te same dane na żywo. Lista działa też bez internetu, a zmiany wysyłają się po odzyskaniu sieci.

## Publikacja

Projekt jest samodzielny i nie zależy od ClimbPhone. Najprościej trzymać go w osobnym repozytorium:

1. Na GitHubie utwórz puste repozytorium, np. `rachunki`.
2. Wgraj do niego zawartość tej gałęzi jako `main`.
3. **Settings → Pages → Source: GitHub Actions**. Workflow `.github/workflows/pages.yml` publikuje folder `app/`.

Adres będzie wtedy taki: **https://leebeeu.github.io/rachunki/**

## Tryby działania

| Tryb | Kiedy | Dane |
|------|-------|------|
| lokalny | `app/js/firebase-config.js` zawiera `null` (tak jest teraz) | tylko w tej przeglądarce, do wypróbowania |
| wspólny | uzupełniony `app/js/firebase-config.js` | w Firebase, logowanie kontem Google, wspólne dla rodziny |

## Podłączenie Firebase (jednorazowo, ok. 10 minut)

Firebase to usługa Google z bazą danych i logowaniem. Plan darmowy (Spark) w zupełności
wystarcza dla rodziny i nie wymaga podawania karty.

1. Wejdź na https://console.firebase.google.com i kliknij **Utwórz projekt**, np. `nasze-rachunki`.
   Google Analytics możesz wyłączyć.
2. **Logowanie**: menu **Build → Authentication → Get started → Sign-in method → Google** → włącz,
   wybierz swój e-mail pomocy i zapisz.
3. **Dozwolona domena**: **Authentication → Settings → Authorized domains → Add domain** i wpisz
   `leebeeu.github.io`. (`localhost` jest już na liście, więc działa też podgląd na komputerze.)
4. **Baza danych**: **Build → Firestore Database → Create database**. Lokalizacja `europe-central2`
   (Warszawa) albo `eur3`, tryb **production**.
5. **Reguły dostępu**: w Firestore otwórz zakładkę **Rules**, zastąp całą treść zawartością pliku
   [`firestore.rules`](firestore.rules) i kliknij **Publish**. Bez tego nikt nie będzie miał dostępu.
6. **Klucze aplikacji**: ikona koła zębatego → **Project settings → Your apps → ikona `</>` (Web)**,
   nadaj nazwę, np. `rachunki` (Firebase Hosting nie jest potrzebny). Skopiuj obiekt `firebaseConfig`
   i wklej go do [`app/js/firebase-config.js`](app/js/firebase-config.js) w miejsce `null`:

   ```js
   export const firebaseConfig = {
     apiKey: 'AIza...',
     authDomain: 'nasze-rachunki.firebaseapp.com',
     projectId: 'nasze-rachunki',
     storageBucket: '...',
     messagingSenderId: '...',
     appId: '1:...:web:...',
   };
   ```

   Te wartości nie są tajne i mogą być w repozytorium. Dane chronią reguły z kroku 5.
7. Podbij `VERSION` w `app/sw.js` i wypchnij zmiany na gałąź `main`. GitHub Pages opublikuje aplikację.

## Pierwsze uruchomienie

1. Otwórz adres aplikacji (np. https://leebeeu.github.io/rachunki/) i zaloguj się kontem Google.
2. Kliknij **Utwórz wspólną listę** (np. „Nasz dom”).
3. **☰ → Rodzina**: dopisz adres Gmail żony i innych domowników.
4. Oni otwierają ten sam adres i logują się swoim kontem Google. Od razu widzą wspólną listę.

## Instalacja na telefonie

**Android (Chrome / Samsung Internet)**: otwórz adres aplikacji → menu ⋮ → **Zainstaluj aplikację**
(albo **Dodaj do ekranu głównego**). Ikona „Rachunki” pojawi się obok innych aplikacji.

**iPhone (Safari)**: przycisk Udostępnij → **Do ekranu początkowego**.

Na komputerze ten sam adres działa jak zwykła strona. W Chrome można ją też zainstalować
(ikona instalacji w pasku adresu).

## Podgląd na komputerze

```bash
npm start    # http://localhost:5174 (bez instalowania pakietów)
npm test     # testy obliczeń (tests/calc.test.mjs)
```

## Pliki

```
firestore.rules          ← reguły dostępu do wklejenia w konsoli Firebase
server.cjs               ← lokalny serwer do podglądu
tests/calc.test.mjs      ← testy obliczeń
app/                     ← cała aplikacja (to publikujesz)
  index.html, css/styles.css
  manifest.webmanifest   ← nazwa, ikony, tryb pełnoekranowy
  sw.js                  ← praca offline (podbij VERSION przy każdej publikacji)
  js/app.js              ← ekrany i obsługa zdarzeń
  js/calc.js             ← terminy, powtarzanie, statusy, podsumowanie, walidacja
  js/store.js            ← zapis: Firebase (wspólny) albo localStorage (lokalny)
  js/firebase-config.js  ← klucze projektu Firebase
```

## Czego jeszcze nie ma

- **Powiadomień push** (np. „jutro termin za wodę”). Wymagają Firebase Cloud Functions,
  a te działają tylko w płatnym planie Blaze (przy tej skali praktycznie 0 zł, ale trzeba podpiąć kartę).
  Na razie aplikacja pokazuje zaległości i bliskie terminy po otwarciu.

## Uwaga przy kilku aplikacjach na tej samej domenie

Wszystkie strony `leebeeu.github.io/...` mają wspólną pamięć podręczną (Cache Storage).
Service worker tej aplikacji usuwa tylko własne pamięci (`rachunki-*`). Jeśli inna aplikacja na tej samej
domenie przy aktualizacji kasuje wszystkie pamięci, Rachunki stracą pliki offline do następnego
uruchomienia z internetem. Dane i działanie online nie są zagrożone.
