# SantaCrown 🎅👑 — Launch-hardening frontend and payment-ledger engine (v6)

A no-login, Christmas-themed public leaderboard, powered by verified USD contributions to public links. **Current deployment is NOT taking payments.** The payment-backed API and Supabase migration are implemented but not connected to a live merchant/database account. This is a deliberate safety feature.

**Core ranking rule**: one normalized public link = one listing. First *verified* purchase determines its display name. All subsequent verified purchases for that link increase its balance. Board sorts by **net verified USD cents, descending**. Tie order is **earliest confirmed listing creation**, then canonical URL (stable). **Refunds reduce credit proportionately** and **open/lost disputes temporarily/permanently exclude disputed payments**. A won dispute can restore that payment's credit. Pending/failed/duplicate webhooks do not create rank.

## What is implemented

- Snowy responsive UI with a real-data-only podium, leaderboard, and Name + Link + Target Total form.
- `GET /api/leaderboard` — public read-only ranked list (Top 100) from actual verified ledger, no fabricated entries.
- `GET /api/listing?link=...` — the existing total for any public URL, including outside Top 100.
- `POST /api/checkout` — fail-closed until enabled; validates input and origin, computes the exact **payable difference server-side**, persists a pending intent, then creates a one-time Dodo checkout session using a *Pay What You Want* product and server-owned `product_cart[].amount` (in cents).
- `POST /api/webhook` — raw signed HMAC verification with a five-minute timestamp window, provider payment detail verification, and single-transaction Postgres RPC for payment success, refunds and disputes.
- `GET /api/status?intent=...` + `thanks.html` — shows **webhook-confirmed** payment status, not untrusted redirect query parameters.
- `db/001_santacrown.sql` — tables, unique constraints, append-only ledgers, read model, transaction RPCs, RLS and grants. `db/002_visibility.sql` — public-link moderation, public listing view, checkout blocking for hidden entries and consent timestamp.
- Safe URL normalization, cent-based math, server-side rate limiting and guarded launch flags.
- Existing Terms, Privacy and Refund pages with business contact **hello.skyorigin@gmail.com**.

## Why payment accounting is safe by design

**Never** use an in-memory map or `total = oldTotal + amount` in JavaScript. Money lives as an immutable row (`sc_payments.payment_id` unique, `sc_payments.intent_id` unique), and the leaderboard reads net balances from SQL. Refund IDs and webhook event IDs are unique. All mutations use Postgres transactions; duplicates cannot credit twice. SQL reads are consistent for simultaneous payments.

When the same URL starts two checkouts at the same time, both successful payments increase the cumulative total. The final rank is based on the actual amounts paid, not a stale target or redirect. A checkout quotes the difference between the user's target and the **then-current confirmed total**; if another purchase changes it while the browser is open, the user must accept the refreshed quote.

**Tax**: rank credit uses the verified product amount in USD cents, excluding extra processor taxes. If the customer is charged tax, Dodo's `total_amount` is greater than or equal to the contribution amount. Refunds proportionally reverse credited product value. The payment record must be `succeeded`, with USD charge currency; adaptive-currency conversions to other billing currencies will fail closed and need proper FX reconciliation before enabling them.

## Setup (merchant/admin action required)

1. Create a *new dedicated Supabase project*. Run **all three migrations in order**: `db/001_santacrown.sql`, `db/002_visibility.sql`, then `db/003_reconciliation.sql` using **Supabase Dashboard → SQL Editor**. Verify that `public.santacrown_leaderboard` starts empty. Review/enable Supabase's REST Data API for the exposed `public` schema; **only `service_role` is granted access**. No direct anonymous ledger access is permitted.
2. In Vercel project's **Settings → Environment Variables**, add `SUPABASE_URL` and **`SUPABASE_SECRET_KEY`** (or legacy `SUPABASE_SERVICE_ROLE_KEY`), server-only. Never use a public/anon key for server ledger writes. Set `SANTACROWN_RATE_SALT` to a long random value (server-only).
3. Obtain Dodo's written confirmation that SantaCrown's **exact** paid rank + cumulative contributions + Top-3 Christmas honors business model is eligible. Comparable sites do not prove merchant eligibility. Create a Dodo *one-time Pay What You Want* product in USD with a $1 minimum and no coupons; obtain its `pdt_...` product ID.
4. Set Dodo server-side test mode keys and `DODO_PAYMENTS_ENVIRONMENT=test_mode`. Configure webhook endpoint **`https://santacrown.vercel.app/api/webhook`** in **Dodo Developer → Webhooks** and subscribe to `payment.succeeded`, `refund.succeeded`, `dispute.opened`, `dispute.won`, and `dispute.lost`. Copy the endpoint's *own* signing key into the Vercel secret `DODO_PAYMENTS_WEBHOOK_KEY`. Test and live mode webhook secrets are different.
5. Check real Dodo **test-mode** payload shapes/amounts and signed webhook replay using the merchant dashboard. Confirm: amount matches price, currency USD, `metadata.sc_intent_id` survives checkout into Payment Detail, refunds contain `refund_id`, `payment_id`, `amount`, and disputes contain `dispute_id`, `payment_id`. Reconcile anything different *before launch*. The signed webhook must use raw bytes, not `JSON.stringify(req.body)`.
6. **Keep `SANTACROWN_CHECKOUT_ENABLED=false` initially**. Once test-mode Dodo and DB checks pass, change `DODO_PAYMENTS_APPROVED=true` and `SANTACROWN_CHECKOUT_ENABLED=true` **only on a safe test/preview environment**. When using a preview hostname, update `SANTACROWN_SITE_ORIGIN` to that exact HTTPS origin. The checkout route will start producing *test* checkout URLs. No live card will be charged.
7. Before real launch, finish public commercial terms: legal merchant identity, eligibility, exact cutoff date/time + time zone, tie-breaks, durations of Top 3 rewards, refunds, chargebacks, appeal process, and rights to profile names/links. Merchant must specifically approve the live usage. Set `DODO_PAYMENTS_ENVIRONMENT=live_mode`, upload live Dodo keys, supply `SANTACROWN_MERCHANT_LEGAL_NAME`, `SANTACROWN_EVENT_CUTOFF_AT` (exact published future timestamp), `SANTACROWN_COMMERCIAL_TERMS_READY=true` **only after updating all legal pages**, and finally `SANTACROWN_LIVE_CONFIRMED=true`. New live checkouts automatically stop after the configured cutoff. The API does nothing until these explicit flags and keys exist.

Do **not** paste secret keys into ChatGPT or GitHub. Configure them directly in Vercel.

### Environment flags

See `.env.example`. `SANTACROWN_CHECKOUT_ENABLED` + `DODO_PAYMENTS_APPROVED` + configured DB/Dodo keys must all be true. `SANTACROWN_LIVE_CONFIRMED=true` is an extra second switch for real charges. If absent, checkout returns 503.

### Run checks

```sh
npm test
npm run audit
python3 tests/frontend_backend_smoke.py
python3 tests/e2e_routes.py
```

`tests/frontend_backend_smoke.py` and `tests/e2e_routes.py` run isolated browser flows with inline assets and stubbed API responses; they do not connect to Dodo or Supabase. `npm run audit` checks site routes, legal pages, launch gates and source security. `npm run verify:site` performs read-only HTTPS smoke requests (requires outbound internet). A real Supabase SQL transaction integration test and Dodo sandbox payment test still require your project credentials and merchant test-mode environment; test results do not imply those have run.

## Remaining launch checks

- Database migration **has not been executed on an actual Supabase project** in this session.
- Dodo merchant/API configuration, signed test webhook delivery and checkout **have not been exercised against a real provider**.
- A public paid-launch should not take place until business approval and the full legal terms are complete.
- Verify Vercel project deployment and `https://santacrown.vercel.app/api/leaderboard` after GitHub auto-deploy; repository push alone is not proof that the live deployment updated.

Documentation: [Dodo Checkout Sessions](https://docs.dodopayments.com/api-reference/checkout-sessions/create), [Dodo Webhooks](https://docs.dodopayments.com/developer-resources/webhooks), [Supabase Security](https://supabase.com/docs/guides/api/securing-your-api).

## v6 launch-hardening additions

- Automatic 25-second refresh while the page is visible, manual Refresh, immediate refresh on reconnect/tab return, timeout/backoff, and a clearly labelled stale snapshot if the backend fails. No imaginary entries or guaranteed positions.
- On working data, **Beat #3** and **Take #1** buttons prefill a projected target based on current verified totals. Final price is still recomputed on the server.
- On mobile, the public link is displayed alongside the name and amount (not hidden).
- Before an enabled payment checkout, a user must affirm the Terms and Refund Policy. The API also checks `terms_accepted` and the SQL migration records the checkout-intent timestamp.
- Public health endpoint `/api/health`, 404 page, robots/sitemap, richer Terms/Privacy/Refund pages, hidden-listing moderation and incident runbook.
- Live checkout has additional **commercial-terms + merchant-identity + future event-cutoff** gates. These are intentionally disabled by default and must be validated by the operator.
- `.github/workflows/verify.yml` runs the JS test suite + release audit for commits/PRs without external secrets.
- New unit regressions include safe launch gates, terms refusal, missing migration, and secret-free health response.

**Important:** All unit/browser tests simulate provider events. No live Dodo transaction, SQL migration execution or real merchant approval has been verified from this repository. The operator must complete the checklist in `docs/OPERATOR_RUNBOOK.md` before collecting real money.

## v7 deep audit corrections (payment reconciliation)

- **Critical fix:** checkout disabled/cutoff no longer disables signed payment/refund/dispute webhooks. `webhookConfigured()` is independent of `canCharge()`. Leave webhook secrets configured whenever past payments may be adjusted.
- **New migration is mandatory:** `db/003_reconciliation.sql` adds a schema-version gate, a parameterized public listing lookup and a per-payment status that shows `reversed` after a full refund or chargeback. The checkout API stays closed until version 3 is installed.
- **Dispute coverage:** opened/challenged are held, lost/accepted/expired remove credit, won/cancelled restore only non-refunded credit. Provider event types were cross-checked with Dodo's event catalog; real signed sandbox payloads still require merchant testing.
- **Raw body:** the webhook declares body-parser opt-out; body streams/signatures must be validated on the actual Vercel runtime and provider before enabling live collection. Parsed JSON is never reserialized to forge an apparently valid signature.
- **Exact listing query:** `sc_public_listing` RPC replaces an ad-hoc URL-filter query; it respects the hidden/moderated listing view.
- **UX:** unknown tie rank is conservatively estimated; stale/offline amounts no longer display a seemingly authoritative quote; a reversed individual payment receives a clear status.

`npm test`, `npm run audit`, and browser scripts are self-contained tests, not substitute for a real Supabase Postgres transaction and Dodo sandbox test. Real-money launch remains gated by credentials, explicit approval and operator verification.
