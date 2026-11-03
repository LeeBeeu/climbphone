# ClimbPhone

Aplikacja PWA do treningów wspinaczkowych: timer chwytotablicy, dziennik treningów,
log przejść dróg i boulderów oraz plany treningowe. Czysty HTML/CSS/JavaScript,
bez frameworków i bez kroku budowania.

## Uruchomienie na komputerze

Wymagany Node.js (bez instalowania pakietów).

```bash
npm start
```

Otwórz http://localhost:5173 w przeglądarce.

## Struktura

```
app/                  ← cała aplikacja (to wgrywasz na hosting)
  index.html
  manifest.webmanifest  ← nazwa, ikony, tryb pełnoekranowy
  sw.js                 ← service worker (praca offline)
  css/styles.css
  js/app.js             ← nawigacja między zakładkami
  js/store.js           ← zapis danych w localStorage
  js/timer.js           ← timer chwytotablicy
  js/journal.js         ← dziennik treningów
  js/ascents.js         ← przejścia + statystyki
  js/grades.js          ← skale wycen, style, charakter drogi
  js/import8a.js        ← import przejść z 8a.nu
  js/plans.js           ← plany treningowe
  js/settings.js        ← ustawienia, eksport/import
server.js             ← lokalny serwer do podglądu
data/8a-ascents.json  ← Twoje przejścia pobrane z 8a.nu (nie trafia na hosting)
tools/8a-export.js    ← skrypt do pobrania aktualnych przejść z 8a.nu
```

## Instalacja na telefonie Samsung

Android pozwala zainstalować PWA tylko z adresu **HTTPS**, więc folder `app/`
trzeba wystawić w internecie (kod źródłowy dalej trzymasz lokalnie). Najprościej:

- **Netlify Drop**: wejdź na https://app.netlify.com/drop i przeciągnij folder `app`.
  Dostaniesz adres `https://…netlify.app`.
- **GitHub Pages**: wrzuć repozytorium na GitHub i włącz Pages dla folderu z aplikacją.

Na telefonie otwórz ten adres w Chrome albo Samsung Internet, potem
menu ⋮ → **Dodaj do ekranu głównego / Zainstaluj aplikację**.

Szybki test bez instalacji: telefon i komputer w tej samej sieci Wi-Fi, `npm start`,
a na telefonie adres „w sieci Wi-Fi” wypisany w konsoli. Uwaga: przez zwykły `http`
aplikacja działa, ale nie da się jej zainstalować ani używać offline.

## Import z 8a.nu

Dziennik przejść używa modelu danych z 8a.nu: rejon i sektor, styl OS/Flash/RP/wędka/próba (go),
liczba prób, ocena gwiazdkowa, soft/hard, FA, powtórzenie, charakter drogi.
Domyślne skale to francuska (drogi) i Font (bouldery), tak jak na 8a.nu.

Twoje przejścia (582, stan na 3.11.2026) są w pliku `data/8a-ascents.json`.
Wczytujesz je w aplikacji: **Ustawienia → Import z 8a.nu**. Ponowny import niczego nie dubluje:
przejścia już zaimportowane są aktualizowane, a nowe dopisywane.

Aktualny plik z 8a.nu pobierzesz tak:
1. Zaloguj się na www.8a.nu i otwórz swój profil (`https://www.8a.nu/user/leszek-bedrejczuk`).
2. Naciśnij F12 i otwórz zakładkę **Console**.
3. Wklej zawartość pliku `tools/8a-export.js` i naciśnij Enter. Pobierze się plik `8a-ascents-RRRR-MM-DD.json`.

8a.nu nie ma oficjalnego API ani eksportu. Skrypt korzysta z tego samego adresu, którego używa
strona profilu, więc po zmianach na 8a.nu może wymagać poprawki.

## Dane

Dane są zapisywane tylko na danym urządzeniu (localStorage przeglądarki).
Komputer i telefon mają osobne dane. Do przenoszenia i kopii zapasowej służy
**Ustawienia → Eksportuj / Importuj** (plik JSON).
