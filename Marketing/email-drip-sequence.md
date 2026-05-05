# Email Drip Sequence â€” QuoteDr New User Onboarding
*Automated emails triggered when someone signs up. Written in Adam's voice â€” warm, contractor-to-contractor.*

---

## Email 1 â€” Welcome (Send immediately on signup)

**Subject:** Welcome to QuoteDr ðŸ‘‹ Here's where to start

Hey [first name]!

Really glad you're here. I'm Adam â€” I built QuoteDr because I got tired of spending 2 hours on quotes that I could've done in 10 minutes.

Here's the fastest way to get your first quote out the door:

**Step 1:** Go to Settings â†’ add your standard line items and rates. This is your pricing library. Once it's saved, you'll never have to type the same thing twice.

**Step 2:** Hit "New Quote" and add a room. Pick your items from the list, adjust quantities, and watch the total calculate automatically.

**Step 3:** Hit Send â€” your client gets a link to an interactive quote they can view on any device.

That's it. Most people get their first quote built in under 15 minutes.

If you get stuck on anything, just reply to this email. I actually read them.

Talk soon,
Adam
Founder, QuoteDr

---

## Email 2 â€” Tips (Send Day 3)

**Subject:** The one thing most contractors miss when setting up QuoteDr

Hey [first name],

Quick tip that makes a huge difference:

**Set up your upgrade options.**

When you add a line item (like flooring), you can add an upgrade option â€” say, premium hardwood vs standard. When you send the quote, your client can toggle the upgrade on or off and see the price change in real time.

Why this matters: instead of clients emailing you "can we do the nicer tile?" and waiting 2 days for a revised quote â€” they just click it themselves. You get a signed quote faster, and sometimes they upgrade things you never even suggested.

I've had clients add $500-1,000 to jobs this way without me saying a word. ðŸ˜„

Try it on your next quote.

Talk soon,
Adam

---

## Email 3 â€” Job Tracker (Send Day 7)

**Subject:** Do you actually know what your last job cost you?

Hey [first name],

Honest question: when your last job wrapped up, did you know exactly what you spent on materials?

Most contractors don't. And that gap between what you thought you'd spend and what you actually spent is where a lot of money disappears.

That's why Job Tracker is on the roadmap.

The first step is Home Depot Pro uploads/imports so contractors can review purchases against jobs without rebuilding everything by hand. After launch, the bigger goal is card-linked purchase prompts: you buy materials, QuoteDr asks which active job it belongs to, and your job costing stays current without a Sunday-night receipt pile.

For now, use QuoteDr to keep your quote scope, pricing, client approvals, and invoice flow organized. Job costing is coming, and early users will help shape it.

Hit reply if this is one of your biggest headaches. I want early contractors shaping this before it becomes another bloated feature nobody asked for.

Talk soon,
Adam

---

## Email 4 â€” Check-in / Offer Help (Send Day 14)

**Subject:** How's it going? (honest question)

Hey [first name],

It's been a couple weeks â€” just wanted to check in.

Are you finding QuoteDr useful? Is there anything confusing or missing that would make it work better for your business?

I genuinely want to know. This app started as something I built for myself, and it gets better every time a contractor tells me what they actually need.

Hit reply and let me know how things are going. If you've run into any issues I'll fix them personally.

And if you've found it useful â€” I'd really appreciate it if you shared it with one other contractor you know. Word of mouth from people doing real work means everything at this stage.

Thanks for being an early user.

Adam

---

## Email 5 â€” QuickBooks Integration (Send Day 21)

**Subject:** Your invoices can now go straight to QuickBooks

Hey [first name],

Quick heads up â€” QuoteDr now connects directly to QuickBooks.

Once you connect your account (Settings â†’ QuickBooks), you can push any invoice from QuoteDr straight into QuickBooks with one click. No double entry, no copy-pasting.

For anyone running their books through QuickBooks, this saves a ton of time.

To connect: go to Settings â†’ scroll to QuickBooks â†’ click Connect. Takes about 2 minutes.

As always, reply if you have any questions.

Adam

---

## Email 6 â€” Testimonial Ask (Send Day 30 â€” only to active users)

**Subject:** Quick favour to ask ðŸ™

Hey [first name],

You've been using QuoteDr for about a month now â€” I hope it's been saving you time on the quoting side.

I've got a small ask: if QuoteDr has made a difference for you, would you be willing to share a quick 60-second video talking about what changed?

Doesn't need to be fancy â€” phone video is perfect. Just you talking about what quoting used to look like vs. now.

In return: I'll lock you in at your current price forever, and give you 2 months free on top of it.

If you're up for it just reply to this email and I'll send you a few simple prompts to make it easy.

Thanks so much either way.

Adam

---

## Implementation Notes

- Trigger: user signs up at quotedr.io
- Use Supabase + a simple email service (Resend.com is free for 3,000 emails/month)
- Emails should come from adam@quotedr.io or hello@quotedr.io
- Keep plain text format â€” feels more personal than HTML newsletters
- Always "reply to this email" CTA â€” builds relationship and surfaces real feedback
## Launch Safety Notes

- No free tier at launch. Use 14-day free trial language everywhere.
- Pro is $55/month.
- Treat Job Tracker as a roadmap feature. It is fine to mention Home Depot Pro uploads/imports and the long-term plan for card-linked purchase prompts, but do not describe bank sync, debit/credit card prompts, or fully automatic job costing as live yet.
- Replace generated testimonials with real contractor feedback before publishing testimonial claims.
