# Newsy Kardio

Aplikacja na telefon (PWA) z nowymi publikacjami naukowymi z kardiologii: PubMed i kanały RSS Elsevier.

## Jak to działa

- **GitHub Actions** co 4 godziny uruchamia `lib/fetch.mjs`: pobiera nowe publikacje, dokleja je do poprzednich danych (30 dni) i publikuje stronę.
- **GitHub Pages** udostępnia aplikację pod adresem `https://<login>.github.io/<repozytorium>/`.
- Na telefonie otwierasz ten adres w Chrome, wybierasz **⋮ → Dodaj do ekranu głównego / Zainstaluj aplikację** i masz ikonę jak zwykła aplikacja. Ostatnio pobrane dane działają też bez internetu.
- Koszt: 0 zł.

## Publikacja (jednorazowo)

1. Na github.com utwórz **publiczne** repozytorium, np. `newsy-kardio` (puste, bez README).
2. Wyślij do niego ten folder (`git push`).
3. W repozytorium: **Settings → Pages → Source: GitHub Actions**.
4. **Actions → Aktualizacja publikacji → Run workflow**. Po ok. 2 minutach aplikacja jest pod adresem z kroku powyżej.

## Hasło

Dane na stronie są zaszyfrowane (AES-256-GCM, klucz z hasła przez PBKDF2). Bez hasła widać tylko ekran logowania.

- Hasło ustawia się w repozytorium: **Settings → Secrets and variables → Actions → New repository secret**, nazwa `KARDIO_PASSWORD`.
- Zmiana hasła: zmień secret i uruchom workflow ręcznie; w telefonie wpisz nowe hasło (stare przestanie działać). Historia danych zacznie się wtedy od nowa (14 dni wstecz).
- „Wyloguj” na dole listy usuwa zapamiętane hasło z telefonu.

## Co jest pobierane

- **PubMed** (`config.json` → `pubmed`):
  - wszystko z kluczowych czasopism kardiologicznych (`keyJournals`),
  - z czasopism ogólnomedycznych (NEJM, Lancet, JAMA…) tylko kardiologia,
  - z pozostałych tylko RCT, meta-analizy, przeglądy systematyczne i wytyczne z kardiologii.
- **Elsevier** (`config.json` → `elsevier`): pełne kanały RSS 8 czasopism; PubMed później uzupełnia te wpisy o abstrakty.

Średnio ok. 60 publikacji dziennie z PubMed i ok. 7 z Elseviera.

## Profil osobisty

Ranking (`lib/score.mjs`) uwzględnia profil zawodowy:

- `profil-zawodowy.md` opisuje profil słowami: dziedziny, czego nie pokazywać, preferowane źródła.
- `profile.json` zawiera wagi i słowa kluczowe, których naprawdę używa ranking. Bez tego pliku ranking działa bez profilu.

Artykuły z dziedzin z profilu dostają bonus i podpis „Twój profil: …”. Prace spoza profilu nie znikają, są tylko niżej. Sekcja „Najważniejsze” pokazuje 10 publikacji na dzień, a przy dłuższych okresach najwyżej 20.

## Test na komputerze

```
node server.mjs
```

Potem otwórz http://localhost:3017 (przycisk odświeżania od razu pobiera nowe dane).

## Pliki

- `config.json`: zapytania i lista źródeł (tu dodaje się kolejne czasopisma).
- `lib/fetch.mjs`: pobieranie, klasyfikacja typu i tematów.
- `lib/score.mjs`: ranking punktowy z profilem osobistym.
- `profile.json`, `profil-zawodowy.md`: profil osobisty.
- `public/`: aplikacja (strona, manifest, service worker, ikony).
- `.github/workflows/update.yml`: harmonogram pobierania i publikacji.
- `server.mjs`: lokalny serwer do testów.
- `sources.json`: przetestowane kanały RSS do dodania później.
- `scripts/make-icons.mjs`: generuje ikony.

„Przeczytane” i „zapisane ★” są pamiętane w telefonie (w przeglądarce).
