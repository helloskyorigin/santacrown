(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => document.querySelectorAll(selector);
  const { canonicalURL, parseUSD, usd, differenceCents, displayURL } = window.SantaCrownUtils;
  const sample = [
    { name: 'Snow King', url: 'snowking.example', amount: 25000, emoji: '⛄' },
    { name: 'Frost Elf', url: 'frostelf.example', amount: 18000, emoji: '🧝' },
    { name: 'Gift Boss', url: 'giftboss.example', amount: 12000, emoji: '🦌' },
    { name: 'Polar Trader', url: 'polartrader.example', amount: 11000, emoji: '🐻‍❄️' },
    { name: 'Ginger Gain', url: 'gingergain.example', amount: 9500, emoji: '🍪' },
    { name: 'NorthPole Hustle', url: 'northpole.example', amount: 8000, emoji: '🦌' },
    { name: 'Merry Marketer', url: 'merry.example', amount: 6500, emoji: '🐧' },
    { name: 'Holly Builder', url: 'holly.example', amount: 5000, emoji: '🧝' }
  ];
  const person = $('#person');
  const link = $('#url');
  const amount = $('#amount');
  const quote = $('#quote');
  const overlay = $('#overlay');
  const content = $('#dialog-content');
  const closeButton = $('#close-modal');
  let lastFocused = null;
  let noticeTimer = null;

  const element = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function showError(id, message) {
    const label = $('#' + id + '-error');
    const field = id === 'person' ? person : id === 'url' ? link : amount;
    label.textContent = message;
    field.setAttribute('aria-invalid', String(!!message));
  }
  function clearErrors() { ['person', 'url', 'amount'].forEach(id => showError(id, '')); }
  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('open');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => node.classList.remove('open'), 3500);
  }
  function goJoin() {
    $('#join').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    setTimeout(() => person.focus({ preventScroll: true }), 250);
  }
  $$('[data-join]').forEach(button => button.addEventListener('click', goJoin));
  if ('IntersectionObserver' in window) {
    const sticky = $('.mobile-join');
    let formVisible = false;
    function syncSticky(){sticky.classList.toggle('hidden', formVisible || !!document.querySelector('#entry-form:focus-within'))}
    $('#entry-form').addEventListener('focusin', syncSticky);
    $('#entry-form').addEventListener('focusout', () => requestAnimationFrame(syncSticky));
    new IntersectionObserver(entries => {
      formVisible = entries.some(entry => entry.isIntersecting);
      syncSticky();
    }, { threshold: .04 }).observe($('#join'));
  }

  // Never use example/demo data for a real payable-difference quote.
  function updateQuote() {
    const cents = parseUSD(amount.value);
    quote.textContent = cents === null
      ? '❄️ Enter an amount of at least $1.00 (up to two decimals).'
      : `🎁 Entry target: ${usd(cents)} · New listing: ${usd(cents)} · Existing links pay only the verified difference when checkout is live.`;
    $$('[data-amount]').forEach(button => button.classList.toggle('selected', parseUSD(button.dataset.amount) === cents));
  }
  $$('[data-amount]').forEach(button => button.addEventListener('click', () => {
    amount.value = button.dataset.amount;
    updateQuote();
    showError('amount', '');
  }));
  amount.addEventListener('input', () => { updateQuote(); showError('amount', ''); });
  link.addEventListener('input', () => showError('url', ''));
  person.addEventListener('input', () => showError('person', ''));

  // Only ranks 4+ go below the podium. All example links are deliberately inert.
  const board = $('#board-rows');
  sample.slice(3).forEach((entry, index) => {
    const row = element('div', undefined, 'board-row');
    row.append(element('span', '#' + (index + 4), 'r-num'));
    const who = element('div', undefined, 'r-person');
    who.append(element('span', entry.emoji, 'av'));
    const details = element('div', undefined, 'r-details');
    details.append(element('strong', entry.name), element('span', entry.url, 'r-mobile-link'));
    who.append(details);
    row.append(who, element('span', entry.url, 'r-url is-sample'), element('span', usd(entry.amount), 'r-amount'));
    board.append(row);
  });

  function showModal() {
    lastFocused = document.activeElement;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    closeButton.focus();
  }
  function hideModal() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocused?.isConnected) lastFocused.focus();
  }
  closeButton.addEventListener('click', hideModal);
  overlay.addEventListener('click', event => { if (event.target === overlay) hideModal(); });
  document.addEventListener('keydown', event => {
    if (!overlay.classList.contains('open')) return;
    if (event.key === 'Escape') { event.preventDefault(); hideModal(); }
    if (event.key === 'Tab') {
      const focusables = [...overlay.querySelectorAll('button:not([disabled]),a[href],input:not([disabled])')]
        .filter(el => el.getClientRects().length > 0);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  $('#entry-form').addEventListener('submit', event => {
    event.preventDefault();
    clearErrors();
    const name = person.value.trim();
    const url = canonicalURL(link.value);
    const cents = parseUSD(amount.value);
    let failed = null;
    if (name.length < 2 || name.length > 36 || /[\u0000-\u001f\u007f]/.test(name)) {
      showError('person', 'Use a Christmas name of 2–36 characters.'); failed ||= person;
    }
    if (!url) { showError('url', 'Enter a valid public website or social link.'); failed ||= link; }
    if (cents === null || differenceCents(cents, 0) === null) {
      showError('amount', 'Enter at least $1.00 with no more than two decimal places.'); failed ||= amount;
    }
    if (failed) { failed.focus(); return; }

    content.replaceChildren();
    const title = element('h2', '🎁 Your Christmas preview'); title.id = 'dialog-title';
    content.append(title, element('p', 'This is a private preview—not a public listing, actual leaderboard rank or payment.'));
    const card = element('div', undefined, 'profile-preview');
    card.append(element('strong', '🎅 ' + name));
    const a = element('a', displayURL(url)); a.href = url; a.rel = 'noopener noreferrer nofollow'; a.target = '_blank';
    card.append(a, element('b', usd(cents) + ' target'));
    content.append(card, element('p', 'Dodo checkout is intentionally disabled. No payment has been collected or ranking reserved. The approved live version will verify every payment on the server.'));
    const copy = element('button', 'Copy preview', 'modal-action');
    copy.addEventListener('click', async () => {
      const text = `🎅 My SantaCrown preview: ${name} · ${displayURL(url)} · ${usd(cents)}`;
      try { await navigator.clipboard.writeText(text); toast('Preview copied!'); }
      catch { toast('Clipboard unavailable. Use your device’s share menu.'); }
    });
    const close = element('button', 'Close', 'modal-action secondary'); close.addEventListener('click', hideModal);
    content.append(copy, close);
    showModal();
  });

  const legal = {
    rules: ['🎄 SantaCrown rules', 'This website is currently a design preview: no real payments, ranks, or prizes are active. The proposed live leaderboard will rank by verified cumulative payment for a normalized public URL. A public URL does not prove ownership, so profile changes and rewards will need separate verification. Reversed payments will be removed. A published tie-break rule, cutoff timezone, promotional terms, payout treatment, and complete refund policy are required before activation. No cash prizes, random winners, or lotteries are planned.'],
    privacy: ['🔐 Privacy preview', 'This preview validates the form in your browser. It does not submit names, links, or amounts to a backend, and nothing is saved on our servers. Google Fonts may receive ordinary browser connection data. Before live checkout, we will publish a policy describing how payment, listing, and support information is processed.'],
    refunds: ['↩️ Refund information', 'No checkout is active and no purchase is possible on this preview. Before activation, a real refund and dispute policy will be published. Payment processors may reverse disputed transactions; reversed sums cannot continue counting toward ranking.']
  };
  $$('[data-legal]').forEach(button => button.addEventListener('click', () => {
    const [heading, body] = legal[button.dataset.legal];
    content.replaceChildren();
    const title = element('h2', heading); title.id = 'dialog-title';
    content.append(title, element('p', body)); showModal();
  }));

  // Keep animation light on mobile, and off when motion reduction is requested.
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const flakes = $('#flakes');
    const total = window.matchMedia('(max-width: 720px)').matches ? 16 : 32;
    for (let i = 0; i < total; i++) {
      const flake = element('span', i % 4 ? '❄' : '✦', 'flake');
      flake.style.setProperty('--x', Math.round(Math.random() * 100) + '%');
      flake.style.setProperty('--size', (8 + Math.round(Math.random() * 10)) + 'px');
      flake.style.setProperty('--speed', (14 + Math.round(Math.random() * 17)) + 's');
      flake.style.setProperty('--delay', (-Math.round(Math.random() * 20)) + 's');
      flake.style.setProperty('--drift', (Math.round(Math.random() * 110) - 55) + 'px');
      flakes.append(flake);
    }
    document.addEventListener('visibilitychange', () => document.body.classList.toggle('snow-paused', document.hidden));
  }
  updateQuote();
})();
