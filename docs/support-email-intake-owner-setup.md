# Support email intake: owner setup and operating boundary

## What this local change does

`support@quotedr.io` and `feedback@quotedr.io` stay Google Workspace aliases
that deliver to `admin@quotedr.io`. This change does not modify MX, aliases,
Gmail, DNS, Resend, or the current in-app Feedback alert. It adds a separate,
signed intake boundary that creates a reviewable AI Operations case after a
trusted bridge has read a message.

The AI Operations Dashboard cannot send a message, start engineering work,
deploy, grant credit, or claim that a fix is live. Every recommended response
is editable and must be sent manually outside QuoteDr after the existing human
and owner gates.

## Recommended Google Workspace bridge

Use a small, dedicated Google Cloud service account workload (Cloud Run or
Cloud Functions), not browser code and not a broad personal OAuth token.

1. Create a dedicated Workspace mailbox or narrowly delegated Workspace
   identity that has read-only access to the two existing aliases' destination
   mailbox. Do not change the aliases or mail routing.
2. Enable Gmail API and Pub/Sub in the same dedicated Google Cloud project.
3. Register a Gmail `users.watch` for `INBOX` only, publish into a private
   Pub/Sub topic, and renew the watch before Gmail's expiration. Pub/Sub only
   signals a history ID: the bridge must call Gmail History and Messages APIs
   to fetch the message, then acknowledge the notification only after the
   intake endpoint reports success or duplicate.
4. Request the minimum Gmail scope: `https://www.googleapis.com/auth/gmail.readonly`.
   With domain-wide delegation, restrict the client to the dedicated mailbox;
   do not grant a general administrator mailbox or send/modify scope.
5. The bridge must permit only messages whose delivered recipient is exactly
   `support@quotedr.io` or `feedback@quotedr.io`. It must normalize MIME into
   plain text plus sanitized HTML, send attachment *metadata only*, and include
   the Gmail message ID, thread ID, `In-Reply-To`, and `References` values.
6. Give the bridge a distinct `QUOTEDR_SUPPORT_INTAKE_HMAC_SECRET`. Sign the
   exact UTF-8 JSON request body as lower-case hexadecimal HMAC-SHA-256 in
   `x-quotedr-intake-signature`. Store it only in Google Secret Manager and
   Supabase Edge Function secrets. Rotate it with an overlap plan; never put
   it in HTML, JavaScript, source control, or Apps Script properties shared
   with end users.
7. Set `QUOTEDR_SUPPORT_INTAKE_ACTOR_ID` to a dedicated, existing Supabase
   Auth service identity used only to attribute the intake audit events. It is
   not a browser login and must not be a customer account.

The request shape is versioned by the Support Agent contract and uses this
ingestion envelope:

```json
{
  "action": "ingest_email",
  "provider": "gmail",
  "providerMessageId": "example-message-id",
  "providerThreadId": "example-thread-id",
  "recipientAddress": "support@quotedr.io",
  "senderEmail": "customer@example.invalid",
  "senderName": "Example Customer",
  "subject": "Example support request",
  "plaintext": "Message body",
  "html": "<p>Message body</p>",
  "inReplyTo": "",
  "referenceIds": [],
  "attachments": [{"name": "screen.png", "mimeType": "image/png", "sizeBytes": 1200}],
  "receivedAt": "2026-08-09T00:00:00.000Z"
}
```

Use `example.invalid` only in local and test fixtures. The bridge must not
fetch, scan, or persist attachment content in this first phase.

### Alternative: Apps Script

An Apps Script trigger is acceptable only for a low-volume transitional bridge
when it uses a dedicated account, Script Properties for the HMAC secret,
explicit retries and dead-letter logging, and the narrow Gmail read-only scope.
It is less robust than Pub/Sub for replay, watch renewal, and observability.
Do not expose a web app URL that accepts arbitrary mail payloads, and do not
give it Gmail send, modify, or full mail access.

## Privacy, retention, and access

- `ai_support_raw_messages` holds original content, quoted text, threading,
  and quarantined attachment metadata. It is RLS-enabled, has no browser
  grants, and is only read through the authenticated administrator endpoint.
- `ai_support_cases` contains the smaller engineering-facing report. The
  existing coordinator brief redacts customer identifiers, email addresses,
  secure links, and token-like values before it enters the coordinator inbox.
- Raw messages default to a 90-day retention period. An owner can invoke the
  `purge_retention` action after review; its audit event contains no raw text.
  Legal hold, deletion requests, or a different retention policy require an
  owner decision before changing this default.
- In-app Feedback first remains saved in `feedback`, then separately invokes
  this intake with a stable `feedback:<created_at>` key, and still sends the
  existing admin alert. Retrying either path cannot create another intake case.
- The Support Agent adapter contract is `support-agent/v1`. With no trained
  agent configured it returns a visible `SUPPORT_AGENT_NOT_CONFIGURED` status
  and blank response draft. It must not infer an answer. A future live adapter
  requires a separate owner review of its service authentication, egress,
  prompts, privacy treatment, and model retention terms.

## Deployment checklist (owner action only)

1. Review and apply the migration, then deploy `support-intake` with its
   internal HMAC verification enabled. Do not deploy this branch implicitly.
2. Set only these function secrets: `QUOTEDR_SUPPORT_INTAKE_HMAC_SECRET` and
   `QUOTEDR_SUPPORT_INTAKE_ACTOR_ID`; verify the existing Supabase URL, anon,
   and service-role secrets are platform managed. Do not use a browser key for
   the bridge.
3. Configure the Gmail/Pub/Sub bridge in a test mailbox first. Verify a
   signed example.invalid message is accepted, an invalid signature is 401,
   a duplicate Gmail delivery returns the same case, and a wrong recipient is
   denied.
4. In an authenticated admin session, verify the dashboard overview has no
   original body, `Load original customer message` works only for an
   administrator, and an estimator receives 403. Confirm the coordinator brief
   contains no raw body or address.
5. Verify desktop and mobile: the original-message section, unavailable-agent
   notice, editable recommended-response workflow, and privacy-minimized
   engineering handoff remain clear at narrow width.
6. Confirm manual response, billing/credit, engineering handoff, and deployment
   gates still reject unauthorized or unapproved actions. Keep email sending
   outside this dashboard.

## Later owner-controlled release steps

This repository does not contain a Cloudflare project binding or a deploy token.
Do not guess either one. When the owner is available and separately activates
this release, use this sequence only after QBO has terminal verification:

1. Owner authenticates the existing QuoteDr Cloudflare account in the approved
   release session and identifies the existing production Pages/Worker project
   and its production branch. Confirm the target project, branch, and current
   deployed commit on screen. Do not create a project, change DNS, alter MX, or
   add a Worker route.
2. Owner authorizes a scoped, short-lived Cloudflare credential only for that
   existing project if the normal release path requires a CLI credential. Keep
   the credential out of the repository, browser code, logs, and chat. Deploy
   only the reviewed static web assets; do not purge caches or change redirects
   until the owner approves the exact release verification plan.
3. Owner authenticates the intended Supabase project and confirms its project
   reference, migration history, and function list. Set
   `QUOTEDR_SUPPORT_INTAKE_HMAC_SECRET` and
   `QUOTEDR_SUPPORT_INTAKE_ACTOR_ID` directly in the Edge Function secret
   store without displaying values. The actor ID must be a dedicated existing
   service identity, never a customer or browser account.
4. Apply only `20260809022026_support_email_intake.sql`, then deploy only
   `support-intake`. Re-run the reviewed HMAC, unauthorized-user, raw-message,
   redacted-handoff, and no-autosend checks before releasing the static assets.
   Do not deploy the Google bridge, create a Gmail watch, set a Pub/Sub
   subscription, or configure the Support Agent adapter in this release.
5. After the owner confirms the Cloudflare static release is serving the exact
   integrated commit, run authenticated owner/admin and estimator-denial checks
   with synthetic `example.invalid` data. Record evidence without raw message
   bodies. A real mailbox bridge and live Support Agent need a separate owner
   activation, scoped Google Workspace/OAuth credentials, and a successful
   mock-only rehearsal.

## Residual risks

- Gmail history/watch handling and retries are not live until the owner creates
  the Google Cloud bridge. Gmail may issue replayed or delayed notifications;
  the endpoint records a delivery key and provider message ID to deduplicate.
- The local function is configured with gateway JWT verification disabled so a
  signed Gmail webhook can reach it. The handler performs mandatory HMAC
  verification before email ingestion; deployment must not proceed without the
  secret set.
- Sanitization is defensive display storage, not a malware scanner. Attachment
  content stays quarantined and unavailable in this phase.
