// Eksport przejść z 8a.nu do pliku JSON dla ClimbPhone.
// Użycie: zaloguj się na www.8a.nu, otwórz SWÓJ profil (np. https://www.8a.nu/user/twoj-login),
// naciśnij F12 → zakładka Console, wklej cały ten plik i naciśnij Enter.
// Przeglądarka pobierze plik 8a-ascents-RRRR-MM-DD.json → wczytaj go w ClimbPhone: Ustawienia → Import z 8a.nu.
(async () => {
  const slug = location.pathname.match(/^\/user\/([^/]+)/)?.[1];
  if (!slug) return alert('Otwórz najpierw swój profil na 8a.nu (adres /user/twoj-login).');

  const base = `/api/unification/ascent/v1/web/users/${slug}/ascents`;
  const ascents = [];
  for (const category of ['sportclimbing', 'bouldering']) {
    for (let page = 0; page < 100; page++) {
      const url = `${base}?category=${category}&pageIndex=${page}&pageSize=100&sortField=date_desc`
        + '&timeFilter=0&gradeFilter=0&typeFilter&includeProjects=true&searchQuery&showRepeats=true&showDuplicates=true';
      const res = await fetch(url);
      if (res.status === 401) return alert('Nie jesteś zalogowany na 8a.nu.');
      const { ascents: batch = [] } = await res.json();
      ascents.push(...batch);
      if (batch.length < 100) break;
    }
  }

  const blob = new Blob([JSON.stringify({ source: '8a.nu', user: slug, exportedAt: new Date().toISOString(), ascents })],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `8a-ascents-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  console.log(`ClimbPhone: wyeksportowano ${ascents.length} przejść`);
})();
