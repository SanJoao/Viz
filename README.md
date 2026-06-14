# viz ❄️❄️❄️

A data field notebook by [Juan](https://www.reddit.com/user/ArchiTechOfTheFuture) — charts of whatever I'm currently questioning. Sometimes it's [Luarai](https://luarai.com) experiments, sometimes just rabbit holes I fell into.

## Entries

| # | Entry | Status |
|---|-------|--------|
| 001 | [Born There, Playing Here](worldcup2026/index.html) — every foreign-born player at the 2026 World Cup, traced on a circular sankey | LIVE |
| 002 | 365 Days of Streaks — app streaks drawn as flowers | soon… |
| 003 | Who Actually Uses This? — user demographics | soon… |

## Structure

```
viz/
├── index.html          ← the notebook (gallery)
├── logo.svg            ← 7-petal streak rose (one week of streaks)
├── analytics.js        ← Firebase Analytics (reserved URLs, zero config)
├── share.jpg           ← link-preview image (og:image), 1200×630
├── tools/share-cards/  ← share-card templates + make.ps1 (regenerates all share.jpg)
├── tools/gen-logo.mjs  ← regenerates the logo (node tools/gen-logo.mjs)
├── firebase.json       ← hosting config
└── worldcup2026/       ← entry 001, self-contained
```

Each entry is a self-contained folder with its own vibe.

## New entry checklist

1. Create a folder with a self-contained `index.html` — any style, any stack.
2. Paste the **entry badge** from [`snippets/entry-badge.html`](snippets/entry-badge.html) (the "← viz." button back to the notebook). Re-theme it by changing only the four `--vh-*` variables.
3. Add the favicon: `<link rel="icon" type="image/svg+xml" href="../logo.svg">`.
4. Add analytics: `<script src="../analytics.js"></script>` (automatic page views; log custom events with `vizTrack("name", {...})` — safe to call anywhere, no-ops outside Firebase Hosting).
5. Register the entry in the `posts` array of `index.html` at the root.
6. Link preview: copy the `og:*` meta block from `worldcup2026/index.html` (change title, description, URLs), then make a 1200×630 `share.jpg` for the folder — duplicate a template in `tools/share-cards/`, point it at the new entry, add a line to `make.ps1`, run it. Keep it under ~300 KB or WhatsApp won't show it.
7. Coffee CTA: paste the note from [`snippets/coffee-cta.html`](snippets/coffee-cta.html) at the end of the entry (auto-themes via `--accent`/`--muted`). If the entry has an `@media print` block, add `.coffee-cta` to its hide list.

## Deploy

```
firebase deploy
```

Built by hand, charted in d3. No smooth 3D renders allowed.
