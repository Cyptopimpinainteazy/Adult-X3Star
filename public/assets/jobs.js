/* Public star jobs boards. The server owns listings and private inquiries. */
(function (root) {
  'use strict';
  const mounts = new WeakMap();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const modes = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On site' };
  const date = value => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  function cancel(container) { mounts.delete(container); if (container && container.classList) container.classList.remove('star-jobs'); }
  function mount(container, { creatorId, jobs, source = 'star', listingId } = {}) {
    if (!container) return Promise.resolve();
    cancel(container);
    const employer = source === 'employer';
    const state = { creatorId: String(creatorId || ''), source, listingId };
    const listingKey = String(listingId || '');
    mounts.set(container, state);
    container.classList.add('star-jobs');
    const current = () => mounts.get(container) === state && container.isConnected;
    const offline = root.X3STAR && !(root.X3STAR_BOOT && root.X3STAR_BOOT.api);
    if (offline || !root.X3API) {
      container.innerHTML = '<p class="jobs-note">Jobs boards and private inquiries are available on the connected x3STAR site. This standalone preview does not contain published listings.</p>';
      return Promise.resolve();
    }
    if (employer ? !/^[1-9][0-9]*$/.test(listingKey) || !Number.isSafeInteger(Number(listingKey)) : !/^[a-z0-9][a-z0-9-]{0,79}$/.test(state.creatorId)) return Promise.resolve();
    container.querySelectorAll('.jobs-load-error').forEach(node => node.remove());
    const initial = container.innerHTML;

    function status(slot, text, error = false) {
      const node = slot.querySelector('[data-jobs-status]');
      if (!node) return;
      node.textContent = text;
      node.className = error ? 'jobs-note jobs-error' : 'jobs-note jobs-success';
      node.focus();
    }
    function inquiry(slot, job, person, draft = {}) {
      if (!current() || !slot.isConnected) return;
      if (!employer && person.creatorId === state.creatorId) { slot.innerHTML = '<p class="jobs-note">This is your listing. Manage it and review inquiries in <a href="/studio#jobs">Creator Studio</a>.</p>'; return; }
      slot.innerHTML = `<form class="jobs-form" data-inquiry><h4>${job.kind === 'available' ? 'Ask about working together' : 'Apply or discuss the opening'}</h4><p class="jobs-note">Your account name and contact email will be shared privately with ${employer ? 'this employer' : 'this star'} and platform administrators, along with this message. Do not send ID documents, financial details or a home address.</p><p class="jobs-note">Sending as <strong>${esc(person.name)}</strong> · ${esc(person.email)}</p><label class="jobs-field">Your message<textarea name="message" minlength="10" maxlength="2000" rows="4" required>${esc(draft.message || '')}</textarea></label><label class="jobs-field">Portfolio link <span class="jobs-note">Optional; HTTPS only.</span><input name="portfolioUrl" type="url" maxlength="500" placeholder="https://…" value="${esc(draft.portfolioUrl || '')}"></label><button class="jobs-button" type="submit">Send private inquiry</button><p class="jobs-note" data-jobs-status role="status" aria-live="polite" tabindex="-1"></p></form>`;
      const form = slot.querySelector('form'), button = form.querySelector('button');
      let pending = false;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (pending || !current() || !form.reportValidity()) return;
        const payload = { message: form.elements.message.value.trim(), portfolioUrl: form.elements.portfolioUrl.value.trim() };
        if (payload.message.length < 10) return status(slot, 'Write a message of at least 10 characters.', true);
        if (payload.portfolioUrl) {
          try {
            const url = new URL(payload.portfolioUrl);
            if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
          } catch { return status(slot, 'Use an HTTPS portfolio link without a username or password.', true); }
        }
        pending = true; button.disabled = true; button.textContent = 'Sending…';
        try {
          const response = await root.X3API.post((employer ? '/api/directory/jobs/' : '/api/jobs/') + encodeURIComponent(job.id) + '/inquiries', payload);
          if (!response || response.ok !== true) throw new Error('The server did not confirm your inquiry. Please try again.');
          if (!current() || !slot.isConnected || !form.isConnected) return;
          status(slot, employer ? 'Inquiry received. The employer can review it privately in their portal. This is not an acceptance or hiring confirmation.' : 'Inquiry received. The star can review it privately in Creator Studio. This is not an acceptance or booking confirmation.');
          button.textContent = 'Inquiry sent';
        } catch (error) {
          if (!current() || !slot.isConnected || !form.isConnected) return;
          if (error.status === 401) return login(slot, job, payload, 'Your session ended. Sign in again to send this inquiry.');
          if (error.status === 409 && ['already_inquired', 'listing_closed'].includes(error.code)) {
            status(slot, error.message || 'This listing cannot receive another inquiry.', true);
            button.textContent = error.code === 'already_inquired' ? 'Inquiry already recorded' : 'Listing closed';
          } else {
            status(slot, error.message || 'The inquiry was not confirmed. Please try again.', true);
            pending = false; button.disabled = false; button.textContent = 'Send private inquiry';
          }
        }
      });
    }
    function login(slot, job, draft = {}, reason = '') {
      if (!current() || !slot.isConnected) return;
      slot.innerHTML = `<form class="jobs-form jobs-login"><h4>Sign in to send a private inquiry</h4>${reason ? `<p class="jobs-note">${esc(reason)}</p>` : ''}<label class="jobs-field">Email<input name="email" type="email" autocomplete="email" maxlength="160" required></label><label class="jobs-field">Password<input name="password" type="password" autocomplete="current-password" required></label><button class="jobs-button" type="submit">Sign in</button><p class="jobs-note">Need an account? <a href="/#account" target="_blank" rel="noopener">Open x3STAR account setup in a new tab</a>, then return here. Account name and contact email accompany your private inquiry.</p><p data-jobs-status class="jobs-note" role="status" aria-live="polite" tabindex="-1"></p></form>`;
      const form = slot.querySelector('form'), button = form.querySelector('button');
      let pending = false;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (pending || !current() || !form.reportValidity()) return;
        pending = true; button.disabled = true; button.textContent = 'Signing in…';
        try {
          await root.X3API.post('/api/auth/login', { email: form.elements.email.value.trim(), password: form.elements.password.value });
          form.elements.password.value = '';
          const response = await root.X3API.get('/api/me');
          if (!response || !response.user) throw new Error('Sign-in was not confirmed. Please try again.');
          if (root.dispatchEvent && typeof CustomEvent === 'function') root.dispatchEvent(new CustomEvent('x3star:session-changed', { detail: { user: response.user } }));
          if (!current() || !slot.isConnected || !form.isConnected) return;
          inquiry(slot, job, response.user, draft);
        } catch (error) {
          if (!current() || !slot.isConnected || !form.isConnected) return;
          form.elements.password.value = '';
          status(slot, error.message || 'Could not sign in. Please try again.', true);
          pending = false; button.disabled = false; button.textContent = 'Sign in';
        }
      });
    }
    function render(list) {
      if (!current()) return;
      if (!Array.isArray(list)) throw new Error('The jobs board could not be loaded.');
      container.innerHTML = `<div class="jobs-heading"><div><h3>Jobs &amp; opportunities</h3><p class="jobs-note">${employer ? esc(list[0] && list[0].companyName || 'Employer opening') : 'Team openings, collaborations and work offered by this star.'}</p></div><a class="jobs-board-link" href="${employer ? '/jobs/' + encodeURIComponent(listingKey) : '/stars/' + encodeURIComponent(state.creatorId) + '/jobs'}">Shareable board ↗</a></div>${list.length ? `<div class="jobs-list">${list.map(job => `<article class="star-job" id="job-${Number(job.id)}">${employer && job.test ? '<span class="directory-test">TEST LISTING · no real charge</span>' : ''}<span class="jobs-kind">${job.kind === 'available' ? 'Available for work' : 'Hiring / collaboration'}</span><h4>${esc(job.title)}</h4><p class="jobs-meta">${esc(job.category)} · ${esc(modes[job.workMode] || job.workMode)}${job.location ? ' · ' + esc(job.location) : ''}</p><p class="jobs-description">${esc(job.description)}</p><p class="jobs-meta"><strong>Compensation:</strong> ${esc(job.compensation)}</p><p class="jobs-note">Open until ${esc(date(job.expiresAt))}</p><button class="jobs-button" type="button" data-job-inquire="${Number(job.id)}">${job.kind === 'available' ? 'Request work' : 'Apply / collaborate'}</button><div class="jobs-response"></div></article>`).join('')}</div>` : '<p class="jobs-empty">No open listings from this star right now. Check back for team openings, collaborations or work they offer.</p>'}`;
      container.querySelectorAll('[data-job-inquire]').forEach(button => {
        let pending = false;
        button.addEventListener('click', async () => {
          if (pending || !current()) return;
          const job = list.find(item => String(item.id) === button.dataset.jobInquire);
          if (!job) return;
          const slot = button.parentElement.querySelector('.jobs-response');
          pending = true; button.disabled = true;
          try {
            const response = await root.X3API.get('/api/me');
            if (!current() || !slot.isConnected) return;
            if (response && response.user) inquiry(slot, job, response.user);
            else login(slot, job);
            const input = slot.querySelector('input,textarea'); if (input) input.focus();
          } catch (error) {
            if (!current() || !slot.isConnected) return;
            slot.innerHTML = '<p data-jobs-status class="jobs-note" role="status" tabindex="-1"></p>';
            status(slot, error.message || 'Could not load your account. Please try again.', true);
          } finally { pending = false; if (current()) button.disabled = !!slot.querySelector('form'); }
        });
      });
    }
    if (Array.isArray(jobs)) { render(jobs); return Promise.resolve(); }
    if (!initial.trim()) container.innerHTML = '<p class="jobs-note" role="status">Loading jobs board…</p>';
    return root.X3API.get(employer ? '/api/directory/jobs/' + encodeURIComponent(listingKey) : '/api/creators/' + encodeURIComponent(state.creatorId) + '/jobs').then(response => {
      if (current()) render(employer ? response && response.job ? [response.job] : null : response && response.jobs);
    }).catch(error => {
      if (!current()) return;
      container.innerHTML = initial;
      const note = document.createElement('div');
      note.className = 'jobs-load-error';
      note.innerHTML = `<p class="jobs-note jobs-error" role="status">${esc(error.message || 'The latest jobs board could not be loaded. Existing listing details remain visible.')}</p><button class="jobs-button" type="button">Try again</button>`;
      container.appendChild(note);
      note.querySelector('button').addEventListener('click', () => mount(container, { creatorId: state.creatorId, source: state.source, listingId: state.listingId }));
    });
  }
  root.X3Jobs = { mount, cancel };
  function ready() {
    document.querySelectorAll('[data-creator-jobs]').forEach(container => mount(container, { creatorId: container.dataset.creatorJobs }));
    document.querySelectorAll('[data-directory-job]').forEach(container => mount(container, { source: 'employer', listingId: container.dataset.directoryJob }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
})(window);
