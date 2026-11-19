# Moduł: Jedzenie do pracy — stan projektu

Ostatnia aktualizacja: 2026-11-19

## W skrócie
Aplikacja na telefon (PWA) do planowania jedzenia **na zimno** do pracy: plan tygodnia według rytmu gotowania,
przepisy, zamrażarka, produkty w domu, lista zakupów, oceny i notatki. Działa offline, bez serwera, bez kosztów.

- **Strona:** https://jaceknowak0407.github.io/jedzenie/ (zainstalowana na ekranie głównym telefonu)
- **Repo (publiczne):** https://github.com/jaceknowak0407/jedzenie — gałąź `main`, GitHub Pages z katalogu głównego
- **Lokalnie:** `~/Projekty/asystent/jedzenie/` (to jest repo git; folder wyżej `asystent/` NIE jest w repo)
- **Profil żywieniowy użytkownika:** `../profil/jedzenie.md` (lokalnie, poza repo)
- **Ogólne zasady asystenta:** `../CLAUDE.md`, wizja i etapy: `../START.md`

## Jak ze mną pracować
- Po polsku, prosto. Użytkownik uczy się Claude Code — krótko tłumacz, co robisz i dlaczego.
- Przy większych zmianach najpierw plan do akceptacji.
- Żadnych kluczy, tokenów ani haseł w kodzie (repo jest publiczne!). Żadnych przypomnień/powiadomień.
- Dane użytkownika (oceny, produkty, notatki, paragony) NIGDY nie trafiają do repo — zostają w telefonie.

## Status: Etap 1 — zrobiony ✅
Użytkownik od 2026-11-19 testuje aplikację w praktyce. Kolejne zmiany na podstawie jego uwag i eksportu `dla-claude-*.json`.

### Zakładki
| Zakładka | Co robi |
|---|---|
| ☀️ **Start** | „Co jutro do pracy?” (dania na jutro, białko/kcal), „Co wyjąć z zamrażarki?” (+ „Wyjęte ✓”), „Dziś gotujesz” w nd/pn/śr. Przy daniu: ☐ Ugotowane + menu ⋯ |
| 📅 **Plan** | Ten i następny tydzień. Sesje: nd (z resztek → pn), pn (gotowanie na wt–śr), śr (na czw–pt). Przy daniu: ilość do ugotowania, ☐ Ugotowane, ⋯ |
| 🛒 **Zakupy** | Jedna lista na cały tydzień (pn + śr), filtr „tylko pn / tylko śr”, ten/następny tydzień (od czwartku domyślnie następny). Sekcje: kończy się, do kupienia (po działach), dopisane ręcznie, „masz — sprawdź, czy wystarczy”, pominięte. „🏠 mam”, „✔ Zakończ zakupy” → kupione trafiają do Produktów |
| 🏠 **Produkty** | Co jest w domu (dodawanie po przecinku), 📌 stały zapas, „kończy się?” → na listę zakupów. Druga część: 🧊 Zamrażarka (porcje +/−, data, ostrzeżenie > 3 mies.) |
| 📖 **Przepisy** | Wyszukiwarka, filtry, 👍/👎, notatka przy przepisie, „dodaj do zamrażarki” |
| 📝 **Notatki** | Pomysły na dania / składniki / inne + notatki z przepisów. Przycisk **📤 Eksport dla Claude Code** |
| ⚙️ Ustawienia | 1/2 osoby, post przerywany (ukrywa „na ząb”), przekąski wł./wył., eksport, kopia zapasowa (zapis/wczytanie), reset |

### Menu ⋯ przy daniu
- **Zmień danie** (całe gotowanie): 📖 wybierz z przepisów, 🎲 wylosuj, 🧊 z zamrażarki, 📄 przepis + ⇄ zamiana składników.
- **Coś innego:** ✍️ coś własnego / resztki, ⏭ pomiń — na jeden dzień albo oba dni sesji.
- Zmiana jednego dnia zmniejsza porcje do ugotowania i listę zakupów.

### Ważne zachowania
- **Losowanie planu:** pomija 👎, 👍 ma wagę 3×, omija dania z 2 poprzednich tygodni i z tego tygodnia, unika tego samego białka w śniadaniach pn/śr. Niedziela: najpierw zamrażarka, potem szybkie przepisy (≤ 25 min).
- **Porcje:** potrzeba = liczba dni × osoby. Dania do mrożenia → całe partie, nadwyżka do zamrażarki (pytanie przy „Ugotowane”). Pozostałe → przeliczone ilości.
- **Ugotowane:** pyta o nadwyżkę do zamrażarki i usuwa z Produktów zużyte świeże składniki (nie 📌 i nie spiżarnię).
- **Zamiany składników:** tylko w danym planie; ilość przeliczana przez `na_porcje` z grupy zamienników, do tego wskazówka (np. czas pieczenia kurczaka).
- **Lista zakupów:** łyżki/szklanki/garście → „1 opak.”, ząbki → „główka”. Spiżarnia trafia na listę tylko, gdy jej nie ma w Produktach albo „kończy się”.

## Pliki
| Plik | Co zawiera |
|---|---|
| `index.html` | Szkielet strony, menu dolne, okno modalne |
| `styl.css` | Wygląd (jasny/ciemny motyw, telefon) |
| `app.js` | Cała logika (stan, plan, zakupy, widoki, akcje) — czysty JS, bez bibliotek |
| `przepisy.json` | 34 przepisy (8 na ząb, 20 śniadań, 6 przekąsek) + `spizarnia` + `zamienniki` |
| `sw.js` | Service worker: offline, „najpierw sieć” |
| `manifest.json`, `ikona*` | Instalacja na ekranie głównym |

### Dane użytkownika (localStorage w telefonie, klucz `asystent-jedzenie-v1`, `wersja: 2`)
`oceny`, `zamrazarka`, `produkty`, `notatki`, `plany` (klucz = data poniedziałku; w planie: `sesje`, `dni` – zmiany na 1 dzień, `zamiany`, `ugotowane`, `wyjete`, `doZamrazarki`, `zakupy.all`, `wlasne.all`), `ustawienia`.
Zmiana struktury → dopisz migrację w `migruj()` / `upewnijPlan()`, żeby nie zgubić danych z telefonu.

## Jak wprowadzać zmiany
1. Edytuj pliki.
2. **Podbij wersję** (inaczej telefon weźmie stary kod z pamięci): `?v=N` przy `styl.css` i `app.js` w `index.html` i w `sw.js` (lista `PLIKI`) oraz `WERSJA` w `sw.js`. Teraz: **v4**.
3. Test lokalny: `python3 -m http.server 8000` w tym folderze → http://localhost:8000 (z telefonu w tym samym Wi-Fi: adres IP Maca, np. http://192.168.1.17:8000).
4. Commit z mailem noreply: `git -c user.email="355529778+jaceknowak0407@users.noreply.github.com" commit ...`, potem `git push`. Pages odświeża się w 1–2 min.

### Testowanie
- `node` z nvm (v26) **nie działa** na tym macOS (błąd libc++). Do testów logiki używamy wbudowanego silnika Safari:
  `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc atrapa.js app.js test.js`
  (atrapa = proste zaślepki `document`, `localStorage`, `fetch`, `setTimeout`; w teście `zaladujDane(JSON.parse(readFile('przepisy.json')))`).
- Podgląd w prawdziwej przeglądarce: Chrome `--headless --dump-dom` (zatrzymuj go po ~35 s, sam się nie zamyka).

### Zasady przepisów
- Wszystko dobre NA ZIMNO. Ilości w sztukach/łyżkach/opakowaniach, nigdy w gramach. Białko i kcal szacowane na porcję.
- Unikaj: tuńczyka, kokosa, salcesonu, kaszy, twardego mięsa, jajecznicy i kotletów na zimno.
- Więcej łososia i jajek, kurczak jako baza, mielone mile widziane, strączki na próbę.
- Nazwy składników spójne i małymi literami (lista zakupów, Produkty i zamienniki dopasowują po nazwie).
- Produkty trwałe zużywane po trochu → `spizarnia`. Grupy zamienników → `zamienniki` (`na_porcje` do przeliczeń).

### Aktualizacja z eksportu
Użytkownik wrzuca `dla-claude-*.json` (oceny, notatki, produkty, zamrażarka). Wtedy: popraw/usuń przepisy z 👎, dopisz podobne do 👍, zrealizuj pomysły z notatek, zaktualizuj `../profil/jedzenie.md`.

## Co dalej
**Teraz:** użytkownik testuje w praktyce → zbieramy uwagi, poprawiamy przepisy i wygodę.

**Etap 2 — Claude API** (wymaga klucza API, a repo jest publiczne → klucz NIE może być w kodzie strony; potrzebny pośrednik, np. Cloudflare Worker z kluczem w sekretach):
- czat w aplikacji: „burrito za suche”, „więcej łososia” → asystent poprawia profil i przepisy; „mam w lodówce X, Y, Z — co zrobić?”,
- 📷 zdjęcie paragonu → lista produktów do zakładki Produkty (zapisujemy tylko nazwy produktów; adres sklepu, numer karty itp. pomijamy i nie zapisujemy).

**Etap 3 — promocje:** gazetki Biedronka, Dino, Lidl, Kaufland → plan pod promocje, szacowany koszt tygodnia.

**Na później:**
- latem skrócić trwałość dań (ciepło na dworze) albo dodać torbę termiczną,
- dania do termosu (zupy, chili con carne),
- kolejne moduły asystenta (praca, biznes) — PRYWATNE: osobne prywatne repo i hosting z logowaniem, nigdy tutaj.
