# SantaCrown 👑🎅

A responsive, interactive Christmas 2026 leaderboard website — frontend preview.

## Features

- Snowy winter hero, Santa artwork, #1 center throne with #2/#3 beside it.
- Responsive leaderboard, name + website/social link + custom target USD amount form.
- Form validation, preview modal, snowfall, mobile navigation and legal-information modal.
- Sample entries are explicitly labeled as examples.

## Local run

Open `index.html` in a browser, or run:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Payment status

**Preview only. No real money is collected.** Dodo checkout, secure server-side payment creation, signed webhook verification, database, and real leaderboard are NOT connected.

Before enabling payment, confirm Dodo's acceptance of the exact cumulative paid-ranking model and Top-3 benefits. Build a secure server-side checkout, persist verified payments in an idempotent ledger, reverse refunds, publish complete terms, and remove sample rankings when displaying live data.

## Files

- `index.html`: UI structure
- `styles.css`: design and responsive layout
- `app.js`: demo form, sample leaderboard, animations
- `favicon.svg`: app icon
- `assets/santa.png`: Santa illustration (optimized PNG)
