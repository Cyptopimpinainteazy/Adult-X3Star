'use strict';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function socialMetadata({ title, description, url, article = null }) {
  return `<meta property="og:type" content="${article ? 'article' : 'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:site_name" content="x3STAR"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${article ? `${article.published ? `<meta property="article:published_time" content="${esc(article.published)}">` : ''}${article.updated ? `<meta property="article:modified_time" content="${esc(article.updated)}">` : ''}${article.category ? `<meta property="article:section" content="${esc(article.category)}">` : ''}` : ''}`;
}

function homeMetadata(origin) {
  const title = 'Live cams and creator communities | x3STAR';
  const description = 'Explore x3STAR live rooms, creator profiles and community features. Find creator applications, industry guides and professional opportunities. Adults 18+.';
  return `<link rel="canonical" href="${esc(origin + '/')}">${socialMetadata({ title, description, url: origin + '/' })}<script type="application/ld+json">${json({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'x3STAR', url: origin + '/' })}</script>`;
}

module.exports = { esc, json, socialMetadata, homeMetadata };
