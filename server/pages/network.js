'use strict';
/* Connected discovery with approved photos and opt-in room previews; contact stays on existing boards. */
const { layout, esc } = require('./editorial');
const { STATES, getState } = require('../content/states');
const { CATEGORIES: EMPLOYER_CATEGORIES, MODES } = require('./directory');

const STAR_CATEGORIES = { editing: 'Editing', moderation: 'Moderation', design: 'Design', photography: 'Photography', collaboration: 'Collaboration', other: 'Other' };
const KINDS = { hiring: 'Hiring', available: 'Available for work' };
const scalar = value => typeof value === 'string' ? value : '';
const count = value => Math.max(0, Number(value) || 0);
const plural = (n, word) => `${n} ${n === 1 ? word : /[^aeiou]y$/.test(word) ? word.slice(0, -1) + 'ies' : word + 's'}`;
const excerpt = (text, limit = 170) => { const value = String(text || ''); return value.length > limit ? value.slice(0, limit).trimEnd() + '…' : value; };
const stateName = value => (getState(value) || {}).name || value;
const region = (city, state) => [city, stateName(state)].filter(Boolean).join(', ');
const talentUrl = creator => '/talent/' + encodeURIComponent(creator.id);
const boardUrl = creator => '/stars/' + encodeURIComponent(creator.id) + '/jobs';
const opportunityUrl = job => boardUrl(job.creator || { id: job.creatorId }) + '#job-' + encodeURIComponent(job.id);
const companyUrl = company => '/companies/' + encodeURIComponent(company.id);
const employerJobUrl = job => '/jobs/' + encodeURIComponent(job.id);
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => [...part][0] || '').join('').toUpperCase();

function queryValues(query, keys) {
  const values = Object.fromEntries([...keys, 'pageSize'].map(key => [key, scalar(query[key])]).filter(([, value]) => value));
  if (values.state) values.state = getState(values.state)?.slug || values.state;
  return values;
}
const pageSizeField = values => values.pageSize ? `<input type="hidden" name="pageSize" value="${esc(values.pageSize)}">` : '';
function queryLink(path, values, changes = {}) {
  const params = new URLSearchParams({ ...values, ...changes });
  for (const [key, value] of [...params]) if (!value || (key === 'page' && value === '1')) params.delete(key);
  return path + (params.size ? '?' + params.toString() : '');
}
function options(items, selected, first) {
  return `<option value="">${esc(first)}</option>` + Object.entries(items).map(([value, label]) => `<option value="${esc(value)}"${selected === value ? ' selected' : ''}>${esc(label)}</option>`).join('');
}
function stateOptions(selected, first = 'All U.S. states') {
  return options(Object.fromEntries(STATES.map(state => [state.slug, state.name])), selected, first);
}
function field(label, name, value, placeholder, max = 100) {
  return `<label>${esc(label)}<input type="search" name="${esc(name)}" maxlength="${max}" value="${esc(value || '')}" placeholder="${esc(placeholder)}"></label>`;
}
function select(label, name, items, selected, first) {
  return `<label>${esc(label)}<select name="${esc(name)}">${options(items, selected, first)}</select></label>`;
}
function stateSelect(selected, label = 'U.S. state') {
  return `<label>${esc(label)}<select name="state">${stateOptions(selected)}</select></label>`;
}
function demoLabel(demo) {
  return demo ? '<span class="network-label demo">DEMO PROFILE</span>' : '';
}
function testLabel(test) {
  return test ? '<span class="network-label test">TEST LISTING · no real charge</span>' : '';
}
function dateLabel(value) {
  const date = new Date(value);
  return `<time datetime="${date.toISOString()}">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time>`;
}
function heading(kicker, title, link = '', label = '', countText = '') {
  return `<div class="network-heading"><div><span class="eyebrow">${esc(kicker)}</span><h2>${title}</h2>${countText ? `<p class="meta">${esc(countText)}</p>` : ''}</div>${link ? `<a class="text-link" href="${esc(link)}">${esc(label)} <span aria-hidden="true">↗</span></a>` : ''}</div>`;
}
function empty(title, copy, href, label) {
  return `<div class="network-empty"><span class="network-empty-mark" aria-hidden="true">✦</span><div><h3>${esc(title)}</h3><p>${esc(copy)}</p><a class="text-link" href="${esc(href)}">${esc(label)} <span aria-hidden="true">↗</span></a></div></div>`;
}
function pagination(path, result, values) {
  const current = result.page || 1, pages = result.pages || 0;
  return `<nav class="network-pagination" aria-label="Result pages">${current > 1 ? `<a class="button small" rel="prev" href="${esc(queryLink(path, values, { page: String(current - 1) }))}">← Previous</a>` : ''}<span class="meta">Page ${current}${pages ? ' of ' + pages : ''}</span>${current < pages ? `<a class="button small" rel="next" href="${esc(queryLink(path, values, { page: String(current + 1) }))}">Next →</a>` : ''}</nav>`;
}
function tabs(path, values, entries, active) {
  return `<nav class="network-tabs" aria-label="Browse filters">${entries.map(([key, label, changes]) => `<a href="${esc(queryLink(path, values, { page: '', ...changes }))}"${active === key ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>`;
}

function header(active) {
  const links = [['network', '/network', 'Network'], ['talent', '/talent', 'Talent'], ['opportunities', '/opportunities', 'Free opportunities'], ['companies', '/companies', 'Companies'], ['live', '/#profiles', 'Live app ↗']];
  return `<header class="network-top"><div class="wrap network-top-row"><a class="brand" href="/network" aria-label="x3STAR network">x3<span>STAR</span><i>✦</i></a><nav aria-label="Network">${links.map(([key, href, label]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav><a class="button small network-top-action" href="/employers">Post an employer job <span aria-hidden="true">↗</span></a></div></header>`;
}
function page({ title, description, path, origin, active, content, indexable = false, crumbs = [], previews = false }) {
  // Keep shared canonical/social/schema/footer behavior while giving discovery its own compact header.
  return layout({ title, description, path, origin, content, indexable, crumbs })
    .replace('</head>', '<link rel="stylesheet" href="/assets/network.css">' + (previews ? '<script src="/assets/talent-previews.js" defer></script>' : '') + '</head>')
    .replace('<body>', '<body class="network-page">')
    .replace(/<header class="top">[\s\S]*?<\/header>/, header(active));
}

function talentCard(creator) {
  const location = region(creator.networkCity, creator.networkState);
  const available = count(creator.availableCount), hiring = count(creator.hiringCount);
  const photo = creator.photo, previewId = 'talent-preview-' + encodeURIComponent(creator.id);
  const presence = creator.live ? creator.previewUrl ? 'Check live room' : 'Preview unavailable' : 'Offline';
  return `<article class="network-person talent-card" data-talent-card data-creator-name="${esc(creator.name)}"${creator.previewUrl ? ` data-preview-url="${esc(creator.previewUrl)}"` : ''}>
    <div class="talent-media"><div class="talent-photo${photo ? '' : ' photo-unavailable'}"><span aria-hidden="true">${esc(initials(creator.name))}</span>${photo ? `<img data-talent-photo loading="lazy" decoding="async" width="132" height="132" src="${esc(photo.url)}" alt="${esc(photo.alt || creator.name)}">` : ''}<small>Photo unavailable</small></div>
      ${creator.previewUrl ? `<div class="talent-preview-stage" id="${esc(previewId)}" data-preview-stage hidden></div><div class="talent-preview-controls"><button type="button" data-preview-toggle aria-controls="${esc(previewId)}" aria-expanded="false" hidden>Preview room</button><p class="talent-preview-status" data-preview-status role="status" aria-live="polite"></p><a class="talent-preview-room" data-preview-room target="_blank" rel="sponsored noopener noreferrer" hidden>Open room ↗</a><span class="talent-preview-disclosure">Partner room · x3STAR may earn a referral commission</span></div>` : ''}
    </div>
    <div class="network-person-top"><div><span class="eyebrow">${esc(creator.niche || 'Creator')}</span><h3><a href="${esc(talentUrl(creator))}">${esc(creator.name)}</a></h3></div>${demoLabel(creator.demo)}</div>
    <p class="network-location">${esc(location || 'Location not shared')}</p>
    <p class="network-bio">${esc(excerpt(creator.bio || 'Explore this creator’s current profile and free opportunities.'))}</p>
    <div class="network-tags">${(creator.tags || []).slice(0, 4).map(tag => `<span>${esc(tag)}</span>`).join('')}</div>
    <div class="network-post-counts">${available ? `<span>${plural(available, 'available-work post')}</span>` : ''}${hiring ? `<span>${plural(hiring, 'hiring post')}</span>` : ''}${!available && !hiring ? '<span>No open profile posts</span>' : ''}</div>
    <div class="network-card-foot"><a class="text-link" href="${esc(talentUrl(creator))}">View profile <span aria-hidden="true">↗</span></a><span class="network-presence" data-preview-presence>${presence}</span></div>
  </article>`;
}
function opportunityCard(job) {
  const creator = job.creator || { id: job.creatorId, name: 'Creator' };
  const location = job.location || (job.workMode === 'remote' ? 'Work remotely' : 'See post for location');
  return `<article class="network-opportunity">
    <div class="network-card-kicker"><span class="network-label">${esc(KINDS[job.kind] || job.kind)}</span><span class="meta">Free star post</span>${demoLabel(creator.demo)}</div>
    <h3><a href="${esc(opportunityUrl(job))}">${esc(job.title)}</a></h3>
    <p class="network-byline">By <a href="${esc(talentUrl(creator))}">${esc(creator.name)}</a>${creator.networkState || creator.networkCity ? ` <span>· ${esc(region(creator.networkCity, creator.networkState))}</span>` : ''}</p>
    <p class="meta">${esc(STAR_CATEGORIES[job.category] || job.category)} · ${esc(MODES[job.workMode] || job.workMode)} · ${esc(location)}</p>
    <p class="network-bio">${esc(excerpt(job.description, 190))}</p>
    <p class="network-compensation">${esc(job.compensation)}</p>
    <div class="network-card-foot"><span class="meta">Until ${dateLabel(job.expiresAt)}</span><a class="text-link" href="${esc(opportunityUrl(job))}">View post / inquire <span aria-hidden="true">↗</span></a></div>
  </article>`;
}
function employerJobCard(job) {
  return `<article class="network-opportunity network-paid">
    <div class="network-card-kicker"><span class="network-label paid">Paid directory placement</span>${testLabel(job.test)}</div>
    <h3><a href="${esc(employerJobUrl(job))}">${esc(job.title)}</a></h3>
    <p class="network-byline">${esc(job.companyName)}</p>
    <p class="meta">${esc(EMPLOYER_CATEGORIES[job.category] || job.category)} · ${esc(MODES[job.workMode] || job.workMode)}${job.location || job.state ? ' · ' + esc(region(job.location, job.state)) : ''}</p>
    <p class="network-bio">${esc(excerpt(job.description, 190))}</p><p class="network-compensation">${esc(job.compensation)}</p>
    <div class="network-card-foot"><span class="meta">Until ${dateLabel(job.expiresAt)}</span><a class="text-link" href="${esc(employerJobUrl(job))}">View employer job <span aria-hidden="true">↗</span></a></div>
  </article>`;
}
function companyCard(company) {
  const jobs = company.jobs || [];
  return `<article class="network-company">
    <div class="network-person-top"><span class="network-avatar company" aria-hidden="true">${esc(initials(company.companyName))}</span><div><span class="eyebrow">Employer directory</span><h3><a href="${esc(companyUrl(company))}">${esc(company.companyName)}</a></h3></div></div>
    ${company.test ? '<p class="network-label test">TEST LISTINGS · no real charge</p>' : ''}
    <p class="network-location"><span>Listing location</span> ${esc(region(company.location, company.state) || 'See individual openings')}</p>
    <p class="network-bio">${plural(jobs.length, 'current employer opening')}. Read each listing for its scope, working arrangements and compensation.</p>
    <div class="network-card-foot"><a class="text-link" href="${esc(companyUrl(company))}">View company openings <span aria-hidden="true">↗</span></a></div>
  </article>`;
}

function renderNetwork({ origin, talent = [], opportunities = [], companies = [], employerJobs = [] }) {
  const realContent = talent.some(creator => !creator.demo) || opportunities.some(job => !job.creator?.demo) || companies.some(company => !company.test) || employerJobs.some(job => !job.test);
  const content = `<section class="network-hero">
    <div><span class="eyebrow">The x3STAR network · Adults 18+</span><h1>Meet the people.<br><em>Make your next move.</em></h1><p class="lead">Discover creators, find a collaborator, or meet the team behind your next role. A connected place for the work that happens on camera and beyond it.</p>
      <form class="network-quick-search" action="/talent" method="get"><label for="network-search">Find talent</label><div><input id="network-search" name="q" type="search" maxlength="100" placeholder="Creator name, niche or skill"><button class="button primary" type="submit">Search talent <span aria-hidden="true">↗</span></button></div></form>
      <p class="fine">Browse and inquire for free. Creator posts and paid employer listings have their own spaces.</p>
    </div>
    <aside class="network-pathways"><span class="eyebrow">A place to connect</span><h2>What’s your<br>next chapter?</h2>
      <a href="/talent"><span class="network-path-number">01</span><span><b>Discover talent</b><small>People, skills and public profiles</small></span><span aria-hidden="true">↗</span></a>
      <a href="/opportunities"><span class="network-path-number">02</span><span><b>Find a collaborator</b><small>Free hiring and available-work posts</small></span><span aria-hidden="true">↗</span></a>
      <a href="/jobs"><span class="network-path-number">03</span><span><b>Explore employer jobs</b><small>Reviewed paid directory placements</small></span><span aria-hidden="true">↗</span></a>
    </aside>
  </section>
  <section>${heading('Talent directory', 'People in the network.', '/talent', 'Explore all talent', plural(talent.length, 'profile') + ' shown')}<div class="network-grid people">${talent.length ? talent.map(talentCard).join('') : empty('The talent directory is taking shape.', 'Approved creator profiles will appear here as the network grows.', '/casting', 'Explore creator applications')}</div></section>
  <section>${heading('Free star opportunities', 'A reason to work together.', '/opportunities', 'All free opportunities', plural(opportunities.length, 'post') + ' shown')}<p class="network-section-copy">Hiring, collaboration and work creators are available to do. These are free posts from individual star boards.</p><div class="network-grid two">${opportunities.length ? opportunities.map(opportunityCard).join('') : empty('No open star posts yet.', 'Creators can publish a free hiring or available-work post from their Studio.', '/studio#jobs', 'Manage your free board')}</div></section>
  <section>${heading('Paid employer directory', 'The team behind the work.', '/jobs', 'All employer jobs', plural(employerJobs.length, 'opening') + ' shown')}<p class="network-section-copy">Employers purchase directory placement after review. Applicants browse and inquire for free. Development test listings are labeled individually.</p><div class="network-grid two">${employerJobs.length ? employerJobs.map(employerJobCard).join('') : empty('No open employer jobs yet.', 'Employers can prepare an opening and submit it for review.', '/employers', 'Post an employer job')}</div></section>
  <section>${heading('Companies', 'Find the people hiring.', '/companies', 'Explore companies')}<div class="network-grid two">${companies.length ? companies.map(companyCard).join('') : empty('No active company listings yet.', 'Companies appear while they have a current public employer listing.', '/employers', 'Create an employer listing')}</div></section>
  <section class="network-next"><div><span class="eyebrow">Start where you are</span><h2>New here?<br>Make a considered start.</h2><p>Explore creator applications and practical guides, or discover talent who choose to share their state.</p><div class="actions"><a class="button" href="/casting">Creator casting ↗</a><a class="text-link" href="/blog">Read the creator journal ↗</a></div></div><form class="network-state-jump" action="/talent" method="get"><label for="network-state">Explore talent by U.S. state</label><select id="network-state" name="state">${stateOptions('', 'Choose a state or see all')}</select><p class="fine">Locations are optional and self-declared. A state does not imply an office or an in-person audition.</p><button class="button primary" type="submit">Explore talent ↗</button></form></section>`;
  return page({ title: 'Creator talent, opportunities and companies', description: 'Discover x3STAR creator profiles, free star opportunities and employer openings in one connected adult professional network.', path: '/network', origin, active: 'network', content, indexable: realContent, previews: true });
}

function renderTalent({ origin, result, query = {} }) {
  const values = queryValues(query, ['q', 'state', 'intent']);
  const content = `<section class="network-list-hero"><span class="eyebrow">The talent directory · 18+</span><h1>People with<br><em>something to create.</em></h1><p class="lead">Explore creator profiles, discover shared skills and find people with current hiring or available-work posts.</p><p class="fine">Location is optional and self-declared. Demo profiles are labeled.</p></section>
    <section class="network-results">${tabs('/talent', values, [['all', 'All talent', { intent: '' }], ['available', 'Available for work', { intent: 'available' }], ['hiring', 'Hiring', { intent: 'hiring' }]], values.intent || 'all')}
      <form class="network-filters talent" action="/talent" method="get">${pageSizeField(values)}${field('Search talent', 'q', values.q, 'Name, niche or skill')}${stateSelect(values.state)}${select('Open profile posts', 'intent', KINDS, values.intent, 'Any intent')}<div class="network-filter-actions"><button class="button primary" type="submit">Find talent</button><a class="text-link" href="/talent">Clear filters</a></div></form>
      <div class="network-result-heading"><h2>Find your people.</h2><p class="meta">${plural(result.total, 'profile')} match</p></div><div class="network-grid people">${result.talent.length ? result.talent.map(talentCard).join('') : empty('No matching talent profiles.', 'Try another name, skill or state, or clear your filters.', '/talent', 'See all talent')}</div>${pagination('/talent', result, values)}
    </section>`;
  return page({ title: 'Find creator talent', description: 'Search approved x3STAR creator metadata profiles by name, skills, public state and open hiring or available-work posts.', path: '/talent', origin, active: 'talent', content, previews: true, crumbs: [['Network', '/network'], ['Talent', '/talent']] });
}

function renderTalentProfile({ origin, creator, jobs = [] }) {
  const location = region(creator.networkCity, creator.networkState), path = talentUrl(creator);
  const content = `<section class="network-profile-hero"><div class="network-avatar large" aria-hidden="true">${esc(initials(creator.name))}</div><div><span class="eyebrow">Creator profile · ${esc(creator.niche || 'Creator')}</span><h1>${esc(creator.name)}</h1><div class="network-profile-status">${demoLabel(creator.demo)}<span class="network-presence">${creator.live ? 'Marked live by creator' : 'Currently offline'}</span></div><p class="network-location">${esc(location || 'Location not shared')}${location ? '<span>Self-declared public location</span>' : ''}</p><div class="network-tags">${(creator.tags || []).map(tag => `<span>${esc(tag)}</span>`).join('')}</div><div class="actions"><a class="button primary" href="#opportunities">View free opportunities ↗</a><a class="button" href="/#member-${encodeURIComponent(creator.id)}">Open member profile ↗</a></div></div></section>
    <section class="network-profile-content"><article><span class="eyebrow">About</span><h2>A little introduction.</h2><p class="network-full-bio">${esc(creator.bio || 'This creator has not added an introduction yet.')}</p></article><aside class="network-profile-aside"><span class="eyebrow">Their free board</span><h3>Make the first connection.</h3><p>${plural(jobs.length, 'current post')} from this creator. Read the scope and compensation, then use the existing board to send a private inquiry.</p><a class="text-link" href="${esc(boardUrl(creator))}">Open the full star board ↗</a><p class="fine">Your account name, email, message and optional portfolio link are shared with the listing owner and authorized administrators when you send an inquiry.</p></aside></section>
    <section id="opportunities">${heading('Free star opportunities', 'Ways to work together.', boardUrl(creator), 'Open this star’s board', plural(jobs.length, 'current post'))}<div class="network-grid two">${jobs.length ? jobs.map(job => opportunityCard({ ...job, creator })).join('') : empty('No open profile posts right now.', 'This creator has no current hiring or available-work posts. You can explore opportunities from other stars.', '/opportunities', 'Browse free opportunities')}</div></section>`;
  return page({ title: `${creator.name} — creator profile`, description: excerpt(`${creator.name}. ${creator.niche || 'Creator'}. ${creator.bio || 'Explore current free profile opportunities and ways to work together.'}`, 160), path, origin, active: 'talent', content, indexable: !creator.demo, crumbs: [['Network', '/network'], ['Talent', '/talent'], [creator.name, path]] });
}

function renderOpportunities({ origin, result, query = {} }) {
  const values = queryValues(query, ['q', 'state', 'location', 'kind', 'category', 'workMode']);
  const active = values.category === 'collaboration' ? 'collaboration' : values.kind || 'all';
  const content = `<section class="network-list-hero"><span class="eyebrow">Free star opportunities · 18+</span><h1>Good work starts<br><em>with a connection.</em></h1><p class="lead">Find creators hiring for their teams, looking to collaborate, or sharing work they are available to take on.</p><p class="fine">Free profile posts from individual stars. <a href="/jobs">Explore paid employer directory openings ↗</a></p></section>
    <section class="network-results">${tabs('/opportunities', values, [['all', 'All posts', { kind: '', category: '' }], ['hiring', 'Hiring', { kind: 'hiring', category: '' }], ['available', 'Available for work', { kind: 'available', category: '' }], ['collaboration', 'Collaboration', { kind: '', category: 'collaboration' }]], active)}
      <form class="network-filters opportunities" action="/opportunities" method="get">${pageSizeField(values)}${field('Search opportunities', 'q', values.q, 'Post, creator or skill')}${stateSelect(values.state, 'Star’s U.S. state')}${field('Work location', 'location', values.location, 'City, region or time zone')}${select('Post type', 'kind', KINDS, values.kind, 'Hiring or available')}${select('Category', 'category', STAR_CATEGORIES, values.category, 'All categories')}${select('Arrangement', 'workMode', MODES, values.workMode, 'Any arrangement')}<div class="network-filter-actions"><button class="button primary" type="submit">Find opportunities</button><a class="text-link" href="/opportunities">Clear filters</a></div></form>
      <div class="network-result-heading"><h2>Find a way to work together.</h2><p class="meta">${plural(result.total, 'post')} match</p></div><div class="network-grid two">${result.jobs.length ? result.jobs.map(opportunityCard).join('') : empty('No matching open star posts.', 'Try a broader search, or publish a hiring or available-work post on your own free board.', '/studio#jobs', 'Manage your free board')}</div>${pagination('/opportunities', result, values)}
      <p class="fine">Read each post before inquiring. Sending a private inquiry starts a conversation; it does not confirm a booking, job or payment.</p>
    </section>`;
  return page({ title: 'Free creator hiring, availability and collaboration posts', description: 'Browse real open star-board posts. Filter free hiring, available-work and collaboration opportunities by state, category, arrangement and work location.', path: '/opportunities', origin, active: 'opportunities', content, crumbs: [['Network', '/network'], ['Free opportunities', '/opportunities']] });
}

function renderCompanies({ origin, result, query = {} }) {
  const values = queryValues(query, ['q', 'state']);
  const content = `<section class="network-list-hero"><span class="eyebrow">Companies · employer directory</span><h1>Meet the teams<br><em>with a role to fill.</em></h1><p class="lead">Find companies through their current employer openings. Explore the work, compare the scope and start a private conversation from a listing.</p><p class="fine">Company names and listing locations come from current reviewed directory advertisements. Development test listings are labeled.</p></section>
    <section class="network-results"><form class="network-filters companies" action="/companies" method="get">${pageSizeField(values)}${field('Search companies', 'q', values.q, 'Company name or listing')}${stateSelect(values.state, 'Listing U.S. state')}<div class="network-filter-actions"><button class="button primary" type="submit">Find companies</button><a class="text-link" href="/companies">Clear filters</a></div></form>
      <div class="network-result-heading"><h2>Find your next team.</h2><p class="meta">${plural(result.total, 'company')} match</p></div><div class="network-grid two">${result.companies.length ? result.companies.map(companyCard).join('') : empty('No matching active companies.', 'Companies appear while they have a current public employer listing. Try another search or return as new openings are published.', '/jobs', 'Browse employer jobs')}</div>${pagination('/companies', result, values)}
    </section><section class="network-employer-cta"><div><span class="eyebrow">For employers</span><h2>Your next teammate<br>could start here.</h2><p>Create a draft, submit it for review, then purchase a directory listing period. Applicants can inquire for free.</p></div><a class="button primary" href="/employers">Post an employer job ↗</a></section>`;
  return page({ title: 'Companies with current employer openings', description: 'Explore companies represented by current public x3STAR employer directory listings. Find their open roles and inquire for free.', path: '/companies', origin, active: 'companies', content, crumbs: [['Network', '/network'], ['Companies', '/companies']] });
}

function renderCompanyProfile({ origin, company }) {
  const jobs = company.jobs || [], path = companyUrl(company);
  const content = `<section class="network-profile-hero"><div class="network-avatar large company" aria-hidden="true">${esc(initials(company.companyName))}</div><div><span class="eyebrow">Company · employer directory</span><h1>${esc(company.companyName)}</h1>${company.test ? '<p class="network-label test">TEST LISTINGS · no real charge</p>' : ''}<p class="network-location"><span>Listing location</span> ${esc(region(company.location, company.state) || 'See individual openings')}</p><p class="lead">Explore ${plural(jobs.length, 'current employer opening')} from this company. Each listing describes the work and how to inquire privately.</p><p class="fine">The location describes advertised work. Read individual openings for their working arrangements.</p><div class="actions"><a class="button primary" href="#openings">Browse openings ↗</a><a class="text-link" href="/companies">All companies ↗</a></div></div></section>
    <section id="openings">${heading('Paid employer directory', 'Current employer openings.', '/jobs', 'All employer jobs', plural(jobs.length, 'opening'))}<p class="network-section-copy">Employers pay for directory placement. Browsing and sending an inquiry are free for applicants. Test listings do not represent a real charge.</p><div class="network-grid two">${jobs.length ? jobs.map(employerJobCard).join('') : empty('No current public openings.', 'This company has no currently available employer listings.', '/jobs', 'Browse employer jobs')}</div></section>`;
  return page({ title: `${company.companyName} — employer openings`, description: `Explore current employer openings from ${company.companyName}. Read the work, arrangement and compensation, then inquire for free.`, path, origin, active: 'companies', content, indexable: jobs.length > 0 && !company.test, crumbs: [['Network', '/network'], ['Companies', '/companies'], [company.companyName, path]] });
}

module.exports = { renderNetwork, renderTalent, renderTalentProfile, renderOpportunities, renderCompanies, renderCompanyProfile };
