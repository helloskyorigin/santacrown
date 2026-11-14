# SantaCrown — operator release & incident runbook

**Status:** Code can be deployed and tested without collecting real money. **Do not enable live checkout simply by adding API keys.** Merchant approval, commercial policies, the Supabase migrations, and Dodo sandbox transactions remain external verification gates.

## 1. Deploy source

- Source: `helloskyorigin/santacrown` main; deploy via Vercel Git integration.
- Verify Vercel project is the one attached to `https://santacrown.vercel.app`; an unrelated connected Vercel team can show no projects even though the website is live.
- Public paths to check: `/`, `/terms.html`, `/privacy.html`, `/refunds.html`, `/thanks.html`, `/api/health`, `/api/leaderboard`.
- `/api/health` returns `awaiting_database` before Supabase setup and `ready` only if DB queries succeed. `paymentsEnabled` must remain false until approved and configured. A 200 status in preview does **not** mean payment processing is live.

## 2. Database — administrator action

1. Create an isolated Supabase project and apply **both** `db/001_santacrown.sql` and `db/002_visibility.sql` in this order (SQL Editor).
2. Query `select * from public.santacrown_leaderboard limit 10;` — should be **empty**, not fake data.
3. Restrict secrets to server-side Vercel env vars. Use `SUPABASE_SECRET_KEY` (`sb_secret_...`) rather than exposing a service key in the browser. Confirm `/api/health` returns `ready` after migration.
4. For moderation: `update public.sc_entries set is_visible=false where link='https://actual-abusive-domain.com/';` Hide a listing instead of deleting ledger history. Audit the reason externally; do not silently remove financial records. This also blocks new checkout intents to hidden entries. Restore only after review.

## 3. Dodo — administrator action

1. Obtain **written approval for the exact cumulative paid-rank leaderboard + repeat contributions + Top-3 digital honors model**, not merely an ordinary digital product.
2. Create a one-time Pay What You Want product in USD with minimum $1 and no discount codes. Use Dodo **test mode** first.
3. Set server-side variables from `.env.example` in **Vercel Settings → Environment Variables**. Do **not** paste secrets into GitHub, ChatGPT or frontend files. Never use real secrets in PR logs.
4. Create Dodo webhook URL `https://santacrown.vercel.app/api/webhook`. Subscribe to verified payment, successful refund and dispute transitions. Configure **test-mode** `whsec_...` then test the raw signed event.
5. Keep `SANTACROWN_CHECKOUT_ENABLED=false` while verifying DB and webhook contracts. Only after tests pass, set it and `DODO_PAYMENTS_APPROVED=true` in an isolated **test environment**. Confirm `GET /api/leaderboard` returns `paymentsEnabled:true` in test mode before trying the test checkout.
6. Test paid, failed, cancelled, refunded, partially refunded, same event twice, successful payment after refund/dispute event, chargeback opened/won/lost, and **two simultaneous checkouts for the same link**. Confirm the actual Dodo payload shape matches `api/webhook.js` (especially `total_amount`, metadata, refund and dispute fields). Fail closed and fix any mismatch.
7. After commercial terms are finalized, set `SANTACROWN_COMMERCIAL_TERMS_READY=true`, supply an actual `SANTACROWN_MERCHANT_LEGAL_NAME`, publish the **exact** event cutoff + timezone and set `SANTACROWN_EVENT_CUTOFF_AT` as a future ISO-8601 timestamp. Only then use **live** credentials and `SANTACROWN_LIVE_CONFIRMED=true`. The backend automatically refuses **new live checkouts after cutoff**; running checkouts and webhooks can still reconcile.

## 4. Accounting invariants

- Rank credit is integer US cents from **verified** payments, not browser claims, successful redirect, or pending intents.
- One normalized public URL is one listing. The first verified payment sets the public display name. A public URL does **not** grant ownership or edit access.
- One provider payment ID = one immutable ledger credit; webhook event IDs dedupe repeated messages. The backend uses Postgres transactions.
- Refunds proportionally decrease net credit. Open/lost disputes temporarily or permanently exclude affected payment credits. Final ranking may therefore change even without a new payment.
- The customer may start two separate valid checkouts for the same URL; if both are paid, **both amounts are credited**, even if their combined total exceeds an old target. Quote new targets before checkout. This is a public-spending leaderboard, not a guaranteed reservation system.
- Current public leaderboard is the Top 100; `/api/listing` looks up any paid URL, including outside the Top 100.

## 5. Incident response

**Webhook outage:** keep checkout disabled if confirmed payments cannot be reconciled. Review Dodo webhook logs and replay signed events after fixing the root cause. Never manually increase a browser-displayed total.

**Wrong total or duplicate report:** compare Dodo payment IDs, event IDs, `sc_payments`, `sc_refunds`, `sc_disputes` and `sc_totals`. Correct via verified provider event/RPC or documented admin reconciliation, not by editing frontend amounts.

**Refund or abusive entry:** preserve financial ledger rows, hide public listing via `is_visible=false`, investigate and contact the merchant/provider as appropriate. Do not promise anonymous URL ownership rights.

**Accidental exposure of a secret:** immediately disable checkout, rotate that secret in the provider console, update Vercel, revoke the old key and inspect logs.

**Read outage:** UI shows a stale warning and blocks checkout; customers can retry. No fake figures are inserted.

## 6. Pre-launch test commands

```bash
npm test
python3 tests/frontend_backend_smoke.py
python3 tests/e2e_routes.py
node scripts/release-audit.cjs
```

These tests mock payment infrastructure and do **not** replace real Supabase transaction and Dodo sandbox E2E verification.

Support: **hello.skyorigin@gmail.com**.


## v7 reconciliation deployment — mandatory upgrade

1. Keep `SANTACROWN_CHECKOUT_ENABLED=false` during upgrade; **do not unset** Dodo webhook secret or DB credentials when pausing sales. Existing payment/refund/dispute events must keep reconciling.
2. Run SQL files 001 → 002 → **003_reconciliation.sql** in the dedicated Supabase SQL editor, using your usual audited migration procedure. Existing ledger rows are preserved.
3. Confirm `select version from public.sc_schema_meta where id=1;` returns 3. Verify an empty listing RPC returns JSON null and a fully reversed payment is shown as `reversed`.
4. Run Dodo signed webhook sandbox tests with actual payment success, partial refund, full refund and dispute event variants. Test refunds after sales have been disabled. Replay identical events and confirm no double credit.
5. Only re-enable checkout once the deployment health check and real database-backed transaction checks pass. Do not flip a live flag to bypass missing migration or compliance approval.
