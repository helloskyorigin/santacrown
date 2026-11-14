# SantaCrown 🎅👑 — Christmas World v3

SantaCrown is an immersive, responsive Christmas-themed leaderboard **frontend preview**.

## What's implemented

- North Pole snowy village SVG scene, large Santa and winter aurora hero, animated snow and festive lights.
- Responsive premium Top-3 podium with #1 golden throne and crown, #2 silver, #3 bronze.
- Name + public URL + target total preview with instant **fictional** rank estimation.
- Target shortcuts to beat #3 or #1 in the example data, including leaderboard challenge buttons.
- Realistic decimal validation, URL normalization, reduced-motion preferences, keyboard-friendly modal, focus recovery.
- Transparent preview state: no fake real participants, no billing, no fake verified ranks.

## Run

Static website: run `python3 -m http.server 8080` from project root, then open http://localhost:8080.

Run validation tests:

```bash
node --test tests/logic.test.cjs
python tests/ui_smoke_v3.py
```

## Important: payments are OFF

No live Dodo integration, checkout, database, purchase webhook or live leaderboard is connected. Before payments may go live, obtain written confirmation that the exact pay-to-rank model is permitted, create secure server-side checkout sessions, verify the payment webhook, maintain idempotent transactions and refunds, guard name/link ownership, provide accurate terms/policies and replace sample data with verified totals.

## Stack

Static HTML + CSS + vanilla JavaScript + inline SVG assets. No frontend build step. Works on Vercel from GitHub.
