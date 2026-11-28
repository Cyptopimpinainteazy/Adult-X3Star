'use strict';
/*
 * /cam-model-guide — server-rendered recruitment guide ("How to become a cam model on x3STAR").
 * Rendered on the server (not a #hash route) so search engines can index it. Every pay figure is read from the
 * live economy config, so the page always matches what Admin → Economy is set to.
 */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Whole dollars without cents, cents for normal amounts, and enough precision for sub-cent values like $0.008. */
const usd = (n) => { n = Number(n); const whole = Number.isInteger(Math.round(n * 1e6) / 1e6); const max = n !== 0 && Math.abs(n) < 1 ? 4 : 2; return '$' + n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: max }); };
const num = (n) => Number(n).toLocaleString('en-US');

function guideFacts(c) {
  const beanUsd = Number(c.beanUsd) || 0, perDiamond = Number(c.beansPerDiamond) || 0;
  const tiers = (c.hostTiers || []).slice().sort((a, b) => a.min30d - b.min30d);
  const exampleDiamonds = 10000, exampleBeans = exampleDiamonds * perDiamond;
  return {
    beanUsd, perDiamond, tiers,
    minPayoutBeans: c.minPayoutBeans, minPayoutUsd: c.minPayoutBeans * beanUsd,
    weeklyCapUsd: c.payoutWeeklyCapBeans * beanUsd,
    exampleDiamonds, exampleBeans, exampleUsd: exampleBeans * beanUsd,
    agencyPct: c.agencyCommissionPct,
    topBonus: tiers.length ? tiers[tiers.length - 1].bonusPct : 0
  };
}

function faq(f) {
  return [
    ['Do I have to show my face?', 'No. Plenty of creators stream masked, cropped or with props. Decide before your first show and keep it consistent — fans follow a persona, not a face.'],
    ['How do I get paid?', `Fans buy diamonds and gift them to you during shows. Each diamond becomes ${num(f.perDiamond)} bean${f.perDiamond === 1 ? '' : 's'} in your Creator Studio wallet, and each bean is worth ${usd(f.beanUsd)}. You can request a payout once you have ${num(f.minPayoutBeans)} beans (${usd(f.minPayoutUsd)}), after your ID verification is approved.`],
    ['How much can I earn?', 'It varies enormously. Income depends on how often you stream, your niche, your schedule and how you treat your regulars. Most new creators earn little in their first weeks while they build a following. x3STAR does not promise any level of income.'],
    ['Can I keep streaming on other cam sites?', 'Yes. x3STAR does not require exclusivity. Add your other rooms to your profile and fans see where else you are live.'],
    ['Is my real name shown anywhere?', 'No. Fans only see your stage name and what you choose to put in your profile. Your legal name and ID are used for age verification and payouts only.'],
    ['What do I need to apply?', 'You must be 18 or older and complete government ID and age verification before your first stream. Applications are reviewed by a person.'],
    ['Can a studio or agency manage me?', `Yes. Agencies can manage creators on x3STAR; the agency's commission (currently ${num(f.agencyPct)}% of the creator's earnings) is shown in Creator Studio so there are no surprises.`]
  ];
}

function renderGuide({ econ, baseUrl }) {
  const f = guideFacts(econ), Q = faq(f);
  const url = baseUrl + '/cam-model-guide';
  const title = 'How to Become a Cam Model — The x3STAR Creator Guide';
  const desc = `Everything you need to start camming on x3STAR: equipment, setting up your persona, how diamonds turn into payouts (${usd(f.beanUsd)} per bean, payouts from ${usd(f.minPayoutUsd)}), safety, legal basics and growing a fan base.`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc, mainEntityOfPage: url, publisher: { '@type': 'Organization', name: 'x3STAR', url: baseUrl } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: Q.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }
  ];
  const toc = [['what', 'What the job is'], ['earn', 'How you earn'], ['gear', 'Equipment'], ['setup', 'Setting up'], ['shows', 'Types of shows'], ['grow', 'Growing a fan base'], ['safety', 'Safety & privacy'], ['legal', 'Legal & money'], ['faq', 'FAQ']];
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta name="rating" content="adult">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url)}"><meta property="og:site_name" content="x3STAR">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0a0a0a">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 32 32%27%3E%3Ctext x=%2716%27 y=%2725%27 font-size=%2726%27 text-anchor=%27middle%27 fill=%27%23ff2d87%27%3E%E2%9C%A6%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..800;1,6..96,400..800&family=Inter:wght@300..800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>
:root{--bg:#0a0a0a;--bg2:#111;--text:#f4eef2;--mute:#a59aa2;--dim:#6e646b;--line:rgba(255,255,255,.08);--pink:#ff2d87;--pink2:#ff6aaa;--mag:#c41dff;--serif:'Bodoni Moda',Georgia,serif;--sans:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono',ui-monospace,monospace}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font:400 16.5px/1.7 var(--sans);-webkit-font-smoothing:antialiased}
a{color:var(--pink2)}::selection{background:var(--pink);color:#fff}
.wrap{width:min(1120px,100% - 40px);margin:0 auto}
header.top{position:sticky;top:0;z-index:10;backdrop-filter:blur(14px);background:rgba(10,10,10,.72);border-bottom:1px solid var(--line)}
header.top .wrap{display:flex;align-items:center;justify-content:space-between;height:64px}
.logo{font:italic 600 22px var(--serif);color:var(--text);text-decoration:none}.logo b{font-style:normal;font-family:var(--sans);font-weight:800;letter-spacing:.02em}.logo i{color:var(--pink);font-style:normal}
.btn{display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 22px;border-radius:999px;font:600 14px var(--sans);text-decoration:none;color:#fff;border:1px solid var(--line);transition:.2s}
.btn.pri{background:linear-gradient(135deg,var(--pink),var(--mag));border:0;box-shadow:0 10px 30px -10px rgba(255,45,135,.6)}.btn.pri:hover{transform:translateY(-1px)}
.hero{position:relative;padding:90px 0 60px;overflow:hidden}
.hero:before{content:"";position:absolute;inset:-30% -10% auto;height:520px;background:radial-gradient(closest-side,rgba(255,45,135,.22),transparent),radial-gradient(closest-side at 70% 40%,rgba(196,29,255,.14),transparent);pointer-events:none}
.eyebrow{font:500 11px var(--mono);letter-spacing:.22em;text-transform:uppercase;color:var(--pink2)}
h1{font:500 clamp(42px,7vw,84px)/1 var(--serif);margin:14px 0 18px;letter-spacing:-.01em}h1 em{color:var(--pink2)}
.lead{max-width:640px;font-size:19px;color:var(--mute)}
.hero .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:44px}
.fact{padding:18px 20px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.02)}.fact b{display:block;font:500 28px var(--serif)}.fact span{font:500 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.layout{display:grid;grid-template-columns:220px 1fr;gap:56px;padding:30px 0 80px}
nav.toc{position:sticky;top:90px;align-self:start;font-size:14px}nav.toc a{display:block;padding:6px 0;color:var(--mute);text-decoration:none;border-left:2px solid var(--line);padding-left:14px}nav.toc a:hover{color:var(--text);border-color:var(--pink)}
section{padding-top:20px;margin-bottom:46px;scroll-margin-top:80px}
h2{font:500 clamp(30px,3.6vw,42px)/1.1 var(--serif);margin:0 0 16px}h2 em{color:var(--pink2)}
h3{font:600 17px var(--sans);margin:26px 0 8px}
p,li{color:#d8cfd5}ul{padding-left:20px}li{margin:6px 0}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}
.card{padding:20px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.02)}.card h3{margin-top:0}.card p{margin:0;font-size:15px}
table{width:100%;border-collapse:collapse;margin-top:14px;font-size:15px}th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line)}th{font:500 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.calc{margin-top:18px;padding:20px 22px;border-radius:18px;border:1px solid rgba(255,45,135,.3);background:linear-gradient(135deg,rgba(255,45,135,.08),rgba(196,29,255,.05))}
.calc label{font:500 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}.calc input{width:100%;accent-color:var(--pink);margin:10px 0;background:none;border:0;outline:0}
.calc output{font:500 30px var(--serif)}
.note{font-size:13.5px;color:var(--dim)}
details{border:1px solid var(--line);border-radius:14px;padding:4px 18px;margin:10px 0;background:rgba(255,255,255,.02)}summary{cursor:pointer;padding:12px 0;font-weight:600}details p{margin-top:0}
.cta{margin:20px 0 0;padding:44px;border-radius:24px;text-align:center;border:1px solid rgba(255,45,135,.3);background:radial-gradient(closest-side,rgba(255,45,135,.16),transparent),rgba(255,255,255,.02)}.cta h2{margin-bottom:10px}.cta p{color:var(--mute);max-width:560px;margin:0 auto 22px}
footer{border-top:1px solid var(--line);padding:30px 0 50px;font-size:13px;color:var(--dim)}footer a{color:var(--mute)}footer .wrap{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
@media (max-width:860px){.layout{grid-template-columns:1fr;gap:10px}nav.toc{display:none}.facts{grid-template-columns:1fr 1fr}.cards{grid-template-columns:1fr}.hero{padding-top:56px}.cta{padding:30px 20px}}
</style>
</head>
<body>
<header class="top"><div class="wrap"><a class="logo" href="/"><b>x3</b>STAR<i>✦</i></a><a class="btn pri" href="/casting#apply">Apply — it's free</a></div></header>

<main>
<div class="hero"><div class="wrap">
  <span class="eyebrow">Creator guide · updated ${new Date().toISOString().slice(0, 7)}</span>
  <h1>How to become a <em>cam model</em>.</h1>
  <p class="lead">A straight-talking guide to starting out: the gear you actually need, how to build a persona, how money moves from a fan's gift to your bank, and how to stay safe while you do it.</p>
  <div class="row"><a class="btn pri" href="/casting#apply">Apply to stream on x3STAR</a><a class="btn" href="#earn">See how payouts work</a></div>
  <div class="facts">
    <div class="fact"><b>${usd(f.beanUsd)}</b><span>per bean you earn</span></div>
    <div class="fact"><b>${num(f.perDiamond)} : 1</b><span>beans per gifted diamond</span></div>
    <div class="fact"><b>${usd(f.minPayoutUsd)}</b><span>minimum payout</span></div>
    <div class="fact"><b>+${num(f.topBonus)}%</b><span>top host-tier bonus</span></div>
  </div>
</div></div>

<div class="wrap layout">
<nav class="toc" aria-label="Contents">${toc.map(([id, l]) => `<a href="#${id}">${esc(l)}</a>`).join('')}</nav>
<article>

<section id="what">
  <span class="eyebrow">01</span>
  <h2>What the job <em>is</em></h2>
  <p>Cam modeling is live entertainment for adults who pay to watch, chat and interact with you in real time. You choose when you stream, what you do on camera and what you won't. On x3STAR the room is gamified: fans send animated gifts, climb your top-fans board, join your family, and back you in head-to-head PK battles against other creators. That turns one-off visitors into regulars — and regulars are where the income is.</p>
  <p>It can be a few evenings a week or a full-time business. Either way, treat it like one: a schedule, a brand, and records of what you earn.</p>
</section>

<section id="earn">
  <span class="eyebrow">02</span>
  <h2>How you <em>earn</em></h2>
  <p>Fans buy <b>diamonds</b> and gift them during your shows. Every diamond gifted to you becomes <b>${num(f.perDiamond)} bean${f.perDiamond === 1 ? '' : 's'}</b> in your Creator Studio wallet. Beans are your earnings: each is worth <b>${usd(f.beanUsd)}</b>.</p>
  <ul>
    <li><b>Gifts and combos</b> during public shows — the core of most creators' income.</li>
    <li><b>Private shows</b> and paid requests from your tip menu.</li>
    <li><b>Your store</b> — sell merch and products from your profile and pin them to your stream.</li>
    <li><b>Host-tier bonuses</b> — the more you earn in a 30-day window, the bigger the bonus on every gift:</li>
  </ul>
  <table><thead><tr><th>Tier</th><th>Beans earned in the last 30 days</th><th>Bonus on gifts</th></tr></thead><tbody>
    ${f.tiers.map(t => `<tr><td>${esc(t.name)}</td><td>${t.min30d ? num(t.min30d) + '+' : 'Starting tier'}</td><td>${t.bonusPct ? '+' + num(t.bonusPct) + '%' : '—'}</td></tr>`).join('')}
  </tbody></table>
  <div class="calc" id="calc" data-bean="${f.beanUsd}" data-per="${f.perDiamond}">
    <label for="calcIn">Diamonds gifted to you in a month</label>
    <input id="calcIn" type="range" min="0" max="200000" step="1000" value="${f.exampleDiamonds}">
    <div><output id="calcOut">${num(f.exampleDiamonds)} diamonds → ${num(f.exampleBeans)} beans → ${usd(f.exampleUsd)}</output></div>
    <p class="note" style="margin:6px 0 0">Before any host-tier bonus or agency commission. An illustration of the conversion only, not a forecast of what you will earn.</p>
  </div>
  <h3>Getting paid</h3>
  <p>Request a payout from Creator Studio once you have <b>${num(f.minPayoutBeans)} beans (${usd(f.minPayoutUsd)})</b>. Payouts are capped at ${usd(f.weeklyCapUsd)} per week and require approved ID verification. Every gift, payout and bonus is listed in your Studio earnings tab.</p>
</section>

<section id="gear">
  <span class="eyebrow">03</span>
  <h2>Equipment you <em>actually</em> need</h2>
  <p>Viewers forgive a plain room; they don't forgive a frozen, grainy stream. Spend on picture, light and connection first.</p>
  <div class="cards">
    <div class="card"><h3>Starter</h3><p>A recent laptop or phone camera, a window or desk lamp facing you, and a stable connection. Good enough to test the waters.</p></div>
    <div class="card"><h3>Serious</h3><p>A 1080p webcam, a ring light or softbox, a wired (ethernet) connection with at least 5&nbsp;Mbps upload, and a clip-on mic.</p></div>
    <div class="card"><h3>Studio</h3><p>A mirrorless camera or camcorder through a capture card, two-point lighting, a dedicated streaming PC, and a backdrop you can change between shows.</p></div>
  </div>
  <p class="note">Run a speed test before your first show. Upload speed — not download — decides your picture quality.</p>
</section>

<section id="setup">
  <span class="eyebrow">04</span>
  <h2>Setting <em>up</em></h2>
  <h3>Pick a stage name and persona</h3>
  <p>Choose a name you can live with for years, check it isn't taken on the big cam sites, and reserve it on the socials you'll promote from. Decide your niche and vibe — fans search by them.</p>
  <h3>Build your profile in Creator Studio</h3>
  <ul>
    <li>Avatar, cover and a short bio that tells fans what to expect.</li>
    <li>A <b>tip menu</b>: clear prices for requests, so fans don't have to ask.</li>
    <li>A <b>schedule</b> — regulars plan their nights around it.</li>
    <li>Your other cam rooms, if you stream elsewhere, so fans can follow you.</li>
  </ul>
  <h3>Do a private test run</h3>
  <p>Use the camera preview in Studio to check framing, light and filters before you go live.</p>
</section>

<section id="shows">
  <span class="eyebrow">05</span>
  <h2>Types of <em>shows</em></h2>
  <div class="cards">
    <div class="card"><h3>Public</h3><p>Free to watch, driven by gifts, goals and combos. Where new fans find you.</p></div>
    <div class="card"><h3>Private</h3><p>One-to-one, paid by the minute or by the request. Fewer viewers, higher value.</p></div>
    <div class="card"><h3>PK battles</h3><p>Timed head-to-head rounds against another creator — both fan bases gift to win. Great for growth.</p></div>
  </div>
  <p>Solo, couple and group shows all work; whatever you do, everyone on camera must be 18+ and verified.</p>
</section>

<section id="grow">
  <span class="eyebrow">06</span>
  <h2>Growing a <em>fan base</em></h2>
  <ul>
    <li><b>Consistency beats hours.</b> The same three nights every week outperform random marathons.</li>
    <li><b>Learn names.</b> Thank gifters by name, remember regulars, and reward your top fans — the leaderboard on your profile does half the work.</li>
    <li><b>Set goals.</b> A visible goal with a clear payoff gets the room gifting together.</li>
    <li><b>Post stories and clips</b> between shows so you stay in fans' feeds.</li>
    <li><b>Promote off-site</b> with SFW teasers on social media, linking to your profile — never to explicit content where it isn't allowed.</li>
    <li><b>Join or start a family</b>: families climb a shared leaderboard and bring each other traffic.</li>
  </ul>
</section>

<section id="safety">
  <span class="eyebrow">07</span>
  <h2>Safety &amp; <em>privacy</em></h2>
  <ul>
    <li>Never share your legal name, city, workplace, or anything visible through a window.</li>
    <li>Use a separate email and phone number for your creator identity.</li>
    <li>Check your background for mail, photos, uniforms or landmarks before every show.</li>
    <li>Turn off location data on photos you post.</li>
    <li>Block and report anyone who pressures, threatens or tries to move you off-platform for payment.</li>
    <li>Content stolen from your shows can be taken down — see our <a href="/#legal-dmca">DMCA &amp; content removal</a> process.</li>
  </ul>
  <p>Set your limits before you go live and keep them. You never owe a viewer anything you didn't put on your menu.</p>
</section>

<section id="legal">
  <span class="eyebrow">08</span>
  <h2>Legal &amp; <em>money</em></h2>
  <ul>
    <li><b>Age and ID.</b> You must be 18+ (or the age of majority where you live) and pass government ID verification before your first stream. Anyone else who appears on camera must be verified too.</li>
    <li><b>Taxes.</b> Creators are independent; you're responsible for reporting your income where you live. Set a share of every payout aside and keep records — your Studio earnings history helps.</li>
    <li><b>Local law.</b> Adult streaming isn't legal everywhere. Check the rules where you live before you start.</li>
  </ul>
  <p class="note">This guide is general information, not legal or tax advice.</p>
</section>

<section id="faq">
  <span class="eyebrow">09</span>
  <h2>Frequently asked <em>questions</em></h2>
  ${Q.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n  ')}
</section>

<div class="cta">
  <h2>Ready to take the <em>floor</em>?</h2>
  <p>Applications take a few minutes and are reviewed by a person. Once approved, you'll verify your ID, set up your profile in Creator Studio and go live.</p>
  <a class="btn pri" href="/casting#apply">Apply now — it's free</a>
</div>

</article>
</div>
</main>

<footer><div class="wrap">
  <span>© ${new Date().getFullYear()} x3STAR. All performers are 18 or older and age-verified. Earnings vary; nothing on this page is a promise of income.</span>
  <span><a href="/casting">Casting by state</a> · <a href="/blog">Creator journal</a> · <a href="/">Home</a> · <a href="/#legal-terms">Terms</a> · <a href="/#legal-privacy">Privacy</a> · <a href="/#legal-2257">2257</a> · <a href="/#legal-dmca">DMCA</a></span>
</div></footer>
<script>
(function () {
  var box = document.getElementById('calc'), inp = document.getElementById('calcIn'), out = document.getElementById('calcOut');
  var bean = Number(box.dataset.bean), per = Number(box.dataset.per);
  function fmt(n) { return n.toLocaleString('en-US'); }
  function money(n) { var whole = Number.isInteger(Math.round(n * 1e6) / 1e6); return '$' + n.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }); }
  inp.addEventListener('input', function () { var d = Number(inp.value), b = d * per; out.textContent = fmt(d) + ' diamonds → ' + fmt(b) + ' beans → ' + money(b * bean); });
})();
</script>
</body>
</html>`;
}

module.exports = { renderGuide, guideFacts };
