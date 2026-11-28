# Employer directory and paid listing research

Reviewed against primary sources on **2026-11-27**. This note informs a sitewide jobs directory and paid employer placements. It does not establish merchant approval, successful payment processing, actual recruiting activity or search indexing.

## SexyJobs reference and verification limit

The user named SexyJobs as the product reference. Its [home page](https://www.sexyjobs.com/), [advertiser/job-seeker help](https://www.sexyjobs.com/help) and [terms](https://www.sexyjobs.com/terms) returned HTTP 403 to the research browser. Searches restricted to the primary domain did not return verifiable pricing content. **No current SexyJobs price, plan duration, advertiser tier or renewal condition was verified.** Do not present a competitor price found in an older third-party review as current fact.

Use the requested general marketplace pattern—public job search, employer accounts, paid placements and candidate inquiries—without copying branding, content, employer records or unverifiable pricing. A locally chosen x3STAR price is a product setting, not a claim about SexyJobs.

## Payment provider findings

### Stripe

Stripe's official FAQ says it cannot currently work with businesses that sell or offer adult content/services, and says support is determined by its account review. The combined x3STAR platform includes adult services, so a generic Stripe checkout must not be assumed acceptable merely because one product is recruitment advertising. This is a reason to obtain a provider decision about the actual business model, not a claim that every independent recruitment board is prohibited. [Stripe prohibited/restricted-business FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-faqs), [Stripe restricted-business list](https://stripe.com/legal/restricted-businesses)

### PayPal

The current US Acceptable Use Policy is dated **November 4, 2026**. Certain sexually oriented materials/services are prohibited; its approval table separately includes mature digital content, live streaming and marketplaces. Preapproval is required for activities in that table. Avoid an outdated blanket claim that every adult-related merchant is accepted or banned, and do not activate PayPal based only on a normal account login. [PayPal US Acceptable Use Policy](https://www.paypal.com/us/legalhub/paypal/acceptableuse-full)

### CCBill

CCBill publicly offers adult-business merchant accounts and processing. That supports investigating it as a candidate, but does not mean this user's business has an approved account. [CCBill adult-business processing](https://ccbill.com/industries/adult-business)

Its hosted FlexForms allow merchants to configure payment forms/flows, use payment links and test changes before going live. Sandbox links require a logged-in merchant Admin session; they are not a public checkout to hand to arbitrary employers. An actual merchant account and configured live payment flow are needed before claiming a functioning public checkout. [FlexForms overview](https://ccbill.com/doc/flexforms-overview)

CCBill's documented events include initial-sale success/failure, refund and chargeback notifications. Those event types are relevant to granting and revoking a paid listing entitlement; a browser success redirect alone is insufficient payment evidence. [Webhooks overview](https://ccbill.com/doc/webhooks-overview)

The Webhooks User Guide requires merchant account/subaccount setup, documents JSON or URL-encoded notifications, custom pass-through variables and source IP ranges. It does not document a generic HMAC request-signature scheme in the inspected material. Do not label an invented shared-secret endpoint as a CCBill integration. An eventual adapter should use the chosen provider's actual documented verification mechanism, trusted proxy handling, immutable order correlation and replay-safe fulfillment. [Webhooks User Guide](https://ccbill.com/doc/webhooks-user-guide)

### Segpay

Segpay markets processing for adult, cam, creator and dating merchants, with merchant application and bank/card-brand approval steps. Its public adult checklist asks for business/site documentation and clear pricing/refund information. It is another merchant-onboarding candidate, not proof that this directory or the wider x3STAR platform is approved. [Segpay adult merchant processing](https://segpay.com/verticals/high-risk/), [official adult website checklist](https://segpay.com/wp-content/uploads/2024/12/Adult_Content_Website_Checklist.pdf)

## Practical first implementation

**Recommendation, not a statement of processor approval:** make the directory, employer management, pricing and listing entitlement work independently of an eventual card processor.

- Store listing price in integer cents and snapshot amount, currency and duration into each order. Client input must not control price or publication entitlement.
- Keep employer draft, moderation, payment and publication states distinct. A paid or test-paid order must not bypass employer/ad review.
- Start the paid display term when the approved listing is published, so review time does not silently consume that term. Record expiry and prevent edits from extending it for free.
- Offer an explicitly labeled local test mode and a disabled mode. Test orders must stay distinguishable from real revenue and must not silently become paid production listings.
- An optional **manual invoice** mode can show owner-configured payment instructions. Only an authorized Admin confirms an actual received payment with an audited receipt/reference. This is an owner attestation, not automatic processor verification. Do not call an unpaid invoice a payment or treat an employer's own “paid” claim as sufficient.
- Preserve order/payment records and references, make confirmation idempotent, and prevent a receipt/reference from being reused to pay multiple orders. Refunded/voided entitlements should not stay publicly promoted. Recording a refund is separate from actually moving money through a provider.
- Keep existing stars' free profile boards compatible. Charge for a separately requested, reviewed directory placement rather than silently changing every existing profile post into a billable ad.

Without merchant credentials/approval and an agreed payment destination, live card checkout is an external dependency. Continue the product, order ledger, review flow, manual controls and real local failure-case tests; report live processing separately.

## Search and content boundaries

Google permits `JobPosting` markup only on a page for a single actual opening. Search/list pages should not carry individual-job markup, and available-for-work service offers are not eligible job postings. Its policies also reject applicant-paid jobs, fake vacancies, incomplete descriptions, misleading locations and affiliate promotions disguised as jobs. Employer-paid advertising is different from charging applicants to apply, but paying for a listing does not establish schema eligibility or truthful content. [Google JobPosting documentation](https://developers.google.com/search/docs/appearance/structured-data/job-posting)

Do not invent an adult-specific prohibition absent from the current inspected document. Also do not promise Google Jobs inclusion. A conservative first version can publish useful HTML with canonical metadata and no `JobPosting` markup until individual listings have the required genuine job details and a reviewed publishing policy. Applicants should browse and submit inquiries without being charged by the directory.

## Evidence boundary

Real HTTP/SQLite tests can establish owner isolation, payment-state transitions, moderation/publication gates, expiry, replay/duplicate handling and restart recovery. Local test orders and manual Admin confirmations do not establish a live processor charge, real revenue, a completed external refund, employer legitimacy or a hiring outcome. Keep those claims distinct in UI, Admin reports, evidence and release notes.
