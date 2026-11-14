/* SantaCrown: the public interface never invents participants or paid amounts.
 * Ledger totals must come only from trusted server-side payment verification. */
(() => {
  'use strict';
  const { canonicalURL, parseUSD, usd, displayURL, differenceCents } = window.SantaCrownUtils;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const nameInput = $('#person');
  const urlInput = $('#profile-link');
  const amountInput = $('#amount');
  const quote = $('#price-estimate');
  const projected = $('#projected-rank');
  const dialog = $('#dialog-backdrop');
  const dialogContent = $('#dialog-content');
  let entries = [];
  let paymentsEnabled = false;
  let focusedBeforeDialog = null;
  let toastTimer;

  const element = (tag, content, className) => {
    const el = document.createElement(tag);
    if (content !== undefined) el.textContent = content;
    if (className) el.className = className;
    return el;
  };
  function safeExternalLink(url, label, className) {
    const a = element('a', label, className);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer nofollow ugc';
    return a;
  }
  function setError(field, text) {
    const id = field === 'person' ? '#person' : field === 'profile-link' ? '#profile-link' : '#amount';
    const input = $(id);
    $('#' + field + '-error').textContent = text;
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function toast(text) {
    const bar = $('#toast');
    bar.textContent = text;
    bar.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => bar.classList.remove('show'), 3300);
  }
  function goJoin() {
    $('#join').scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    window.setTimeout(() => nameInput.focus({ preventScroll: true }), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450);
  }
  $$('[data-join]').forEach(button => button.addEventListener('click', goJoin));
  const sticky = $('.sticky-join');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(states => sticky.classList.toggle('hidden', states.some(s => s.isIntersecting)), { threshold: 0.1 });
    observer.observe($('#join'));
  }
  function currentListing() {
    const normalized = canonicalURL(urlInput.value);
    return normalized ? entries.find(e => e.link === normalized) : undefined;
  }
  function projection(cents, existing) {
    if (cents === null) return null;
    const rest = entries.filter(e => e.link !== existing?.link);
    return 1 + rest.filter(e => e.total_cents >= cents).length;
  }
  function updateEstimate() {
    const cents = parseUSD(amountInput.value);
    const listing = currentListing();
    const existing = listing?.total_cents || 0;
    if (cents === null) {
      quote.textContent = '🎁 Enter a valid amount of at least $1.';
      projected.replaceChildren(element('span', '❄️'), element('span', 'Your future position will appear here.'));
    } else {
      const payable = differenceCents(cents, existing);
      if (listing) {
        quote.textContent = payable === null
          ? `🎄 Current ${usd(existing)} · Increase your target by $1+.`
          : `🎄 Payable increase ${usd(payable)} · Projected #${projection(cents, listing)}`;
      } else {
        quote.textContent = `🎄 Target ${usd(cents)} · Projected position #${projection(cents, listing)}`;
      }
      const rank = projection(cents, listing);
      const display = element('span');
      display.append('Projected position: ', element('strong', '#' + rank));
      projected.replaceChildren(element('span', rank === 1 ? '👑' : '❄️'), display);
    }
    $$('.quick-amounts button').forEach(button => button.setAttribute('aria-pressed', String(parseUSD(button.dataset.amount) === cents)));
  }
  amountInput.addEventListener('input', () => { setError('amount', ''); updateEstimate(); });
  nameInput.addEventListener('input', () => setError('person', ''));
  urlInput.addEventListener('input', () => { setError('profile-link', ''); updateEstimate(); });
  $$('.quick-amounts button').forEach(button => button.addEventListener('click', () => {
    amountInput.value = button.dataset.amount;
    updateEstimate();
  }));
  function openDialog() {
    focusedBeforeDialog = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('modal-open');
    $('#close-dialog').focus();
  }
  function closeDialog() {
    dialog.hidden = true;
    document.body.classList.remove('modal-open');
    if (focusedBeforeDialog?.isConnected) focusedBeforeDialog.focus();
  }
  $('#close-dialog').addEventListener('click', closeDialog);
  dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
  document.addEventListener('keydown', e => {
    if (dialog.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); return; }
    if (e.key !== 'Tab') return;
    const focusables = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')].filter(el => el.getClientRects().length);
    if (!focusables.length) return;
    if (e.shiftKey && document.activeElement === focusables[0]) { e.preventDefault(); focusables.at(-1).focus(); }
    else if (!e.shiftKey && document.activeElement === focusables.at(-1)) { e.preventDefault(); focusables[0].focus(); }
  });
  function generateCard(name, link, cents, rank) {
    const escape = t => String(t).replace(/[&<>"']/g, x => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' }[x]));
    // SVG text values are escaped; this is a personalized, non-payment Christmas greeting card.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#092348"/><stop offset=".6" stop-color="#175593"/><stop offset="1" stop-color="#5aa0ca"/></linearGradient></defs><rect width="1200" height="630" fill="url(#b)"/><circle cx="995" cy="122" r="85" fill="#ffebaa" opacity=".85"/><text x="80" y="104" font-size="56" fill="#ffe2a0" font-family="Georgia" font-weight="bold">👑 SantaCrown</text><text x="80" y="215" font-size="62" fill="white" font-family="Georgia" font-weight="bold">My Christmas Crown Preview</text><text x="80" y="316" font-size="55" fill="#ffcf66" font-family="Georgia" font-weight="bold">${escape(name.slice(0,36))}</text><text x="80" y="390" font-size="29" fill="#dff3ff" font-family="Arial">${escape(displayURL(link).slice(0,60))}</text><text x="80" y="467" font-size="32" fill="white" font-family="Arial">Target ${escape(usd(cents))}  •  Projected #${rank}</text><text x="80" y="559" font-size="23" fill="#ffe7ba" font-family="Arial">Preview only · no payment, public rank or reservation</text><text x="988" y="501" font-size="105">🎅</text></svg>`;
    const blob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'santacrown-christmas-preview.svg';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  $('#join-form').addEventListener('submit', e => {
    e.preventDefault();
    ['person','profile-link','amount'].forEach(k => setError(k, ''));
    const name = nameInput.value.trim();
    const link = canonicalURL(urlInput.value);
    const cents = parseUSD(amountInput.value);
    let firstInvalid = null;
    if (name.length < 2 || name.length > 36 || /[\x00-\x1f\x7f]/.test(name)) {
      setError('person', 'Enter a name between 2 and 36 characters.'); firstInvalid ||= nameInput;
    }
    if (!link) { setError('profile-link', 'Enter a valid public website or social link.'); firstInvalid ||= urlInput; }
    if (cents === null) { setError('amount', 'Enter at least $1, with no more than two decimal places.'); firstInvalid ||= amountInput; }
    const listing = currentListing();
    if (cents !== null && listing && differenceCents(cents, listing.total_cents) === null) {
      setError('amount', 'Increase the current listing total by at least $1.'); firstInvalid ||= amountInput;
    }
    if (firstInvalid) { firstInvalid.focus(); return; }
    const rank = projection(cents, listing);
    dialogContent.replaceChildren();
    const header = element('h2', '🎄 Your Christmas entry preview'); header.id = 'dialog-title';
    dialogContent.append(header, element('p', 'Here is how your Christmas card can look. This does not create a public entry or charge you.'));
    const card = element('div', undefined, 'preview-card');
    card.append(element('strong', '👑 ' + name), safeExternalLink(link, displayURL(link), 'preview-link'), element('div', usd(cents) + ' target · Projected #' + rank, 'preview-amount'));
    dialogContent.append(card, element('p', 'Payment collection has not opened. Rankings will only update after verified payments when the service is approved and launched.'));
    const actions = element('div', undefined, 'modal-actions');
    const download = element('button', '🎁 Download Christmas Card');
    download.type = 'button';
    download.addEventListener('click', () => generateCard(name, link, cents, rank));
    const close = element('button', 'Close', 'secondary');
    close.type = 'button'; close.addEventListener('click', closeDialog);
    actions.append(download, close); dialogContent.append(actions);
    openDialog();
  });
  function insertRank(slot, entry) {
    const card = $(`.podium-card[data-pos="${slot}"]`);
    const title = card.querySelector('.slot-name');
    const url = card.querySelector('.slot-url');
    const amount = card.querySelector('.slot-amount');
    title.textContent = entry.name;
    url.replaceChildren(safeExternalLink(entry.link, displayURL(entry.link)));
    amount.textContent = usd(entry.total_cents);
  }
  function renderLeaderboard() {
    const list = $('#leaderboard-list');
    if (!entries.length) {
      const empty = element('div', undefined, 'empty-board');
      const icon = element('span', '🎁'); icon.setAttribute('aria-hidden', 'true');
      empty.append(icon, element('strong', "The first gift hasn't arrived yet!"), element('p', 'When payments are enabled and verified, real participants will appear here. No invented names, totals or rankings.'));
      list.replaceChildren(empty);
      const originals = [
        {name: "Santa's Throne", link: 'Your name could be here', portrait: '🎅'},
        {name: 'Silver Star', link: 'Awaiting a legend', portrait: '❄️'},
        {name: 'Bronze Bells', link: 'Awaiting a legend', portrait: '🦌'}
      ];
      originals.forEach((item, i) => {
        const card = $(`.podium-card[data-pos="${i+1}"]`);
        card.querySelector('.slot-name').textContent = item.name;
        card.querySelector('.slot-url').textContent = item.link;
        card.querySelector('.slot-amount').textContent = '—';
        card.querySelector('.portrait').textContent = item.portrait;
      });
      $('#board-indicator').textContent = 'No paid entries';
      $('#board-status').textContent = "❄️ Santa's throne is waiting for its first legend";
      return;
    }
    list.replaceChildren();
    const ranked = entries.slice(0, 100);
    ranked.forEach((entry, i) => {
      const row = element('div', undefined, 'board-row');
      row.append(element('span', '#' + (i + 1), 'rank-num'), element('div', entry.name, 'leader-name'), safeExternalLink(entry.link, displayURL(entry.link), 'leader-url'), element('span', usd(entry.total_cents), 'leader-total'));
      list.append(row);
    });
    entries.slice(0,3).forEach((entry,i)=>insertRank(i+1,entry));
    $('#board-indicator').textContent = entries.length + (entries.length === 1 ? ' verified entry' : ' verified entries');
    $('#board-status').textContent = '👑 Current throne holder: ' + entries[0].name;
  }
  async function fetchLeaderboard() {
    try {
      const r = await fetch('/api/leaderboard', {headers: {'Accept':'application/json'}, cache:'no-store'});
      if (!r.ok) throw new Error('Leaderboard is unavailable');
      const data = await r.json();
      if (!Array.isArray(data.entries)) throw new Error('Unexpected response');
      entries = data.entries.filter(e => typeof e.name === 'string' && typeof e.link === 'string' && Number.isSafeInteger(e.total_cents) && e.total_cents >= 100 && canonicalURL(e.link) === e.link).sort((a,b) => b.total_cents-a.total_cents);
      paymentsEnabled = Boolean(data.paymentsEnabled);
      renderLeaderboard();
      updateEstimate();
      // Payment will remain disabled until full merchant acceptance, secure checkout and webhook are operational.
    } catch (error) {
      console.info('SantaCrown leaderboard is not configured; no fictional entries are displayed.');
    }
  }
  const snow = $('#snowfall');
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const total = window.matchMedia('(max-width: 680px)').matches ? 20 : 46;
    for (let i=0;i<total;i++) {
      const flake = element('span', i%5===0 ? '✧' : '❄', 'flake');
      flake.style.setProperty('--x', (Math.random()*100).toFixed(2)+'%');
      flake.style.setProperty('--size', (8+Math.random()*10).toFixed(1)+'px');
      flake.style.setProperty('--duration', (12+Math.random()*17).toFixed(1)+'s');
      flake.style.setProperty('--delay', (-Math.random()*23).toFixed(1)+'s');
      flake.style.setProperty('--drift', ((Math.random()-.5)*130).toFixed(0)+'px');
      snow.append(flake);
    }
    document.addEventListener('visibilitychange',()=>document.body.classList.toggle('snow-paused',document.hidden));
  }
  updateEstimate();
  fetchLeaderboard();
  if (location.protocol !== 'file:') window.setInterval(fetchLeaderboard, 60000);
})();
