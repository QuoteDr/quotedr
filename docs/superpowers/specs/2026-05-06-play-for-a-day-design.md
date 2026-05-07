# Play For a Day Pro Trial Design

## Purpose

Replace the current "try once free" Pro paywall with a "Play For a Day" flow. A free user can start a 24-hour trial window for each Pro feature when they first try to open it. During that window, the feature opens normally. After the window expires, the feature locks again and points the user toward Pro, while still allowing future reactivation through promotions or feedback rewards.

## User Experience

When a free user opens a Pro feature without an active window, QuoteDr shows a modal:

> This is a Pro feature, but we'll let you play with it for 24 hours. Do you want to start the trial now?

The modal has two choices:

- **Start 24-Hour Trial**: starts the feature-specific trial and proceeds into the tool.
- **Go Back**: closes the modal and does not start the timer.

If the user returns to the same Pro feature before the 24 hours expires, the tool opens without another prompt. If the window has expired, QuoteDr shows the existing upgrade prompt with updated "Play For a Day" wording.

If the user has any active Play For a Day windows, QuoteDr shows a small, unobtrusive trial status control in the app shell. Clicking it opens a modal with each active trial, its remaining time, and an upgrade button. This is important because users can activate multiple feature trials at the same time.

## Scope

The first implementation keeps trials feature-specific. Opening IKEA Cabinet Quoter starts the IKEA trial only. Opening Job Tracker starts a separate Job Tracker trial. This avoids accidentally burning a global Pro trial when the user only meant to inspect one tool.

The Pro features currently covered are:

- IKEA Cabinet Quoter
- Job Tracker
- AI Refine
- QuickBooks sync

Room photo attachments remain available on the lower plan.

## Data Model

The existing `user_data` row with key `pro_trial_usage` remains in place for compatibility. Each feature entry changes from a one-time used flag to a reusable entitlement window:

```json
{
  "ikea_quoter": {
    "feature": "ikea_quoter",
    "label": "IKEA Cabinet Quoter",
    "status": "active",
    "started_at": "2026-05-06T14:00:00.000Z",
    "expires_at": "2026-05-07T14:00:00.000Z",
    "source": "self_started",
    "activations": 1,
    "followup_due_at": "2026-05-08T14:00:00.000Z",
    "followup_sent_at": null,
    "metadata": {}
  }
}
```

Supported `source` values for the first version:

- `self_started`: the user accepted the 24-hour trial modal.
- `feedback_reward`: manually granted later because the user gave useful feedback.
- `promo`: manually granted later through a promotion.

An entry is active when `expires_at` is in the future. The `status` field is a convenience for display and debugging, but expiry time is the source of truth.

Each activation also has a 30-minute grace period after expiry. During grace, access is still allowed, but QuoteDr shows a one-time grace prompt explaining that the trial has ended and the user has a short extra window to upgrade or send feedback. The grace period does not modify `expires_at`; it is calculated at runtime.

## Frontend Architecture

The reusable Pro gate in `supabase-v2.js` remains the control point:

- `requireProFeature(featureKey, featureLabel, options)` checks Pro subscription first.
- If the user is not Pro, it loads `pro_trial_usage`.
- If the selected feature has an unexpired `expires_at`, access is allowed.
- If the feature has no active window, QuoteDr shows the "Play For a Day" modal.
- If the user starts the trial, QuoteDr saves a new 24-hour window and allows access.
- If the user declines, access is denied and no timer starts.

The existing feature call sites continue to call `requireProFeature`, keeping the feature files small.

Add a reusable trial status widget:

- Hidden when the user is Pro or has no active/grace trials.
- Visible when at least one feature trial is active or in grace.
- Shows the soonest expiry as a compact countdown.
- Opens a modal listing all active/grace feature trials with remaining time.
- Includes one upgrade action and one feedback action.

The widget should be loaded through the shared `supabase-v2.js` helpers so pages do not need feature-specific countdown code.

## Smart Upgrade Prompts

QuoteDr should prompt users at moments where they have just received value, but prompts must be capped to avoid feeling pushy. A prompt is eligible only if the user is not Pro, has an active or recently expired Play For a Day window, and has not seen the same prompt recently.

Initial prompt triggers:

| Trigger | Timing | Message |
| --- | --- | --- |
| User creates a second quote | After saving | Love QuoteDr? Upgrade now and keep building. |
| User uses AI Refine | After successful refinement | AI made this easier. Keep it with Pro access. |
| User views pricing during an active trial | On pricing page load | Get unlimited access with QuoteDr Pro. |
| Trial has 2 hours remaining | One-time modal or toast | Your Pro access expires soon. Upgrade now to keep it. |
| Trial enters grace period | One-time modal | Your Play For a Day trial ended, but you have 30 more minutes. Upgrade now or send feedback. |

Prompt guardrails:

- Do not show more than one smart upgrade prompt per session.
- Do not show the same trigger more than once per feature activation.
- Do not interrupt critical workflows like typing, editing line items, or payment actions.
- Prefer toast/banner prompts for lower-intent moments and modal prompts only for expiry/grace moments.

## Follow-Up Email

The existing `pro-trial-followup` Edge Function continues to scan `pro_trial_usage`. The email copy changes from "you tried it once" to "you started a Play For a Day trial." It keeps the feedback ask:

- Ask what they liked or did not like.
- Invite suggestions to improve QuoteDr.
- Mention that good feedback submissions may unlock Pro tools for a set time.
- Link feedback to `support@quotedr.io`.

The follow-up should only send after `followup_due_at` and only once per activation unless a future reward/promo explicitly resets `followup_sent_at`.

## Promo and Feedback Reactivation

This design does not build a full admin panel or promo-code redemption flow yet. It makes the data model ready for those paths by allowing another activation to overwrite `expires_at`, update `source`, increment `activations`, and clear `followup_sent_at`.

For now, reactivation can be done manually by updating the user's `pro_trial_usage` entry. A later feature can add a small admin tool or promo-code flow on top of the same fields.

The grace period feedback action should open the existing feedback path or a pre-addressed email to `support@quotedr.io`. Submitting feedback does not automatically grant an extension in v1; it creates a clear support/review path so Adam can reward good submissions manually.

## Analytics

Keep existing analytics where possible, but add clearer events:

- `pro_play_day_prompt_shown`
- `pro_play_day_started`
- `pro_play_day_declined`
- `pro_play_day_active_access`
- `pro_play_day_expired`
- `pro_play_day_grace_access`
- `pro_play_day_status_opened`
- `pro_upgrade_prompt_shown`
- `pro_upgrade_prompt_clicked`

The old `pro_trial_used` event can remain temporarily for analytics continuity, but new code should prefer the Play For a Day event names.

## Error Handling

If Supabase save fails after the user starts the trial, QuoteDr should fail closed with a clear message rather than silently granting a trial that will disappear on refresh. If local storage is available but the user is not signed in, the same 24-hour logic can work locally, but signed-in users should persist to Supabase.

Expired windows should not be deleted automatically. Keeping them helps with analytics, support, and future reactivation decisions.

## Testing

Manual verification should cover:

- Free user starts a 24-hour trial and enters the feature.
- Refreshing the page during the active window still allows access.
- Moving `expires_at` into the past locks the feature again.
- Moving `expires_at` less than 30 minutes into the past allows grace access and shows the grace prompt.
- Moving `expires_at` more than 30 minutes into the past locks the feature.
- Declining the modal does not start the timer.
- Each Pro feature has its own independent 24-hour window.
- Multiple active trials appear in the trial status modal with separate countdowns.
- Smart upgrade prompts respect session and activation caps.
- Pro users bypass the modal entirely.
- The follow-up function still finds due trials and sends the updated email.

## Out of Scope

- A customer-facing promo-code redemption page.
- An admin UI for granting reward trials.
- Automatic reward extension after feedback submission.
- Stripe subscription changes.
- A global all-Pro 24-hour pass.
