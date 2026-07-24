# wutz.io

Meinungs-/Kommentarseite: aggregiert reale Tagesschlagzeilen (RSS) und lässt Claude dazu
reißerisch formulierte, aber quellentreue Kommentar-Artikel schreiben. Kein Artikel geht
automatisch live — jeder Entwurf landet als GitHub-PR, den ein Mensch freigeben muss.

## Wie das Ganze funktioniert

1. Ein GitHub-Actions-Cronjob (`.github/workflows/generate-article.yml`, alle 6h) läuft
   `scripts/generate-article.mjs`.
2. Das Skript holt Schlagzeilen aus konfigurierten RSS-Feeds (Google News, aktuell Top-News,
   Promis/Klatsch, Politik — Liste in `FEEDS` im Skript), überspringt bereits verarbeitete
   Links und wählt die erste neue Schlagzeile.
3. Claude (`claude-opus-4-8`) bekommt **nur** Titel, Kurzbeschreibung und Link dieser einen
   Meldung als Faktengrundlage — Systemprompt verbietet erfundene Zitate/Fakten explizit und
   verlangt klare Kennzeichnung von Meinung/Kommentar.
4. Ergebnis wird als Markdown-Datei unter `src/data/articles/` geschrieben, committet, gepusht
   und als Pull Request geöffnet.
5. Ein Telegram-Bot schickt dir den PR-Link.
6. Du prüfst den Entwurf auf GitHub (Diff lesen reicht meist) und **merged** — erst der Merge
   auf `main` macht den Artikel live (Vercel/Netlify/Cloudflare Pages deployen automatisch bei
   Push auf `main`).

## Setup

### 1. Secrets in GitHub hinterlegen

Repo → Settings → Secrets and variables → Actions:

| Secret | Wofür |
|---|---|
| `ANTHROPIC_API_KEY` | Claude-API-Key (platform.claude.com) |
| `TELEGRAM_BOT_TOKEN` | Bot-Token von [@BotFather](https://t.me/BotFather) (`/newbot`) |
| `TELEGRAM_CHAT_ID` | Deine Chat-ID (z.B. via [@userinfobot](https://t.me/userinfobot) rausfinden, oder dem Bot schreiben und `https://api.telegram.org/bot<TOKEN>/getUpdates` abrufen) |

`GITHUB_TOKEN` braucht ihr nicht selbst setzen — der Workflow nutzt automatisch
`${{ github.token }}`, das reicht für Branch-Push + PR-Erstellung in diesem Repo.

### 2. Hosting anschließen (Vercel/Netlify/Cloudflare Pages)

Framework-Preset erkennt Astro automatisch (Build-Command `npm run build`,
Output-Verzeichnis `dist`). Repo im gewählten Anbieter importieren, fertig — jeder Push auf
`main` deployed automatisch.

### 3. Domain

`www.wutz.io` beim jeweiligen Hosting-Anbieter als Custom Domain eintragen, DNS beim
Registrar entsprechend setzen (CNAME/A je nach Anbieter-Anleitung).

### 4. Erster Testlauf

Nach dem Secrets-Setup: Actions-Tab → "Generate article draft" → "Run workflow" (manueller
Trigger, unabhängig vom 6h-Cron). Das ist gleichzeitig der End-to-End-Test der ganzen Kette.

## Lokale Entwicklung

```sh
npm install
npm run dev        # Astro Dev-Server
npm run build       # Type-Check + Production-Build nach dist/
ANTHROPIC_API_KEY=... npm run generate-article   # Pipeline manuell einmal laufen lassen
```

## Rechtliches — vor dem ersten echten Besucher erledigen

- **Impressum** (`src/pages/impressum.astro`): aktuell nur ein Platzhalter mit TODO-Hinweis.
  Nach § 5 DDG (ex-TMG) Pflicht für praktisch jede in Deutschland betriebene Website.
- **Datenschutzerklärung**: fehlt komplett. Pflicht (Art. 13 DSGVO) sobald Analytics,
  Werbenetzwerke (z.B. AdSense) oder Cookies eingebunden werden — und genau das ist ja der
  Plan für die Monetarisierung.
- **Ad-Netzwerk-Policy**: Google AdSense & Co. haben seit 2024 explizite Regeln gegen
  "Scaled Content Abuse" (massenhaft automatisiert generierte Inhalte ohne redaktionellen
  Mehrwert). Der PR-Review-Schritt ist nicht nur Qualitätskontrolle, sondern auch Schutz vor
  Deindexierung/Sperre — nicht blind durchwinken.

## Content-Modell — die Leitplanke

Der Systemprompt in `scripts/generate-article.mjs` ist die zentrale Stelle, die verhindert,
dass hier ein Fake-News-/Rufschädigungs-Generator draus wird: nur Fakten aus der
RSS-Quelle, keine erfundenen Zitate/Handlungen über echte Personen, Meinung klar als Meinung
gekennzeichnet. Beim Anpassen des Prompts diese drei Punkte nicht aufweichen.
