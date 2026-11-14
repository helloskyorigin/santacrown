# SantaCrown 🎅👑 — Christmas Wonderland v4

A responsive, reference-inspired Christmas leaderboard with **real HTML/JS components** rather than an image pasted over the interface.

## Status (November 14, 2026)

- **Working**: navigation, animated snow, Santa & North Pole visuals, interactive Christmas entry form, USD validation, canonical public-link normalization, projected position, Christmas card download, accessible dialog, mobile layout and actual standalone legal pages.
- **No fabricated content**: empty public leaderboard and empty throne until a **verified payment** exists. The screenshot's example names/amounts have been removed from the app.
- **Not enabled**: Dodo checkout, webhooks and payment-backed rank updates. `/api/checkout` and `/api/webhook` intentionally return HTTP 503. No transaction occurs from the UI.
- **Backend read scaffold**: `/api/leaderboard` returns an empty array unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured with an approved `santacrown_leaderboard` read model. This is **read-only**; see below.
- **Business contact**: hello.skyorigin@gmail.com.

## Run locally

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The Vercel serverless routes work on Vercel, not Python's static server.

## Visual and interaction QA

```sh
python3 tests/visual_qa.py
node --check app.js
node --check lib.js
node --check api/leaderboard.js
```

The visual QA test renders the real assets in-memory and tests 320, 393, 768, 1024, 1440 and 1920 pixels, form input, modal and unsafe URLs.

## Legal pages

- `/terms.html`
- `/privacy.html`
- `/refunds.html`

They accurately describe the **current preview**, not a live commercial sale. Before enabling payments, add actual operator/legal identity, merchant/processor details, published rank tie-breaks, rewards duration, cutoff timestamp, refund procedures and update these pages as needed for applicable jurisdictions.

## Payment launch safety gate

Do not activate a public pay-to-rank competition until Dodo gives explicit written approval for the **actual** model, including custom cumulative payments, repeat contributions and Christmas Top-3 honors. Directory listings of similar sites do not establish approval.

To implement payments properly, add all of the following **server-side** before enabling any checkout:

1. Dodo merchant-approved product, API key, verified checkout amount, and checkout session creation on the server. Never ship API keys to the browser.
2. Persistent payment-intent and entry records, normalized URL identity, unique order/payment identifiers, and a serializable or atomic credit ledger.
3. Dodo HMAC signature verification on **raw webhook body**; event idempotency, amount/currency matching, and independent payment status checks.
4. Refund/chargeback reversals and rank recalculation, concurrent contribution tests, audit logging, abuse controls and no false paid profiles.
5. Privacy/terms/refund documents updated for **real** sale and published cutoff/time rules, then tested in Dodo's test mode and verified on Vercel.

`SUPABASE_SERVICE_ROLE_KEY`, once used, must remain server-side in Vercel Environment Variables. The public UI does not collect card details.

## Deployment

GitHub repo: https://github.com/helloskyorigin/santacrown

Vercel public URL supplied by project owner: https://santacrown.vercel.app/

Vercel Git integration should redeploy on `main` pushes; check the deployment status before announcing that the live site is updated.
