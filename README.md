# SantaCrown 👑🎅

SantaCrown is a responsive Christmas 2026 **frontend preview** with an intentionally disabled checkout. The site is not currently collecting money or granting real ranks.

## Current features

- North Pole winter hero, Santa illustration, #1 center throne and #2/#3 on either side.
- Fictional, explicitly labeled design examples; no pretending these are paid users.
- Leaderboard list begins at rank **#4** (no duplicate podium items).
- Christmas name, public profile/website link, USD target, validation and accessible preview modal.
- Mobile-friendly participant links and sticky form action; reduced-motion support.
- Shared, independently tested URL canonicalization and integer-cent USD validation helpers.
- Rules / Privacy / Refund preview dialogs.

## Run locally

Open `index.html` or use `python3 -m http.server 8080`, then open http://localhost:8080.

## Tests

Run the dependency-free logic suite:

```bash
node --test tests/logic.test.cjs
node --check app.js
node --check lib.js
```

An optional UI smoke test is available with Playwright for Python (`python tests/ui_smoke.py`). It uses in-memory HTML to avoid relying on an external development server.

## Payment and security status

**No Dodo checkout, live webhook, database, or real leaderboard is implemented or enabled.** The preview does not collect customer information server-side. To enable real payments safely:

1. Obtain written authorization for the actual paid-placement ranking model, custom amounts, top-three Christmas honors and repeat payment mechanism from the processor. Directory listings of similar websites are not approval.
2. Implement server-side quote of the difference between an intended USD target and the latest **verified** cumulative total, with a unique idempotency key/transaction and concurrency control. Client input is never authoritative.
3. Create each hosted Dodo checkout session **server-side**, in `test_mode` initially, with server-held API credentials and appropriate product configuration. Never expose API keys.
4. Verify signed Dodo webhooks using their *raw request body*, persist unique event IDs and payment IDs in a durable ledger, and update ranks only after verified success. Payment redirects are not proof.
5. Apply refunds/chargebacks and disputes to the ledger, and define tie-breaks and race conditions for concurrent checkouts. Do not rely on a URL alone to authorize changing name, link or rewards.
6. Publish and enforce final participant terms, cutoff with timezone, content moderation rules, privacy disclosures, support contact and refund policy. Remove `noindex` only when the site actually launches.

The preview is not a working payment processor integration; it is a development base. See `docs/LAUNCH_CHECKLIST.md`.

## Project layout

- `index.html` — accessible static UI
- `styles.css` — festive desktop/mobile design
- `lib.js` — shared link and money-validation logic
- `app.js` — preview interactions and fictional leaderboard
- `assets/santa.webp` — optimized Santa illustration
- `favicon.svg` — app icon
- `tests/logic.test.cjs` — automated unit tests
- `tests/ui_smoke.py` — optional Playwright UI smoke tests
- `docs/LAUNCH_CHECKLIST.md` — production readiness audit
