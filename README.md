# NGO Report Desk

Build for Good project #28: NGO Report & Receipt Engine.

Live prototype: https://ngo-report-desk.vercel.app

## Current features

- Mobile-responsive report workspace and fictional sample notes.
- Editable draft preserving supplied facts without AI rewriting.
- Human approval before text export; edits invalidate approval.
- Installable PWA shell and static offline support after first load.

## Not implemented yet

AI drafting, backend storage, PDF/DOCX generation, donation receipts, WhatsApp, donor delivery and real-user evaluation. No impact metrics are claimed.

## Run locally

Requires Python 3. No package installation required.

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000. Install and offline behavior vary by browser; phone testing remains outstanding. Report inputs stay in page memory and may be lost when closing the app.

## Deployment

Static assets live in `dist/`. `vercel.json` declares the static output directory. No credentials belong in this repository.

## Manual verification

1. Load fictional notes and prepare a draft.
2. Verify facts are preserved and export is initially disabled.
3. Approve: export becomes available.
4. Edit the draft: approval is revoked.
5. Change input notes: prepare a new draft before exporting.

## Privacy and human review

Use dummy data in demonstrations. The service worker caches static assets only, not report inputs or API responses. A coordinator must check facts; future delivery must require approval. Do not claim tax deductibility or 80G eligibility without verified details and accountant-approved wording.

## n8n integration

The Vercel `/api/report` endpoint forwards draft-only requests to the Oracle n8n workflow; OmniRoute credentials stay in n8n. Set `N8N_REPORT_WEBHOOK_URL` and secret `N8N_WEBHOOK_SECRET` (matching Header Auth `X-NGO-Key`) in Vercel. Redeploy after changing environment variables. Missing configuration returns HTTP 503. In-memory request limiting is best-effort, not durable distributed rate limiting. Validate n8n live with fictional notes before use.

Browser Print / Save as PDF is available after review approval. AI transport and evidence validation tests: `node --test tests/report.test.cjs`. Actual provider execution remains unverified until credentials are configured.
