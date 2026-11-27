/* Shared only by the public casting and editorial pages. No media or analytics SDKs. */
(function () {
  'use strict';
  const allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];
  const params = new URLSearchParams(location.search);
  const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) : '';
  let campaign = {};
  try {
    const saved = JSON.parse(sessionStorage.getItem('x3_casting_campaign') || '{}');
    if (saved && Number.isFinite(saved.first_seen) && Date.now() - saved.first_seen < 86400000) {
      for (const k of allowed) if (clean(saved[k])) campaign[k] = clean(saved[k]);
      campaign.first_seen = saved.first_seen;
    }
  } catch { /* Attribution storage is optional; the form must still work. */ }
  for (const k of allowed) if (clean(params.get(k))) campaign[k] = clean(params.get(k));
  if (!campaign.first_seen) campaign.first_seen = Date.now();
  try { sessionStorage.setItem('x3_casting_campaign', JSON.stringify(campaign)); } catch { /* Private browsing/storage limits. */ }

  document.querySelectorAll('a[data-partner]').forEach(link => {
    const target = new URL(link.getAttribute('href'), location.origin);
    target.searchParams.set('s', (link.dataset.source + (campaign.utm_source ? '_' + campaign.utm_source : '')).slice(0, 80));
    if (campaign.utm_campaign) target.searchParams.set('c', campaign.utm_campaign.slice(0, 80));
    link.href = target.pathname + target.search;
  });

  const form = document.getElementById('casting-form');
  if (!form) return;
  const status = document.getElementById('apply-status');
  const button = form.querySelector('button[type=submit]');
  button.disabled = false;
  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || !form.reportValidity()) return;
    const fields = form.elements;
    const stage = fields.stage.value.trim(), email = fields.email.value.trim();
    status.textContent = '';
    status.removeAttribute('data-error');
    status.removeAttribute('data-success');
    if (stage.length < 2 || !email) { status.dataset.error = 'true'; status.textContent = 'Add a stage name of at least two characters and a valid contact email.'; status.focus(); return; }
    pending = true;
    button.disabled = true;
    button.textContent = 'Sending application…';
    const body = {
      stage, email, kind: 'creator', adult: fields.adult.checked,
      state: fields.state.value, landingPath: form.dataset.landingPath,
      hours: Number(fields.hours.value), niche: 'Other',
      note: 'Experience: ' + fields.experience.selectedOptions[0].text + (fields.note.value.trim() ? '\n' + fields.note.value.trim() : ''),
      campaign
    };
    try {
      const res = await fetch('/api/apply', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let data; try { data = await res.json(); } catch { throw new Error('The server could not confirm the application. Please try again.'); }
      if (!res.ok) throw new Error(data && data.error && data.error.message || 'The application was not accepted. Please check your details and try again.');
      if (!data || data.ok !== true) throw new Error('The server could not confirm the application. Please try again.');
      form.reset();
      status.dataset.success = 'true';
      status.textContent = 'Application received. It is now in the x3STAR review queue. A submission does not guarantee acceptance or activate a partner account.';
      button.textContent = 'Application received';
      // Keep the button disabled after a confirmed submission to prevent accidental repeats.
      form.dataset.submitted = 'true';
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error instanceof TypeError ? 'Connection interrupted. Your application has not been confirmed. Please try again; an existing pending application will be detected.' : error.message;
      button.disabled = false;
      button.textContent = 'Submit application';
      pending = false;
    }
    status.focus();
  });
})();
