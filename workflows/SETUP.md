# NGO Donor Reports & Donation Receipts — project 28

Google Forms, Sheets and Docs are excluded. The app provides intake; Supabase provides records; PDFs are generated directly. Existing Gmail, WhatsApp, Facebook and Instagram routes are retained. Instagram/Facebook poster generation remains stage two; publishing an existing poster URL is retained.

## Publish the automation

1. Import `ngo-donor-reports-receipts-v2.json` as a NEW workflow. Keep the working v1 workflow until v2 is tested. The new webhook path is `ngo-report-desk-v2`.
2. Select existing credentials on the webhook (Header Auth, `X-NGO-Key`), OmniRoute model, Gmail, WhatsApp and Facebook/Instagram HTTP nodes. On the three schedule/notification HTTP nodes, select the same Header Auth credential. Do not alter the existing WhatsApp inbound bot workflow.
3. Publish v2. Test the webhook with action `capabilities` and a unique `request_id` using your existing private header. It must return `version:2` and `pdf_delivery:true`.
4. Set Vercel `N8N_REPORT_WEBHOOK_URL` to `https://n8n.myaiteam.work.gd/webhook/ngo-report-desk-v2`, then redeploy. `N8N_ENGINE_WEBHOOK_URL` is already configured for this URL. Keep `N8N_WEBHOOK_SECRET` unchanged.
5. In Records, connect coordinator access using your existing workflow header-auth secret. This enables sending/publishing for that browser; the public app itself requires no login. The secret is not stored in the browser.
6. Save field notes in the app with their date. In Records, enable weekly reports and monthly follow-up as needed. Schedule timezone is Asia/Kolkata: Monday 08:00; first day of each month 09:00.

The OmniRoute credential must route to Gemini if retaining the specification's model choice. No provider credentials are present in the export. Selected credentials on the existing v1 workflow are not changed by this import.

## Report contract

`donor-report-prompt.txt` contains the requested instruction. The model returns evidence-linked JSON for verification; the app renders the exact five donor sections. The report, including its metadata and headings, must contain fewer than 400 words. Evidence/checks stay in the coordinator view. User-supplied photo captions are preserved; no captions or beneficiary figures are invented. Attendance is not summed into unique beneficiaries.

A scheduled report is a draft until a coordinator approves it. Human approval is mandatory before delivery. Reports can be downloaded as PDF with optional photo pages. Private sharing attaches the approved report PDF to up to ten explicitly selected recipients. Receipt delivery attaches the actual numbered PDF with the approved thank-you.

## Acceptance tests — fictional data only

- Add an approved fictional donation. A database-generated receipt number and PDF must be produced; repeat the same request ID and confirm the same receipt is returned. To test Gmail or WhatsApp delivery, use only an explicitly approved recipient and confirm both PDF and thank-you arrive. Check delivery flags. The under-one-minute delivery target is not yet measured.
- Save field notes dated in the previous India-time Monday–Sunday week. Execute the weekly schedule. Open the draft in Records, verify all five sections and the word count, approve, save, then download PDF. Do not add participation across activities into a unique beneficiary total.
- Add a fictional donor with an old donation, then another recent donation using the same email or WhatsApp number. Only donors with no recorded donation in 12 months should appear in follow-up. Execute the monthly schedule and confirm the coordinator-only alert.
- Check that an unrelated browser cannot list or open these private records. Clearing browser storage loses access to its workspace key; download reports for archival purposes.

## Boundaries

- Gmail/WhatsApp/social delivery requires valid credentials and a live provider account. WhatsApp documents require an allowed service conversation or approved template strategy; template messages are not implemented in this workflow. No template-window bypass is attempted.
- Delivery retries are blocked after an uncertain receipt result. Reconcile n8n/provider history before manually resetting the delivery log. Provider acceptance does not prove recipient delivery.
- Inactivity scans stop for manual review at 1,000 donations rather than claiming complete results. Matching uses email, otherwise WhatsApp, otherwise exact donor name; a permanent donor directory would improve identity resolution.
- Weekly schedules read at most 1,000 notes per workspace and require shorter input when the report input limits are exceeded. Very large multi-organisation batches need queue batching.
- Monthly alert dispatch is claimed once per workspace and month. An uncertain execution requires manual reconciliation before resetting its run claim.
- Receipts are donation acknowledgements, not verified tax certificates. An accountant must verify tax-exemption details; no 80G entitlement is asserted.
- No production messages were sent as part of development tests.
