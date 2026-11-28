# Casting funnel and editorial SEO research

Reviewed against primary sources on **2026-11-27**. These are implementation recommendations for `/casting`, state pages, and public `/blog` articles; they do not establish indexing, rankings, traffic, hiring eligibility, or legal compliance.

## State pages: conversion coverage before search expansion

Google identifies region/city pages that funnel visitors to one destination and substantially similar intermediate pages as possible doorway abuse. Its scaled-content policy also targets large amounts of low-value, unoriginal content created primarily to manipulate ranking, regardless of how it is produced. A list of city names is not useful local reporting. [Google spam policies](https://developers.google.com/search/docs/essentials/spam-policies)

**Recommendation:** make all 50 state URLs useful destinations for visitors arriving from the state directory or a campaign, with an actual application form and a separate partner choice. Initially allow indexing only for state pages with reviewed, substantive local guidance. Keep other conversion pages `noindex,follow` and outside the sitemap until their local material is ready. This staged publishing rule is our editorial decision, not a Google-required number of pilot states. A resource link or changing a state name alone does not make a page substantial.

For an indexed state page, explain remote participation accurately, give a practical local planning checklist and relevant official resources, and provide a clear application path. Avoid invented offices, local auditions, salary figures, testimonials, or guaranteed acceptance. Google recommends original, useful content and clear sourcing that demonstrates why readers should trust it. [People-first content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

Allow crawlers to fetch a page carrying `noindex`; blocking the same URL in `robots.txt` prevents Google from reading that directive. The directive controls indexing, not access or privacy. [Google noindex documentation](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

## Crawlable pages and stable URL metadata

Use public HTML URLs for articles and casting pages, with readable content, titles, descriptions, links and canonical tags in the initial response. Use the chosen site origin consistently. Tracking parameters should not create competing canonical content URLs. Distinct useful state pages can have their own canonical URLs; a canonical tag is not a substitute for improving their content. Redirect duplicate URL forms and use a consistent canonical in HTML, internal links and sitemaps. Canonical annotations are signals, not a guarantee that Google chooses the same URL. [Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

The sitemap should list only intended canonical, indexable pages. Escape XML values. Set `lastmod` from a maintained publication/update date or a meaningful content change; do not replace every page's date with the current day on each request. Google uses consistently accurate modification dates and ignores sitemap `priority` and `changefreq`. Submitting a sitemap is discovery assistance, not proof of indexing. [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

## Separate informational recruitment from explicit content

Google recommends separating explicit pages onto a different domain or subdomain when a site mixes significant explicit and non-explicit content. Otherwise even non-explicit pages may be affected by site-level SafeSearch classification. Explicit images, links, ads and video can contribute to classification. Adding a recruitment path on the existing host does not guarantee SafeSearch visibility. [Explicit-content SEO guidance](https://developers.google.com/search/docs/specialty/explicit/guidelines)

**Recommendation for this change:** casting and creator-help articles should be informational pages with no automatic live-room requests, explicit thumbnails, player embeds or partner redirects. Show the adult nature of the opportunity in plain language and keep partner navigation deliberate. Render informational content without the fan app's JavaScript splash/age gate. This recommendation concerns those informational pages; existing viewer access controls and performer verification remain separate. Do not introduce a user-agent-only Googlebot exception. Consider a separate informational host later only as a deliberate deployment and branding decision.

Apply explicit-rating metadata to content that is actually explicit rather than automatically copying it to every informational page. Google warns that adult metadata can itself cause non-explicit pages to be classified as explicit. The host's other content and linked destinations still matter. [Incorrect explicit classification troubleshooting](https://developers.google.com/search/docs/specialty/explicit/troubleshooting)

## Editorial articles and structured data

Start with useful creator questions: application paths and what each collects; preparing a private workspace; equipment checks before spending; account and identity separation; boundaries and moderation tools; a practical first-session preparation checklist. Use an honest editorial organization byline instead of invented experts or experience. Date articles accurately, link related guides and make the relevant application action available after the article.

`BlogPosting` is a suitable article subtype. Its headline, author or organization, publisher, canonical page, and publication/modification dates should describe the visible article. Images are optional editorial assets; do not invent them solely to populate markup. Google supports `Article`, `NewsArticle` and `BlogPosting`, but structured data does not guarantee a special search display. [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article)

Do not use `JobPosting` on a general state casting page or partner promotion. Google's current policy limits it to a single actual job posting and prohibits advertisements disguised as job postings, including affiliate promotions. It also prohibits false job locations and candidate-data collection without current hiring. This conclusion does not rely on a presumed adult-job prohibition absent from the current page. [JobPosting policies](https://developers.google.com/search/docs/appearance/structured-data/job-posting)

Keep FAQs useful for readers without promising FAQ rich results. Google's changelog says the FAQ rich-result feature stopped appearing on May 7, 2026, with its documentation removed June 15, 2026. [Search documentation updates](https://developers.google.com/search/updates)

Clearly identify the independent partner path and the commercial relationship. Mark affiliate/paid-placement links `rel="sponsored"`; Google prefers that value, while `nofollow` remains acceptable. Keep internal attribution redirects consistent with the real destination and user-visible choice. [Qualifying outbound links](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)

## Verified resources for initial state profiles

These are primary-source starting points for local business research. They do not endorse x3STAR, verify a creator's eligibility, or establish that every listed service supports adult-industry businesses. Link readers to the resource rather than summarizing legal/tax duties as settled advice.

| State | Primary resource | Useful reader task |
| --- | --- | --- |
| California | [CalOSBA: setting up a business](https://calosba.ca.gov/for-small-businesses-and-non-profits/set-up-your-business-in-california/) | Find the state's guidance on business location, structure, registration and local planning questions. |
| Colorado | [Secretary of State: Business Organizations](https://www.sos.state.co.us/pubs/business/businessHome.html) | Find the business-startup course, name tools, trade-name information and official filing resources. |
| Texas | [Governor's Office: Start a Business in Texas](https://gov.texas.gov/business/page/start-a-business) | Work through a business-planning checklist and locate state/local resource routes. |
| Florida | [Florida SBDC Network](https://floridasbdc.org/) | Locate a regional center and review training, planning and consulting options. |
| Nevada | [Department of Business and Industry: Business Resource Hub](https://www.business.nv.gov/business-resource-hub/) | Find the state's roadmap, resource directory and licensing-information routes. |
| New York | [New York State Business Startup Guide](https://www.ny.gov/services/new-york-state-business-startup-guide) | Locate official structure, registration, insurance and assistance resources. |

The Colorado OEDIT production page returned HTTP 403 to the research fetcher, and Colorado SBDC's homepage denied this crawler through robots.txt. The official Secretary of State page above was fetched successfully; use that verified resource rather than publishing an unverified development-host URL.

## Evidence boundary after implementation

### Journal SEO pass, 2026-11-27

The 58 articles already had distinct titles and descriptions, readable initial HTML, visible bylines/dates, canonical URLs and related reading. Preserve that material. Google's guidance calls for concise, descriptive titles and page-specific summaries; it does not prescribe a universal title/description character limit or recommend repeating keywords. The journal's main heading now describes its subject. [Title guidance](https://developers.google.com/search/docs/appearance/title-link), [description guidance](https://developers.google.com/search/docs/appearance/snippet).

Three permanent topic guides at `/blog/topics/creators`, `/blog/topics/affiliates` and `/blog/topics/hiring` add distinct introductions, curated reading stages, complete audience collections and reciprocal article breadcrumbs. Each is a useful destination with its own canonical; arbitrary search/filter variants remain noindex. CollectionPage and ItemList describe the visible collections without promising a Google rich result. [CollectionPage](https://schema.org/CollectionPage), [ItemList](https://schema.org/ItemList).

The sitemap now contains 72 canonical pages. The homepage has canonical/social metadata, and `/index.html` redirects to `/` with query attribution preserved. Shared social metadata supplies Twitter title/description and article publication/update/category information using authored values. No stock imagery, fabricated publication times, keyword-volume estimates or ranking claims were added.

The informational cam-model guide contains informational text, with no explicit images, videos or graphic sexual descriptions. Its automatic monthly “updated” stamp was removed because it did not represent editorial changes. Its explicit-rating tag was removed; the live-room homepage retains its adult rating. The visible FAQ stays, while the guide's unnecessary FAQPage markup and outdated documentation were removed. Google's May/June 2026 FAQ documentation update and explicit-content guidance were rechecked for this pass. This does not establish or change Google's classification of the host. [Search updates](https://developers.google.com/search/updates), [explicit-content metadata](https://developers.google.com/search/docs/specialty/explicit/guidelines).

Run `npm run check:seo -- http://127.0.0.1:8080` against a running server to check sitemap entries and their initial HTML metadata. This local gate does not execute JavaScript, fetch live media, contact partner sites, inspect an external Search Console account or measure real search performance.

Local HTTP tests can prove page HTML, links, metadata, form behavior, attribution storage, redirects and sitemap selection. They cannot prove Google indexed a URL or that search traffic converted. After an authorized deployment, use Search Console URL Inspection and sitemap reporting, then evaluate organic landing-page visits, completed x3STAR applications and tracked partner exits separately. Partner exits are clicks, not confirmed registrations or revenue.
