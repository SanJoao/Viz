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

Each entry is a self-contained folder with its own vibe. Publishing a new one = drop a folder in, add one object to the `posts` array in `index.html`.

## Deploy

```
firebase deploy
```

Built by hand, charted in d3. No smooth 3D renders allowed.
