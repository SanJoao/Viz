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
├── tools/gen-logo.mjs  ← regenerates the logo (node tools/gen-logo.mjs)
├── firebase.json       ← hosting config
└── worldcup2026/       ← entry 001, self-contained
```

Each entry is a self-contained folder with its own vibe.

## New entry checklist

1. Create a folder with a self-contained `index.html` — any style, any stack.
2. Paste the **entry badge** from [`snippets/entry-badge.html`](snippets/entry-badge.html) (the "← viz." button back to the notebook). Re-theme it by changing only the four `--vh-*` variables.
3. Add the favicon: `<link rel="icon" type="image/svg+xml" href="../logo.svg">`.
4. Register the entry in the `posts` array of `index.html` at the root.

## Deploy

```
firebase deploy
```

Built by hand, charted in d3. No smooth 3D renders allowed.
