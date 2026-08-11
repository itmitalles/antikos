# Antikos

Full-screen "WUTZ!" animation (DVD-screensaver-style bouncing logo, posterized plasma
background, confetti on click/tap) plus the [Antikos](src/pages/antikos-strategy) hex
strategy game. Astro site, deployed via GitHub Pages on every push to `main`
(`.github/workflows/pages.yml`), custom domain `www.wutz.io`.

## Local development

```sh
npm install
npm run dev        # Astro dev server
npm run build      # type-check + production build into dist/
```

## Antikos vertical slice

Antikos is being developed as a large, Civilization-oriented hex-world rather
than a small Catan-like board. The current slice includes generated terrain,
visible resource nodes, connected river edges, capitals with multiple city
building slots, player-founded settlements, road path previews and roads with
bridge visuals. The map is intentionally larger than the original demo and the
board can be zoomed and panned in the browser.

The following are deliberately provisional and must not be treated as final
rules: resource frequencies and terrain compatibility, resource yields,
building costs and bonuses, population effects, combat, trade and supply
rules. There is deliberately no fixed dice phase or Catan-style number-token
economy; the vertical slice is focused on world structure, visibility and
interaction.

## Legal — complete before real traffic

- **Impressum** (`src/pages/impressum.astro`): still a placeholder, § 5 DDG requires this.
- **Datenschutzerklärung**: missing, required under Art. 13 GDPR once analytics/ads are used.
