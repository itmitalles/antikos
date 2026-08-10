# wutz.io

**Archived 2026-08-11.** The article-generation pipeline was stopped intentionally; this
repo is kept read-only for reference. See
[`wutz-io/notes/docs/wutz.io.md`](https://github.com/wutz-io/notes/blob/main/docs/wutz.io.md)
for what it was and why it was retired.

---

Opinion and commentary site: it aggregates real daily news headlines (RSS) and has Claude
write sensationally worded but source-faithful commentary articles. No article goes live
automatically — every draft becomes a GitHub PR that must be approved by a human.

## Repository scope

This repository contains the website, game code, and their directly required assets and
developer instructions. Durable project documentation lives in the central Obsidian vault
at [`wutz-io/notes/docs`](https://github.com/wutz-io/notes/tree/main/docs), including the
[Antikos art-prompt catalogue](https://github.com/wutz-io/notes/tree/main/docs/games).
Actionable follow-up work belongs in [`wutz-io/ai-todo`](https://github.com/wutz-io/ai-todo)
Issues.

## How It Works

1. A GitHub Actions cron job (`.github/workflows/generate-article.yml`, every six hours) runs
   `scripts/generate-article.mjs`.
2. The script fetches headlines from configured RSS feeds (Google News, current top news,
   celebrity news, and politics — see the `FEEDS` list), skips links that have already been
   processed, and selects the first new headline.
3. Claude (`claude-opus-4-8`) receives **only** the title, short description, and link of that
   report as its factual basis. The system prompt explicitly prohibits invented quotes or facts
   and requires opinion/commentary to be clearly labeled.
4. The result is written as a Markdown file under `src/data/articles/`, committed, pushed, and
   opened as a pull request.
5. A Telegram bot sends you the PR link.
6. You review the draft on GitHub (usually, reading the diff is enough) and **merge** it — only
   a merge to `main` makes the article live (Vercel, Netlify, or Cloudflare Pages deploys
   automatically on pushes to `main`).

## Setup

### 1. Add GitHub secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key (platform.claude.com) |
| `TELEGRAM_BOT_TOKEN` | Bot token from [@BotFather](https://t.me/BotFather) (`/newbot`) |
| `TELEGRAM_CHAT_ID` | Your chat ID (for example, find it through [@userinfobot](https://t.me/userinfobot), send a message to the bot, or retrieve it from `https://api.telegram.org/bot<TOKEN>/getUpdates`) |

You do not need to set `GITHUB_TOKEN` yourself — the workflow uses `${{ github.token }}`
automatically, which is sufficient for pushing a branch and opening a PR in this repository.

### 2. Connect hosting (Vercel/Netlify/Cloudflare Pages)

The framework preset detects Astro automatically (build command `npm run build`, output
directory `dist`). Import the repository into your chosen provider; every push to `main` will
then deploy automatically.

### 3. Domain

Add `www.wutz.io` as a custom domain with the hosting provider and configure the corresponding
DNS records with the registrar (CNAME/A, according to the provider's instructions).

### 4. First test run

After configuring the secrets: open the Actions tab → "Generate article draft" → "Run workflow"
(manual trigger, independent of the six-hour cron). This is also the end-to-end test for the
entire pipeline.

## Local Development

```sh
npm install
npm run dev        # Astro development server
npm run build      # Type-check + production build into dist/
ANTHROPIC_API_KEY=... npm run generate-article   # Run the pipeline once manually
```

## Legal — Complete Before the First Real Visitor

- **Legal notice** (`src/pages/impressum.astro`): currently a placeholder with a TODO. Section
  5 DDG (formerly TMG) requires this for practically every website operated in Germany.
- **Privacy policy**: completely missing. Required under Article 13 GDPR once analytics, ad
  networks (such as AdSense), or cookies are used — and that is the monetization plan.
- **Ad network policy**: since 2024, Google AdSense and similar services have explicit rules
  against "Scaled Content Abuse" (large amounts of automatically generated content without
  editorial value). The PR review step is not just quality control; it also helps protect
  against de-indexing or suspension — do not approve drafts blindly.

## Content Model — The Guardrails

The system prompt in `scripts/generate-article.mjs` is the central safeguard against turning
this into a fake-news or defamation generator: use only facts from the RSS source, do not
invent quotes or actions involving real people, and clearly label opinions as opinions. Do not
weaken these three principles when adjusting the prompt.
