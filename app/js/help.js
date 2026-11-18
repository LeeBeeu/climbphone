// Pomoc: jak używać aplikacji – rytm dnia, tygodnia i cyklu, gdzie co jest. Treść statyczna.

const SECTIONS = [
  {
    id: 'start', icon: '🚀', title: 'Pierwsze kroki (raz)',
    body: `
      <ol class="help-steps">
        <li><strong>Zainstaluj aplikację</strong> na ekranie głównym telefonu (⚙️ Ustawienia → Instalacja). Działa wtedy offline, także na skałach bez zasięgu.</li>
        <li><strong>Uzupełnij profil</strong> w ⚙️ Ustawieniach: wzrost i domyślne skale wycen (drogi, bouldery).</li>
        <li><strong>Wczytaj historię</strong>: ważenia z Libry (Waga → ⬆️ Import CSV) i przejścia z 8a.nu (⚙️ Ustawienia → Import z 8a.nu).</li>
        <li><strong>Ustaw przypomnienie o kopii zapasowej</strong> (⚙️ Ustawienia → Kopia zapasowa). Dane są tylko w telefonie. Po wyczyszczeniu przeglądarki zostaje tylko kopia.</li>
        <li><strong>Przejrzyj 📚 Bibliotekę</strong> (Plany → Biblioteka) i zapisz kilka ćwiczeń, które chcesz robić regularnie.</li>
      </ol>`,
  },
  {
    id: 'day', icon: '☀️', title: 'Codziennie rano',
    body: `
      <p><strong>Zważ się</strong> zaraz po wstaniu, po toalecie, przed jedzeniem i piciem. Wpisz wynik na ekranie <a href="#/waga">⚖️ Waga</a>.</p>
      <p>Pojedynczy pomiar skacze o 1–2 kg (woda, sól, jedzenie). Patrz na <strong>trend</strong> – to on liczy się do obciążeń na chwytotablicy i do siły względnej.</p>
      <p class="muted">Nie musisz ważyć się codziennie. 3–4 razy w tygodniu wystarczy, by trend był wiarygodny.</p>`,
  },
  {
    id: 'before', icon: '🎒', title: 'Przed treningiem',
    body: `
      <h3>W aplikacji (2 minuty)</h3>
      <ul>
        <li><strong>Zaplanuj <a href="#/trening">najbliższy trening</a></strong> (📋 Plany → Najbliższy trening): wybierz dzień i miejsce, dodaj dzień z planu tygodnia, trening z Biblioteki albo własne pozycje. Powstaje checklista z listą rzeczy do zabrania.</li>
        <li>Na chwytotablicy: w <a href="#/timer">⏱️ Timerze</a> wybierz protokół i ustaw obciążenie. Aplikacja podpowie ciężar z poprzedniej sesji i progresję (w górę / bez zmian / w dół).</li>
        <li>Wpisz szerokość listwy (mm). Wyniki z różnych listew nie są porównywalne.</li>
        <li>Na ścianie: przygotuj tryb <a href="#/proby">🧗 Próby na ścianie</a>, żeby liczyć próby i odpoczynki.</li>
      </ul>
      <h3>Telefon</h3>
      <ul>
        <li>Naładowana bateria i <strong>włączony dźwięk</strong> (sygnały timera). Tryb cichy wycisza piknięcia.</li>
        <li>Połóż telefon tak, żeby widzieć ekran podczas zwisu. Ekran nie gaśnie w trakcie timera.</li>
        <li>Internet nie jest potrzebny.</li>
      </ul>
      <h3>Sprzęt i ciało</h3>
      <ul>
        <li>Ciężarki / pas do obciążenia albo bloczek z linką do odciążenia, magnezja, szczotka.</li>
        <li>Rozgrzewka 15–20 min: ogólna (krążenie, barki), potem łatwe wspinanie albo zwisy z odciążeniem. Biblioteka ma gotowe rozgrzewki.</li>
        <li>Nie trenuj palców przy bólu stawów lub ścięgien. Wpisz to w check-inie – plan się dostosuje.</li>
      </ul>`,
  },
  {
    id: 'during', icon: '💪', title: 'W trakcie treningu',
    body: `
      <ul>
        <li>Dotknij <strong>▶ Zaczynam trening</strong> i odhaczaj pozycje na liście. Pod ⋯ zmienisz dawkę, kolejność, pominiesz albo usuniesz pozycję; na dole dopiszesz nową. Ćwiczenia z chwytotablicy mają przycisk ⏱ – otwierają od razu właściwy protokół.</li>
        <li><strong>Timer</strong> prowadzi przez zwisy i przerwy sygnałami. Po każdej serii możesz zapisać powtórzenia i wysiłek 1–5 (5 = na granicy).</li>
        <li>Musisz przerwać? Wyjdź spokojnie. Po powrocie (do 3 h) zobaczysz <strong>▶ Wznów</strong>.</li>
        <li>Zmieniłeś coś w trakcie (mniej serii, inny ciężar)? Użyj <strong>Dopasuj</strong> w podsumowaniu, żeby zapis zgadzał się z tym, co zrobiłeś.</li>
        <li><strong>Próby na ścianie</strong>: Start próby / koniec – aplikacja liczy czas prób i odpoczynków. Na końcu ⏹ Zakończ sesję.</li>
        <li>Ćwiczenia z ciężarami i własną masą (podciąganie, core) wpisuj w <a href="#/dziennik">📓 Dzienniku</a> – podpowie serie z poprzedniego razu.</li>
      </ul>`,
  },
  {
    id: 'after', icon: '📝', title: 'Po treningu',
    body: `
      <ul>
        <li>Na liście treningu dotknij <strong>✓ Zakończ i zapisz w dzienniku</strong>: wpis wypełni się sam (data, czas od „Zaczynam”, zrobione i pominięte pozycje). Pozycje z planu tygodnia odhaczają się automatycznie.</li>
        <li><strong>Uzupełnij w dzienniku</strong>: czas trwania i RPE (jak ciężko było, 1–10). Z tego liczy się obciążenie treningowe.</li>
        <li>Dodaj krótką notatkę: samopoczucie, palce, co poszło dobrze.</li>
        <li>Przeszedłeś drogę lub boulder? Dodaj w <a href="#/przejscia">🧗 Przejściach</a> (styl: OS, flash, RP). Nieudane podejścia zapisuj ze stylem „Próba (go)” – tak powstaje lista otwartych projektów.</li>
      </ul>
      <p class="muted">Niedokończony wpis w dzienniku zostaje zapamiętany przez dobę – możesz wrócić do niego później.</p>`,
  },
  {
    id: 'plan', icon: '🗓️', title: 'Planowanie',
    body: `
      <h3>Jak ułożyć tydzień</h3>
      <ul>
        <li>W <a href="#/plany">📋 Planach</a> utwórz plan i wpisz ćwiczenia na konkretne dni albo do <strong>puli tygodnia</strong> (zrobisz, kiedy pasuje).</li>
        <li>Najszybciej: wybierz trening z <a href="#/biblioteka">📚 Biblioteki</a> i dodaj go do planu.</li>
        <li><strong>⧉ Kopiuj poprzedni tydzień</strong> – gdy kolejny tydzień ma wyglądać podobnie.</li>
      </ul>
      <h3>Rozsądny tydzień amatora</h3>
      <ul>
        <li>3–4 dni wspinania lub treningu, co najmniej 1 dzień przerwy po mocnym dniu.</li>
        <li>Chwytotablica 1–2× w tygodniu, na świeżo, na początku sesji.</li>
        <li>Najpierw siła i moc (świeży), potem wytrzymałość, na końcu ogólnorozwojowe.</li>
        <li>Nie zwiększaj obciążenia (objętości, ciężaru) o więcej niż ok. 10% tygodniowo.</li>
      </ul>
      <h3>Cykl (blok faz)</h3>
      <p>W planie ustaw <strong>Blok faz</strong>, np. 3 tygodnie budowania + 1 tydzień lżejszy (deload). Po bloku zrób testy siły i zaplanuj następny.</p>
      <h3>Gdzie trenować</h3>
      <ul>
        <li><strong>Ścianka</strong>: siła palców (chwytotablica), bouldering, obwody, technika.</li>
        <li><strong>Dom</strong>: chwytotablica, core, antagoniści (pompki, barki), rozciąganie – wszystko z Biblioteki z filtrem sprzętu.</li>
        <li><strong>Skały</strong>: projekty i on-sighty. Zapisuj próby i przejścia; trening siłowy przesuń na inne dni.</li>
      </ul>`,
  },
  {
    id: 'week', icon: '✅', title: 'Co tydzień',
    body: `
      <ul>
        <li><strong>Check-in</strong> (w Planach, najlepiej w niedzielę albo poniedziałek): samopoczucie, motywacja, zmęczenie, kontuzje. Aplikacja doradzi, czy zwiększyć, utrzymać, czy zmniejszyć obciążenie.</li>
        <li>Zajrzyj do <a href="#/analityka">📊 Analityki</a>: obciążenie treningowe, regularność i forma.</li>
        <li><strong>ACWR</strong> (stosunek ostatniego tygodnia do średniej z 4) powyżej ok. 1,3 oznacza zbyt szybki wzrost – czas zwolnić.</li>
      </ul>`,
  },
  {
    id: 'cycle', icon: '📈', title: 'Co 4–8 tygodni',
    body: `
      <ul>
        <li><strong>Testy siły</strong> (<a href="#/testy">📈 Testy</a>): maksymalny zwis, podciąganie itp. Rób je wypoczęty, zawsze tak samo (ta sama listwa, rozgrzewka, pora dnia).</li>
        <li>Na wykresach widać okresy (np. „redukcja”, „wyjazd”), żeby łatwiej łączyć wyniki z tym, co działo się w życiu. Okresy dodasz na ekranie Waga.</li>
        <li>Sprawdź <strong>Formę i projekty</strong> w Analityce: czy wyceny idą w górę i jakie drogi warto wybrać na projekt.</li>
        <li><strong>Kopia zapasowa</strong> – ⚙️ Ustawienia → ⬇️ Eksportuj. Plik przenieś np. na Dysk Google.</li>
      </ul>`,
  },
  {
    id: 'where', icon: '🧭', title: 'Gdzie co jest',
    body: `
      <table class="tbl help-map"><tbody>
        <tr><td>⚖️ Waga</td><td>ważenie, trend, siła względna, statystyki, okresy</td></tr>
        <tr><td>⏱️ Timer</td><td>chwytotablica: protokoły, obciążenie, serie; obok Próby na ścianie</td></tr>
        <tr><td>📓 Dziennik</td><td>wszystkie treningi, ćwiczenia z seriami, kalendarz</td></tr>
        <tr><td>📈 Testy</td><td>testy siły i ich wykresy</td></tr>
        <tr><td>🧗 Przejścia</td><td>logbook dróg i boulderów, próby, projekty</td></tr>
        <tr><td>📋 Plany</td><td>najbliższy trening (checklista), plan tygodnia, pula, fazy, check-in; stąd Biblioteka i Analityka</td></tr>
        <tr><td>⚙️ Ustawienia</td><td>profil, skale wycen, import 8a.nu, kopia zapasowa, wersja</td></tr>
      </tbody></table>`,
  },
  {
    id: 'faq', icon: '❓', title: 'Problemy i pytania',
    body: `
      <dl class="help-faq">
        <dt>Nie słychać sygnałów timera</dt>
        <dd>Wyłącz tryb cichy i podgłośnij multimedia. Dźwięk włącza się po dotknięciu ▶ Start – nie uruchamiaj timera z zablokowanego ekranu.</dd>
        <dt>Na telefonie jest stara wersja</dt>
        <dd>Zamknij i otwórz aplikację. Gdy pojawi się pasek „Jest nowa wersja”, dotknij Odśwież. Numer wersji jest w ⚙️ Ustawieniach.</dd>
        <dt>Zmieniłem telefon / wyczyściłem dane</dt>
        <dd>Zainstaluj aplikację ponownie i zaimportuj ostatnią kopię zapasową (⚙️ Ustawienia → Kopia zapasowa).</dd>
        <dt>Obciążenie w % masy ciała wygląda dziwnie</dt>
        <dd>Liczy się z trendu wagi. Bez ważeń z ostatnich tygodni trend jest nieaktualny – zważ się kilka razy.</dd>
        <dt>Czy dane trafiają do internetu?</dt>
        <dd>Nie. Wszystko zostaje w telefonie, dopóki sam nie wyeksportujesz kopii.</dd>
      </dl>`,
  },
];

export function renderHelp(view) {
  view.innerHTML = `
    <section class="card">
      <h2>Jak korzystać z ClimbPhone</h2>
      <p class="muted">Krótki przewodnik: co zrobić raz, co przed i po treningu, jak planować tydzień. Dotknij sekcji, by ją rozwinąć.</p>
    </section>
    ${SECTIONS.map((s, i) => `
    <details class="card help-sec" id="help-${s.id}" ${i === 0 ? 'open' : ''}>
      <summary><span class="help-ico">${s.icon}</span>${s.title}</summary>
      <div class="help-body">${s.body}</div>
    </details>`).join('')}
  `;
}
