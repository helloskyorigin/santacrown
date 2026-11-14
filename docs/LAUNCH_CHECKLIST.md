# SantaCrown Production Launch Checklist

This project is currently **preview-only**. Do not flip checkout live just by changing a button label.

## Blockers (must be completed before any real charges)

- [ ] Written Dodo approval for **exact** cumulative spending leaderboard, repeat payments, custom amounts and Top-3 festive promotional honors.
- [ ] Merchant eligibility, refund / consumer protection and content moderation approved.
- [ ] Document and publish precise timezone, Christmas 2026 contest cutoff, tie-breaks, minimum allowed amount, payment provider transaction limits, disputes, and treatment of multiple payments.
- [ ] Persistent source of truth: `listings` + `payment_orders` + `payment_events` + `refunds` tables, cents stored as integer.
- [ ] Stable identity: normalized public URL identifies listing; public URL alone does **not** grant edit permissions or ability to claim rewards.
- [ ] Secure ownership / reward claim via a signed short-lived link delivered to the verified payment email or verified linked social owner.
- [ ] Server checks: validate URL, name, target amount and currency; ignore client-side calculated differences; check for existing listing; store quote with expiry.
- [ ] Payment handling: create Dodo Checkout Session via server SDK in `test_mode`, never trust redirect, never expose credentials.
- [ ] Verify signed webhook from raw bytes before any DB write. Save Dodo payment IDs with unique constraints, deduplicate webhook events.
- [ ] Atomic idempotent credit of success; refunds/chargebacks reverse credit and trigger rank recalculation.
- [ ] Rate limits and spam controls on quote/checkout endpoints; reject harmful profile content and malicious external URLs.
- [ ] E2E test: success, failed, cancelled, duplicate webhooks, reordered webhooks, refunds, concurrent buys, bad URL, zero amount, large amount, cents precision, expired quote.
- [ ] Real, complete Terms, Refund Policy, Privacy Policy, required business/contact info, and support process.
- [ ] Deployment environment secrets configured securely, separate TEST and LIVE credentials/products/webhook signing keys.
- [ ] Sample ranking content removed on live mode until first verified real entry.
- [ ] Public preview accessible and tested at 320 / 360 / 393 / 768 / 1024 / 1440 px with keyboard and screen reader.
- [ ] Only then switch to live, test a permitted low-value transaction, and reconcile it against the stored payment ledger.

## Recommended schema and invariant

A production design should store every verified payment/refund as a durable ledger row. `listing_total_cents` is the sum of verified successful payment cents **minus** reversed/chargeback cents. Rank order uses `listing_total_cents DESC`, then an announced deterministic tie-break. Duplicate `payment_id` and duplicate webhook event IDs must be ignored. A quoted target is not guaranteed to be the actual rank until server-side payment reconciliation, because another person may pay concurrently.

## Performance and security

- Reduce expensive canvas/particle animations on mobile; CSS snowfall is limited and supports reduced motion.
- Add a strict Content-Security-Policy and other security headers with the hosting provider; see `vercel.json`.
- Use HTTPS only for user external links; `rel=noopener noreferrer nofollow` for outbound links.
- Set all user content via `textContent`; never render arbitrary HTML.
- Cache immutable assets and audit request/response sizes.
- Never commit `.env` files, keys, service-role credentials, or webhook secrets.
