/** Bundled sample meetings for Demo mode. All people and companies are fictional. */
export interface SampleMeeting {
  id: string;
  title: string;
  blurb: string;
  transcript: string;
}

const SPRINT = `[00:00] Maya Chen: Okay, let's get started. This is planning for sprint 24, and the main goal is the checkout revamp. Conversion on mobile checkout dropped to 2.1 percent last month, and the funnel shows most people leaving at the payment step.
[00:18] Lena Fischer: Right, and the session recordings back that up. People bounce when the card form asks for the billing address before they even see the total. The new design moves the order summary to the top and puts the wallet buttons first.
[00:36] Dev Patel: From the backend side the big piece is the orders table. We still write the cart and the order in two separate transactions, which is why we get those orphaned orders. I'll write the migration for the new orders schema by Wednesday.
[00:54] Maya Chen: Good. How big is that, honestly?
[00:58] Dev Patel: Five points. The migration itself is small, but the backfill for 1.2 million historical orders has to run in batches overnight.
[01:10] Priya Nair: On the frontend, the payment step is the risky one. We have two options. We keep our custom card form and restyle it, or we switch to the Stripe Payment Element, which gives us Apple Pay, Google Pay and 3D Secure out of the box.
[01:28] Dev Patel: The custom form has caused three production bugs this year. Every time Stripe changes something we patch it by hand.
[01:36] Lena Fischer: And the Payment Element can be themed with our design tokens, so it won't look foreign.
[01:42] Maya Chen: Then let's go with the Stripe Payment Element and retire the custom card form. Any objections? Okay. Decided.
[01:52] Priya Nair: Great. I'll build the new payment step behind the checkout v2 feature flag. Should be ready for review by Friday.
[02:04] Maya Chen: Priya, can you also pair with Lena on the order summary component? It has to work on small phones.
[02:12] Priya Nair: Sure, happy to.
[02:15] Lena Fischer: I'll send the final mockups and the redlines tomorrow morning. I'll also add the missing empty state for the cart.
[02:26] Sam Okafor: From QA, my concern is test coverage. The current end-to-end suite only covers card payments. If we add wallets we need test accounts for Apple Pay and Google Pay, and Apple Pay only works in real Safari.
[02:42] Maya Chen: Can someone own getting the Apple Pay sandbox set up? It needs a verified domain on staging.
[02:48] Dev Patel: I can take that. I did the domain verification last year for the marketing site.
[02:54] Sam Okafor: Then I'll extend the Playwright suite to cover the wallet buttons and the 3D Secure challenge. That's probably three points.
[03:04] Maya Chen: Okay. Guest checkout. Lena, where did we land on that?
[03:08] Lena Fischer: We decided to keep guest checkout, but we offer account creation after the payment succeeds, not before. The data says forcing sign-up costs us about 18 percent of first-time buyers.
[03:20] Dev Patel: That works for the backend. The order just gets linked to the account afterwards by email.
[03:26] Sam Okafor: What happens if the guest's email already belongs to an existing account? Do we merge the orders automatically or ask them to log in?
[03:34] Maya Chen: Good question. I'm not sure if legal is okay with merging orders automatically. Let's park that one, and I'll check with legal by next Tuesday.
[03:50] Maya Chen: Next topic, address autocomplete. Support tickets about wrong addresses went up 30 percent since we removed it.
[03:58] Priya Nair: The old provider got expensive. We could use the Google Places API, but the per-session pricing adds up at our volume.
[04:08] Dev Patel: Or we use Loqate, which the logistics team already pays for. We would just need a new API key with a domain restriction.
[04:16] Maya Chen: Let's go with Loqate since we already have the contract. Dev, can you request the API key from the logistics team this week?
[04:24] Dev Patel: Will do.
[04:26] Sam Okafor: One more risk. The Black Friday code freeze starts on November 14. If checkout v2 isn't stable by then, we're stuck on the old flow until December.
[04:38] Maya Chen: That's a hard deadline. So the plan is feature complete by the end of next week, then one week of bug bash and a 10 percent rollout before the freeze.
[04:48] Lena Fischer: Should we run an A/B test or just do a staged rollout? An A/B test gives us cleaner conversion numbers.
[04:56] Maya Chen: I think a staged rollout is enough for now, but let's revisit that at the next planning. We still need to decide who watches the dashboards during the rollout.
[05:06] Sam Okafor: I'll write up the bug bash plan and share it in the channel by Monday. Everyone should block two hours for the bug bash next week.
[05:16] Dev Patel: We need to add monitoring for payment failures before the rollout, otherwise we're flying blind. I'll set up the Datadog alerts for the payment error rate as soon as possible.
[05:28] Maya Chen: Agreed. Let's keep the sprint at 34 points total. Dev has the migration, the sandbox and the alerts, Priya has the payment step and the summary, Sam has the test suite, and Lena has the mockups.
[05:40] Priya Nair: Sounds good. One thing: the design system button doesn't support the loading state we need for the pay button. Lena, could you add a loading variant to the design system when you get a chance?
[05:50] Lena Fischer: Yes, it's a small change.
[05:53] Maya Chen: Great. Last thing, I'll update the sprint board and the release notes draft today. Thanks everyone, this was a good one.`;

const CLIENT = `[00:00] Jordan Reyes: Thanks for making time, Alex and Tom. The goal today is to walk through the prototype for the online ordering site and agree on the scope for phase one.
[00:10] Alex Morgan: Great, we're excited. Our baristas are drowning in phone orders during the morning rush, so anything that moves people online helps.
[00:19] Rita Gomez: I've shared the prototype link in the chat. The flow is: pick a store, build your drink, pay, and get a pickup time. We kept it to four screens.
[00:31] Tom Becker: I love how clean the menu looks. One thing though, the seasonal drinks need to be much more prominent. The autumn menu launch is our biggest week of the year.
[00:42] Rita Gomez: That's easy. We can add a featured carousel at the top of the menu that your team controls from the CMS.
[00:50] Alex Morgan: My bigger concern is the pickup times. If ten orders come in at 8 am, the store can't make them all in five minutes. Last time we tried a vendor app, customers were frustrated because the times were wrong.
[01:04] Jordan Reyes: Understood. We could throttle the slots, so each store sets how many drinks it can make per five minutes, and the app only offers times that fit.
[01:14] Alex Morgan: That's exactly what we need. Can that be per store? The downtown store has three espresso machines, the harbour one only has one.
[01:22] Jordan Reyes: Yes, per store. We'll go with configurable capacity per store for phase one.
[01:28] Tom Becker: What about loyalty? Customers keep asking whether their stamps carry over to the app.
[01:34] Jordan Reyes: Loyalty is a bigger piece because it depends on your point of sale system. Honestly, I'd keep it out of phase one so we can launch before the holidays.
[01:43] Alex Morgan: I agree, as long as it's next on the list. We decided internally that launching in November matters more than having everything.
[01:51] Jordan Reyes: Then we agreed that phase one is ordering, payment and pickup slots, and loyalty moves to phase two.
[01:58] Alex Morgan: Which integration are you assuming? We're on Square in four stores and still on the old Clover system in the airport kiosk.
[02:06] Jordan Reyes: Square only for phase one. Is it worth migrating the kiosk to Square before launch, or do we leave it out of online ordering for now?
[02:16] Alex Morgan: I'm not sure yet whether the franchise will pay for that migration. I need to talk to the airport manager first.
[02:21] Jordan Reyes: Okay, we'll leave that open for now. Alex, can you send us the Square API credentials for a sandbox account by Friday?
[02:28] Alex Morgan: Sure. I'll also send the store hours and the capacity numbers for each location.
[02:34] Tom Becker: And I'll get you the brand photography and the seasonal menu copy by next Wednesday.
[02:41] Rita Gomez: Perfect. I'll update the prototype with the featured carousel and the slot picker by Tuesday, so you can test it with a few baristas.
[02:50] Jordan Reyes: On budget, the phase one estimate stays at 42,000 dollars, which includes the slot throttling. Loyalty would be quoted separately.
[02:58] Alex Morgan: That's within what we approved. Our finance team needs the updated statement of work before they can sign.
[03:05] Jordan Reyes: I'll send the revised statement of work tomorrow. Our target is a soft launch in two stores on November 3, then all Square stores a week later.
[03:15] Tom Becker: Can we do a launch promo, like a free pastry with your first app order? Who would set that up, us or you?
[03:22] Jordan Reyes: The discount codes come from Square, so your team would create them, and we'd make sure the app shows them. Rita, could you mock up a promo banner for the home screen?
[03:31] Rita Gomez: Yes, I'll mock that up this week.
[03:34] Alex Morgan: This is really helpful. Thanks, everyone, I'm feeling good about this.`;

const INCIDENT = `[00:00] Hannah Lee: Let's do the review for Tuesday's search outage. Quick reminder, this is blameless. We're here to fix the system, not to point fingers.
[00:09] Marco Silva: Timeline first. We deployed the new search index config at two in the afternoon. Ten minutes later the error rate on the search API hit 40 percent, and search was fully down for 50 minutes.
[00:24] Aisha Khan: Support got 212 tickets in that hour. The most frustrating part for customers was the status page. It said all systems operational for the first 35 minutes.
[00:36] Hannah Lee: That's not okay, and it's the third time this year the status page lagged behind an incident.
[00:43] Ben Turner: The root cause is that the new config doubled the shard count, and the cluster ran out of heap during the reindex. The canary didn't catch it because the canary cluster has almost no data.
[00:56] Marco Silva: And the rollback took 40 minutes because the old index snapshot had to be restored by hand. We don't have a script for that.
[01:04] Hannah Lee: Okay. So three problems: the canary isn't realistic, the rollback is manual, and the status page is manual too.
[01:12] Ben Turner: For the canary, we need to seed the canary cluster with a sampled copy of production data. I'll write the sampling job by next Friday.
[01:21] Marco Silva: I'll script the snapshot restore and add it to the runbook. That's the most urgent one, I'd like it done by Thursday.
[01:30] Aisha Khan: Can we automate the status page? If the error rate is above 10 percent for five minutes, it should flip to degraded on its own.
[01:39] Marco Silva: We can wire that to the existing Datadog monitor. It's maybe half a day of work.
[01:44] Hannah Lee: Let's do it. We've decided that the status page updates automatically from now on, and on-call can override it. Marco, can you own the status page automation as well?
[01:55] Marco Silva: Yes, I'll have it live by the end of next week.
[01:59] Aisha Khan: From support, we also need to send a follow-up email to the 40 enterprise accounts that were affected. They're upset, and two of them mentioned their contract renewal.
[02:10] Hannah Lee: I'll draft the apology email today and send it to Aisha for review. Aisha, could you pull the list of affected accounts from Zendesk?
[02:20] Ben Turner: Should we also add a load test for index changes to the CI pipeline? It would have caught this.
[02:27] Marco Silva: It would, but a full load test takes 40 minutes. I'm not sure whether it's worth blocking every deploy on it.
[02:35] Hannah Lee: Let's park the load test question for the next architecture review. We agreed that every search config change now needs a second reviewer from the SRE team.
[02:48] Aisha Khan: Thanks. I appreciate the honesty on this one. The customers mostly want to know it won't happen again.
[02:55] Hannah Lee: Fair. I'll publish the incident report on the status page by Monday, with the three fixes and their dates. Thanks, everyone.`;

export const SAMPLES: SampleMeeting[] = [
  { id: 'sprint', title: 'Sprint 24 planning: checkout revamp', blurb: 'Five engineers plan a sprint: Stripe vs custom card form, guest checkout, a code-freeze deadline.', transcript: SPRINT },
  { id: 'client', title: 'Client call: online ordering, phase one', blurb: 'An agency and a coffee chain agree scope, pickup-slot throttling, budget and launch dates.', transcript: CLIENT },
  { id: 'incident', title: 'Incident review: search outage', blurb: 'A blameless post-mortem with three fixes, owners and a tense status-page discussion.', transcript: INCIDENT },
];
