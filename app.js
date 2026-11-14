/* SantaCrown v3: UI preview only. No client event or click creates a payable rank.
   In production, totals/ranks must always come from verified server-side payments. */
(() => {
  'use strict';
  const { canonicalURL, parseUSD, usd, differenceCents, displayURL } = window.SantaCrownUtils;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const demoEntries = Object.freeze([
    { name: 'Snow King', link: 'snowking.example', cents: 25000, emoji: '⛄' },
    { name: 'Frost Elf', link: 'frostelf.example', cents: 18000, emoji: '🧝' },
    { name: 'Gift Boss', link: 'giftboss.example', cents: 12000, emoji: '🦌' },
    { name: 'Polar Trader', link: 'polartrader.example', cents: 11000, emoji: '🐻‍❄️' },
    { name: 'Ginger Gain', link: 'gingergain.example', cents: 9500, emoji: '🍪' },
    { name: 'NorthPole Hustle', link: 'northpole.example', cents: 8000, emoji: '🦌' },
    { name: 'Merry Marketer', link: 'merry.example', cents: 6500, emoji: '🐧' },
    { name: 'Holly Builder', link: 'holly.example', cents: 5000, emoji: '🧝' }
  ]);
  const nameInput = $('#person');
  const linkInput = $('#url');
  const amountInput = $('#amount');
  const quote = $('#quote');
  const position = $('#preview-position');
  const preview = $('#preview-rank');
  const overlay = $('#overlay');
  const dialogContent = $('#dialog-content');
  const closeButton = $('#close-modal');
  let lastFocused = null;
  let toastTimer = null;
  let focusTimer = null;
  const node = (tag, text, klass) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (klass) el.className = klass;
    return el;
  };
  function rankFor(cents) {
    if (!Number.isSafeInteger(cents) || cents < 100) return null;
    // This is only a fictional, visitor-specific preview; tie-breaks are not promised.
    return demoEntries.filter(entry => entry.cents >= cents).length + 1;
  }
  function showError(key, message) {
    const input = key === 'person' ? nameInput : key === 'url' ? linkInput : amountInput;
    const error = $('#' + key + '-error');
    error.textContent = message;
    input.setAttribute('aria-invalid', String(Boolean(message)));
  }
  function clearErrors() { ['person', 'url', 'amount'].forEach(key => showError(key, '')); }
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('open'), 3300);
  }
  function goJoin(focusName = true) {
    const area = $('#join');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    area.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'center' });
    clearTimeout(focusTimer);
    if (focusName) focusTimer = setTimeout(() => nameInput.focus({ preventScroll: true }), reduce ? 0 : 430);
  }
  $$('[data-join]').forEach(btn => btn.addEventListener('click', () => goJoin()));

  // Hide the mobile CTA while the entry form is visible or in use.
  const mobileCTA = $('.mobile-join');
  let joinInView = false;
  function syncSticky() {
    mobileCTA.classList.toggle('hidden', joinInView || $('#join').contains(document.activeElement) || overlay.classList.contains('open'));
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      joinInView = entries.some(e => e.isIntersecting);
      syncSticky();
    }, { threshold: 0.12 }).observe($('#join'));
  }
  $('#entry-form').addEventListener('focusin', syncSticky);
  $('#entry-form').addEventListener('focusout', () => requestAnimationFrame(syncSticky));

  function updatePreview() {
    const cents = parseUSD(amountInput.value);
    const label = $('.preview-description strong');
    const helper = $('.preview-description span');
    const glyph = $('.preview-icon');
    if (cents === null) {
      label.textContent = 'Choose your spot';
      helper.textContent = 'Enter $1 or more to see a sample ranking.';
      glyph.textContent = '🎄';
      position.textContent = '—';
      quote.textContent = '🎁 Enter a target total to preview your spot.';
    } else {
      const rank = rankFor(cents);
      label.textContent = rank === 1 ? 'You would take the crown!' : rank <= 3 ? 'You would reach the podium!' : 'Your example leaderboard spot';
      helper.textContent = rank === 1 ? 'Ahead of the fictional Snow King.' : rank <= 3 ? 'A top-three position in the demo.' : `Beat fictional #3 with ${usd(12100)}.`;
      glyph.textContent = rank === 1 ? '👑' : rank <= 3 ? '🏅' : '🎄';
      position.textContent = '#' + rank;
      quote.textContent = `❄️ Demo target ${usd(cents)} · Only a preview, no charge or reserved rank.`;
    }
    $$('.quick-amounts button').forEach(btn => btn.classList.toggle('selected', parseUSD(btn.dataset.amount) === cents));
  }
  amountInput.addEventListener('input', () => { updatePreview(); showError('amount', ''); });
  linkInput.addEventListener('input', () => showError('url', ''));
  nameInput.addEventListener('input', () => showError('person', ''));
  $$('.quick-amounts button').forEach(btn => btn.addEventListener('click', () => {
    amountInput.value = btn.dataset.amount;
    updatePreview(); showError('amount', '');
  }));
  $$('[data-target]').forEach(btn => btn.addEventListener('click', () => {
    const targetCents = btn.dataset.target === 'gold' ? 25100 : 12100;
    amountInput.value = (targetCents / 100).toFixed(2).replace(/\.00$/, '');
    updatePreview();
    showError('amount', '');
    amountInput.focus({ preventScroll: true });
  }));
  $$('[data-challenge]').forEach(btn => btn.addEventListener('click', () => {
    amountInput.value = String(Number(btn.dataset.challenge) + 1);
    updatePreview(); showError('amount', '');
    goJoin(false);
    focusTimer = setTimeout(() => amountInput.focus({ preventScroll: true }), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 430);
  }));

  const board = $('#board-rows');
  demoEntries.slice(3).forEach((entry, index) => {
    const row = node('div', undefined, 'board-row');
    const rank = node('span', '#' + (index + 4), 'r-num');
    const who = node('div', undefined, 'r-person');
    const info = node('div', undefined, 'r-details');
    info.append(node('strong', entry.name), node('span', entry.link, 'r-mobile-link'));
    who.append(node('span', entry.emoji, 'av'), info);
    const link = node('span', entry.link, 'r-url'); // deliberate: fictional links are not clickable
    const amount = node('span', usd(entry.cents), 'r-amount');
    const beat = node('button', 'Beat this ↗', 'row-boost');
    beat.type = 'button';
    beat.setAttribute('aria-label', `Try a target higher than ${entry.name}'s fictional total ${usd(entry.cents)}`);
    beat.addEventListener('click', () => {
      amountInput.value = String(entry.cents / 100 + 1);
      updatePreview();
      goJoin(false);
      focusTimer = setTimeout(() => amountInput.focus({ preventScroll: true }), 420);
    });
    row.append(rank, who, link, amount, beat);
    board.append(row);
  });

  function showModal() {
    lastFocused = document.activeElement;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    closeButton.focus(); syncSticky();
  }
  function closeModal() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocused?.isConnected) lastFocused.focus();
    syncSticky();
  }
  closeButton.addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
    if (e.key !== 'Tab') return;
    const controls = $$(`#overlay button:not([disabled]), #overlay a[href], #overlay input:not([disabled])`)
      .filter(el => el.getClientRects().length > 0);
    if (!controls.length) return;
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  $('#entry-form').addEventListener('submit', e => {
    e.preventDefault();
    clearErrors();
    const name = nameInput.value.trim();
    const url = canonicalURL(linkInput.value);
    const cents = parseUSD(amountInput.value);
    let failed = null;
    if (name.length < 2 || name.length > 36 || /[\u0000-\u001f\u007f]/.test(name)) {
      showError('person', 'Use a Christmas name of 2–36 characters.'); failed ||= nameInput;
    }
    if (!url) { showError('url', 'Enter a valid public website or social link.'); failed ||= linkInput; }
    if (cents === null || differenceCents(cents, 0) === null) {
      showError('amount', 'Enter $1 or more, using at most two decimal places.'); failed ||= amountInput;
    }
    if (failed) { failed.focus(); return; }

    dialogContent.replaceChildren();
    const heading = node('h2', '🎅 Your Christmas preview'); heading.id = 'dialog-title';
    dialogContent.append(heading);
    dialogContent.append(node('p', 'Santa says hello! Here is your sample listing. Nothing is published, reserved or paid for.'));
    const card = node('div', undefined, 'profile-preview');
    card.append(node('strong', '👑 ' + name));
    const a = node('a', displayURL(url)); a.href = url; a.rel = 'noopener noreferrer nofollow'; a.target = '_blank';
    card.append(a, node('b', usd(cents) + ' target total'), node('div', 'Illustrative position #' + rankFor(cents), 'dialog-rank'));
    dialogContent.append(card);
    dialogContent.append(node('p', 'This is a design preview based on fictional rankings. Dodo checkout is not enabled; no money is collected.'));
    const copy = node('button', 'Copy my preview', 'modal-action');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      const text = `🎄 SantaCrown preview: ${name} · ${displayURL(url)} · ${usd(cents)} target · Illustrative rank #${rankFor(cents)}`;
      try { await navigator.clipboard.writeText(text); toast('Preview text copied 🎁'); }
      catch { toast('Clipboard unavailable on this device'); }
    });
    const close = node('button', 'Close', 'modal-action secondary'); close.type = 'button'; close.addEventListener('click', closeModal);
    dialogContent.append(copy, close);
    showModal();
  });
  const legal = {
    rules: ['🎄 SantaCrown preview rules', 'This is an interactive design preview. All public ranks and names are fictional. No payment processing, actual ranking, cash prizes, lottery or random rewards are live. The proposed model ranks verified cumulative contributions associated with a normalized public URL. A public URL alone does not prove account ownership; profile changes and final honors would require separate verification. Actual ranking rules, cutoff time, tie-breaking and cancellation treatment must be published before launch.'],
    privacy: ['🔐 Privacy in this preview', 'Name, website URL and target amount are processed only in your browser and are not sent to the SantaCrown server or saved. Google Fonts may load and collect ordinary connection information. A complete privacy notice is required before real purchases or account data collection begin.'],
    refunds: ['↩️ Refund status', 'No payments are enabled in this preview. Therefore no purchases or refunds can take place. A proper refunds and disputes policy is required before payment checkout is activated.']
  };
  $$('[data-legal]').forEach(btn => btn.addEventListener('click', () => {
    const [title, text] = legal[btn.dataset.legal];
    dialogContent.replaceChildren();
    const h = node('h2', title); h.id = 'dialog-title';
    dialogContent.append(h, node('p', text));
    showModal();
  }));

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const flakes = $('#flakes');
    const total = window.matchMedia('(max-width: 650px)').matches ? 24 : 52;
    for (let i = 0; i < total; i++) {
      const flake = node('span', i % 4 === 0 ? '✧' : '❄', 'flake');
      flake.style.setProperty('--x', Math.round(Math.random() * 100) + '%');
      flake.style.setProperty('--size', (8 + Math.round(Math.random() * 13)) + 'px');
      flake.style.setProperty('--speed', (12 + Math.round(Math.random() * 19)) + 's');
      flake.style.setProperty('--delay', (-Math.round(Math.random() * 29)) + 's');
      flake.style.setProperty('--drift', (Math.round(Math.random() * 140) - 70) + 'px');
      flakes.append(flake);
    }
    document.addEventListener('visibilitychange', () => document.body.classList.toggle('snow-paused', document.hidden));
  }
  updatePreview();
})();
