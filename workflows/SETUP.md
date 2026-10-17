# NGO report & receipt engine — project 28

This implements project 28 with only the agreed substitutions: app forms for Google Forms, Supabase for Google Sheets, direct PDFs for Google Docs, and WhatsApp for Telegram. Facebook, Instagram and poster work are excluded.

## Required intake

- `ngo_donations`: donation date, donor, email/WhatsApp, amount, mode, receipt number, receipt_sent and thank_you_sent.
- `ngo_field_notes`: activity date, activity, numbers, notes and photo. Captions and optional challenges/next-week notes support the donor's required sections.

Submitting either intake form creates the record automatically. No separate Sheet or database update is required. Original numbers are preserved; missing figures are not invented.

## Automatic notification setup — once

Keep the already published v2 report workflow and its credentials. Import `automatic-notifications.json` as a separate workflow, select the existing Header Auth credential (`X-NGO-Key`) on its HTTP node, then publish it. It checks the pending notification queue every minute. It does not replace the WhatsApp inbound bot.

In the app, connect coordinator access once under Records using the existing private header-auth secret. Save the organisation and coordinator contact, and enable Monday reports / monthly follow-up as required. Schedules use Asia/Kolkata: Monday 08:00, monthly on day 1 at 09:00.

- An approved donation creates its numbered receipt and queues the PDF + personalised thank-you to that donor.
- Saving an approved report queues its PDF to saved donors for the same organisation who receive reports.
- Contacts are stored from donation entries. WhatsApp is used when available, otherwise Gmail. There is no per-report manual recipient list.
- The monthly schedule flags donors without a donation in 12 months and notifies the saved coordinator.
- The app requests dispatch automatically after saving; the minute schedule also picks up pending jobs if the browser closes.
- Notification records are claimed atomically. An uncertain provider result is flagged for review and is not retried blindly. Provider acceptance does not establish recipient delivery.

The full core export `ngo-donor-reports-receipts-v2.json` includes the same queue schedule and removes social routes. Replacing an existing workflow is unnecessary for enabling the standalone notification schedule. If using the full export instead, do not enable a duplicate monthly/weekly schedule.

## Report contract

`donor-report-prompt.txt` retains the requested prompt. Donor output has exactly five sections: activities this week, beneficiaries reached (numbers), challenges, next week, and photos (list captions), under 400 words. Source evidence remains in the coordinator review. AI report generation uses the existing OmniRoute credential; route it to Gemini if retaining the specified provider.

Human approval remains necessary before donor reports and financial receipts are sent. No verified tax exemption or 80G entitlement is asserted; the receipt contains an accountant-review placeholder.

## Acceptance tests

Use fictional data and explicitly selected test recipients only:

1. Submit a donation; approve it; confirm a numbered receipt PDF and thank-you reach that donor, measure the under-one-minute target, and verify both sent flags. Repeating the same intake request must not duplicate the receipt or notification.
2. Submit last week's field notes with date, activity, numbers, notes and photo. Run the Monday schedule; review the five-section report, approve it and verify its PDF reaches saved donors.
3. Give a fictional donor an old donation and no recent donation; run the monthly schedule and confirm the coordinator is notified. Add a recent donation and confirm the donor is no longer flagged.

Provider delivery and the one-minute target still require end-to-end testing after the notification schedule is published. WhatsApp delivery must use a supported service conversation or approved template; template messages are not implemented. History scans stop for review at 1,000 donations/notes rather than claiming complete results. No production messages were sent during development tests.
