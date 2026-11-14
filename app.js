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
  let boardView = 'ten';
  let paymentsEnabled = false;
  let boardAvailable = false;
  let checkoutBusy = false;
  let knownEntry = null;
  let lookupTimer = null;
  let lookupVersion = 0;
  const formSubmit = document.querySelector('.form-submit');
  let focusedBeforeDialog = null;
  let toastTimer;
  let leaderboardSignature = '';
  let lastVerifiedAt = 0;
  let pollTimer = null;
  let activeRequest = null;
  let consecutiveErrors = 0;
  const refreshButton = $('#refresh-board');
  const boardSearch = $('#leader-search');
  const resultCount = $('#board-result-count');
  const refreshLabel = $('#board-updated');
  const challenges = $('#rank-challenges');
  const consentWrap = $('#checkout-consent');
  const consentInput = $('#consent');
  const timeLabel = time => new Date(time).toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' });

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
    return normalized ? (entries.find(e => e.link === normalized) || (knownEntry?.link === normalized ? knownEntry : undefined)) : undefined;
  }
  function projection(cents, existing) {
    if (cents === null) return null;
    const rest = entries.filter(e => e.link !== existing?.link);
    // Existing ties are ordered by first-payment timestamp, so only count
    // a same-total competitor if it ranks before this existing entry.
    return 1 + rest.filter(e => e.total_cents > cents ||
      (e.total_cents === cents && (!existing || !Number.isSafeInteger(existing.rank) || e.rank < existing.rank))).length;
  }
  function updateEstimate() {
    const cents = parseUSD(amountInput.value);
    const listing = currentListing();
    const existing = listing?.total_cents || 0;
    if (!boardAvailable) {
      quote.textContent = '🎁 Payment and ranking quotes are unavailable until the verified leaderboard reconnects.';
      const message = cents === null ? 'Enter a valid target amount.' : 'Reliable rank estimates open when the verified leaderboard is connected.';
      projected.replaceChildren(element('span','❄️'),element('span',message));
    } else if (cents === null) {
      quote.textContent = '🎁 Enter a valid amount of at least $1.';
      projected.replaceChildren(element('span', '❄️'), element('span', 'Your future position will appear here.'));
    } else {
      const payable = differenceCents(cents, existing);
      if (listing) {
        quote.textContent = payable === null
          ? `🎄 Current ${usd(existing)} · Increase your target by $1+.`
          : `🎄 Current ${usd(existing)} · Pay ${usd(payable)} extra · ${listing.name} keeps the display name`;
      } else {
        quote.textContent = `🎄 Amount to pay ${usd(cents)} · Ranking is based on verified totals`;
      }
      const rank = projection(cents, listing);
      const display = element('span');
      display.append('Estimated position: ', element('strong', rank > 100 ? 'outside top 100' : '#' + rank));
      projected.replaceChildren(element('span', rank === 1 ? '👑' : '❄️'), display);
    }
    $$('.quick-amounts button').forEach(button => button.setAttribute('aria-pressed', String(parseUSD(button.dataset.amount) === cents)));
  }
  function updateIdentityPreview() {
    const name = nameInput.value.trim().slice(0,36);
    const link = canonicalURL(urlInput.value);
    $('#join-name-preview').textContent = name || 'Your Christmas name';
    $('#join-link-preview').textContent = link ? '↗ ' + displayURL(link) : 'Your link will appear here ↗';
    $('#join-link-preview').title = link || '';
  }
  amountInput.addEventListener('input', () => { setError('amount', ''); updateEstimate(); });
  nameInput.addEventListener('input', () => { setError('person', ''); updateIdentityPreview(); });
  urlInput.addEventListener('input', () => {
    setError('profile-link', '');
    knownEntry = null;
    updateIdentityPreview();
    updateEstimate();
    window.clearTimeout(lookupTimer);
    const checked = canonicalURL(urlInput.value);
    const version = ++lookupVersion;
    if (!checked || !boardAvailable) return;
    lookupTimer = window.setTimeout(async () => {
      try {
        const r = await fetch('/api/listing?link='+encodeURIComponent(checked),{cache:'no-store'});
        if (!r.ok) return;
        const data = await r.json();
        if(version !== lookupVersion || canonicalURL(urlInput.value) !== checked)return;
        knownEntry = data.entry || null;
        updateEstimate();
      } catch { /* Always compute the final payable amount on the server. */ }
    }, 350);
  });
  $$('.quick-amounts button').forEach(button => button.addEventListener('click', () => {
    amountInput.value = button.dataset.amount;
    updateEstimate();
  }));
  function updateChallenges() {
    challenges.hidden = !boardAvailable || entries.length === 0;
    $('#challenge-third').disabled = entries.length < 3;
    $('#challenge-first').disabled = entries.length < 1;
  }
  function chooseChallenge(position) {
    if (!boardAvailable || entries.length < position) return;
    // A target must exceed the current verified rival's balance by $1.
    const target = entries[position - 1].total_cents + 100;
    if (!Number.isSafeInteger(target)) return;
    amountInput.value = (target / 100).toFixed(2);
    updateEstimate();
    goJoin();
  }
  $('#challenge-third').addEventListener('click', () => chooseChallenge(3));
  $('#challenge-first').addEventListener('click', () => chooseChallenge(1));
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
  $('#join-form').addEventListener('submit', async e => {
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
    if (paymentsEnabled && boardAvailable && !consentInput.checked) {
      toast('Please read and accept the Terms and Refund Policy before checkout.');
      consentInput.focus(); return;
    }
    if (paymentsEnabled && boardAvailable) {
      if (checkoutBusy) return;
      checkoutBusy = true;
      formSubmit.disabled = true;
      formSubmit.textContent = '❄️ Preparing secure checkout…';
      try {
        const response = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name, link, target_amount: amountInput.value.trim(), terms_accepted: consentInput.checked })
        });
        const data = await response.json();
        if (!response.ok || !data.checkoutUrl) {
          if (response.status === 409) {
            await fetchLeaderboard();
            setError('amount', 'Another payment changed the total. Pick a new target.');
          }
          throw new Error(data.message || 'Checkout is not available. No payment has been initiated.');
        }
        const expectedDue = differenceCents(cents, listing?.total_cents || 0);
        if (expectedDue !== data.chargeCents) {
          await fetchLeaderboard();
          setError('amount', 'The balance changed while you were joining. Check the updated amount and try again.');
          return;
        }
        const destination = new URL(data.checkoutUrl);
        if (destination.protocol !== 'https:' ||
            !destination.hostname.endsWith('.dodopayments.com')) throw Error('Unexpected checkout destination');
        window.location.assign(destination.toString());
      } catch (error) {
        toast(error.message || 'Secure checkout could not open.');
      } finally {
        checkoutBusy = false;
        formSubmit.disabled = false;
        updateCheckoutUI();
      }
      return;
    }
    const rank = boardAvailable ? projection(cents, listing) : null;
    dialogContent.replaceChildren();
    const header = element('h2', '🎄 Your Christmas entry preview'); header.id = 'dialog-title';
    dialogContent.append(header, element('p', 'Here is how your Christmas card can look. This does not create a public entry or charge you.'));
    const card = element('div', undefined, 'preview-card');
    card.append(element('strong', '👑 ' + name), safeExternalLink(link, displayURL(link), 'preview-link'), element('div', usd(cents) + ' target' + (rank ? ' · Estimated #' + rank : ' · No live rank yet'), 'preview-amount'));
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
  function updateCheckoutUI() {
    if (checkoutBusy) return;
    formSubmit.replaceChildren(document.createTextNode(
      paymentsEnabled && boardAvailable ? '🎁 Continue to Secure Payment →' : '🎅 Preview My Christmas Entry →'
    ));
    consentWrap.hidden = !(paymentsEnabled && boardAvailable);
    if (consentWrap.hidden) consentInput.checked = false;
    const label = $('#checkout-state');
    label.textContent = paymentsEnabled && boardAvailable
      ? 'Your exact payable amount is confirmed server-side. Only verified payments change rankings.'
      : 'Payments are not open. Preview is free and does not reserve a rank.';
    $$('[data-join]').forEach(b => {
      if (b.classList.contains('sticky-join'))
        b.textContent = paymentsEnabled && boardAvailable ? '🎁 Join SantaCrown' : '🎁 Preview Your Christmas Entry';
    });
  }
  function setTargetToPass(entry) {
    if (!entry || !Number.isSafeInteger(entry.total_cents)) return;
    const higher = entry.total_cents + 100;
    if (!Number.isSafeInteger(higher)) return;
    amountInput.value = (higher / 100).toFixed(2);
    updateEstimate();
    goJoin();
    toast(`🎁 Target set to beat #${entry.rank}. Enter your own link to see your exact payable amount.`);
  }
  boardSearch.addEventListener('input', renderLeaderboardRows);
  $('#show-ten').addEventListener('click', () => { boardView='ten'; renderLeaderboardRows(); });
  $('#show-all').addEventListener('click', () => { boardView='all'; renderLeaderboardRows(); });
  function updateBoardTabs() {
    for (const [key, button] of [['ten',$('#show-ten')],['all',$('#show-all')]]) {
      const active = boardView === key;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }
  function renderLeaderboardRows() {
    updateBoardTabs();
    const list = $('#leaderboard-list');
    const term = boardSearch.value.trim().toLowerCase();
    if (!entries.length) {
      resultCount.textContent = '';
      const empty = element('div', undefined, 'empty-board');
      const icon = element('span','🎁'); icon.setAttribute('aria-hidden','true');
      empty.append(icon, element('strong',"Santa’s list is waiting for its first legend"),
        element('p','When verified payments open, real names, clickable links and totals appear here. No made-up contestants.'));
      const action = element('button','🎄 Preview your Christmas entry →','empty-action');
      action.type='button'; action.addEventListener('click',goJoin); empty.append(action);
      list.replaceChildren(empty);
      return;
    }
    const subset = term ? entries.slice(0,100).filter(e =>
      e.name.toLowerCase().includes(term) || displayURL(e.link).toLowerCase().includes(term))
      : entries.slice(0,boardView === 'ten' ? 10 : 100);
    list.replaceChildren();
    resultCount.textContent = term
      ? `Showing ${subset.length} matching ${subset.length === 1 ? 'entry' : 'entries'} from the latest top ${entries.length} loaded.`
      : `Showing ${subset.length} of ${entries.length} verified ${entries.length === 1 ? 'entry' : 'entries'}.`;
    if (!subset.length) {
      const notFound=element('div',undefined,'empty-board search-empty');
      notFound.append(element('span','🔎'),element('strong','No matching Christmas names or links'),
        element('p','Try another name or select Top 100. Only the most recent top 100 verified entries are searchable.'));
      const clear=element('button','Clear search','empty-action');clear.type='button';clear.onclick=()=>{boardSearch.value='';renderLeaderboardRows();boardSearch.focus()};notFound.append(clear);
      list.append(notFound); return;
    }
    subset.forEach(entry => {
      const row = element('article', undefined, 'board-row'+(entry.rank<=3?' board-top board-top-'+entry.rank:''));
      row.setAttribute('aria-label',`Rank ${entry.rank}: ${entry.name}; verified total ${usd(entry.total_cents)}`);
      const rank=element('div',undefined,'rank-num');
      rank.append(element('span',entry.rank===1?'👑':entry.rank===2?'🥈':entry.rank===3?'🥉':'#'+entry.rank));
      const identity=element('div',undefined,'leader-identity');
      const named=element('strong',entry.name,'leader-name');
      named.title=entry.name;
      const link=safeExternalLink(entry.link,'↗ Open '+displayURL(entry.link),'leader-url');
      link.title='Open '+entry.link+' in a new tab';
      link.setAttribute('aria-label',`Open ${entry.name}’s link in a new tab: ${displayURL(entry.link)}`);
      identity.append(named,link);
      const paid=element('div',undefined,'leader-paid');
      paid.append(element('span','NET VERIFIED TOTAL','paid-label'),element('strong',usd(entry.total_cents),'leader-total'));
      const action=element('button','↑ Beat #'+entry.rank,'rank-action');
      action.type='button';
      action.setAttribute('aria-label',`Set a target amount to pass ${entry.name} at rank ${entry.rank}`);
      action.addEventListener('click', () => setTargetToPass(entry));
      row.append(rank,identity,paid,action);
      list.append(row);
    });
  }
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
      renderLeaderboardRows();
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
      updateChallenges(); return;
    }
    renderLeaderboardRows();
    [1,2,3].forEach(i => {
      const entry = entries[i-1];
      if (entry) insertRank(i,entry);
      else {
        const card = $(`.podium-card[data-pos="${i}"]`);
        const defaults = [null,{name: "Santa's Throne", label:'Awaiting a legend',portrait:'🎅'},
          {name:'Silver Star',label:'Awaiting a legend',portrait:'❄️'},
          {name:'Bronze Bells',label:'Awaiting a legend',portrait:'🦌'}][i];
        card.querySelector('.slot-name').textContent = defaults.name;
        card.querySelector('.slot-url').textContent = defaults.label;
        card.querySelector('.slot-amount').textContent = '—';
        card.querySelector('.portrait').textContent = defaults.portrait;
      }
    });
    $('#board-indicator').textContent = entries.length + (entries.length === 1 ? ' verified entry' : ' verified entries');
    $('#board-status').textContent = '👑 Current throne holder: ' + entries[0].name;
    updateChallenges();
  }
  async function fetchLeaderboard(options = {}) {
    if (activeRequest) return activeRequest;
    const run = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      refreshButton.disabled = true;
      refreshButton.textContent = '↻ Checking…';
      try {
        const r = await fetch('/api/leaderboard', {
          headers: {Accept:'application/json'}, cache:'no-store', signal:controller.signal
        });
        if (!r.ok) throw new Error('Leaderboard is unavailable');
        const data = await r.json();
        if (!Array.isArray(data.entries)) throw new Error('Unexpected leaderboard response');
        const newEntries = data.entries.filter(e => typeof e.name === 'string' && typeof e.link === 'string' &&
          Number.isSafeInteger(e.total_cents) && e.total_cents >= 100 &&
          Number.isSafeInteger(e.rank) && canonicalURL(e.link) === e.link)
          .sort((a,b) => a.rank - b.rank);
        const ready = data.status === 'ready';
        const nextSignature = JSON.stringify([ready, newEntries]);
        entries = newEntries;
        boardAvailable = ready;
        paymentsEnabled = ready && Boolean(data.paymentsEnabled);
        consecutiveErrors = 0;
        lastVerifiedAt = Date.now();
        if (nextSignature !== leaderboardSignature) {
          leaderboardSignature = nextSignature;
          renderLeaderboard();
        }
        if (!ready) {
          $('#board-indicator').textContent = 'Preparing launch';
          $('#board-status').textContent = '❄️ SantaCrown opens after the secure leaderboard is ready';
          $('#board-footnote').textContent = 'Checkout stays closed until merchant and database setup are verified.';
        } else {
          $('#board-footnote').textContent = 'Amounts reflect verified net USD payments, adjusted for refunds and disputes. Rankings can change.';
        }
        refreshLabel.className = 'board-updated' + (ready ? ' ready' : '');
        refreshLabel.textContent = ready
          ? '✓ Refreshed ' + timeLabel(lastVerifiedAt) + ' · Checking for changes automatically'
          : 'Pre-launch · Waiting for database setup';
      } catch (error) {
        consecutiveErrors++;
        boardAvailable = false;
        paymentsEnabled = false;
        $('#board-indicator').textContent = 'Connection unavailable';
        $('#board-status').textContent = '❄️ Live ranking is temporarily unavailable';
        refreshLabel.className = 'board-updated offline';
        refreshLabel.textContent = lastVerifiedAt
          ? '⚠️ Showing the last verified snapshot from ' + timeLabel(lastVerifiedAt) + ' · Rankings may have changed'
          : '⚠️ Leaderboard cannot connect. No live ranks are being shown.';
        if (!lastVerifiedAt || Date.now() - lastVerifiedAt > 5 * 60 * 1000) {
          entries = [];
          leaderboardSignature = '';
          const box = element('div',undefined,'empty-board');
          box.append(element('strong','Leaderboard temporarily unavailable'),
            element('p','Refresh to reconnect. We do not publish unverified rankings.'));
          $('#leaderboard-list').replaceChildren(box);
        }
      } finally {
        window.clearTimeout(timeout);
        refreshButton.disabled = false;
        refreshButton.textContent = '↻ Refresh';
        updateChallenges();
        updateEstimate();
        updateCheckoutUI();
      }
    };
    activeRequest = run();
    try { return await activeRequest; } finally { activeRequest = null; }
  }
  function scheduleRefresh() {
    window.clearTimeout(pollTimer);
    if (document.hidden) return;
    const delay = consecutiveErrors ? Math.min(90000, 15000 * (2 ** Math.min(3, consecutiveErrors))) : 25000;
    pollTimer = window.setTimeout(async () => { await fetchLeaderboard(); scheduleRefresh(); }, delay);
  }
  refreshButton.addEventListener('click', async () => { await fetchLeaderboard({manual:true}); scheduleRefresh(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.clearTimeout(pollTimer);
    else { fetchLeaderboard().then(scheduleRefresh); }
  });
  window.addEventListener('online', () => fetchLeaderboard().then(scheduleRefresh));
  window.addEventListener('pageshow', e => { if (e.persisted) fetchLeaderboard().then(scheduleRefresh); });
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
  updateIdentityPreview();
  updateEstimate();
  updateCheckoutUI();
  if (location.protocol !== 'file:') fetchLeaderboard().then(scheduleRefresh);
  else fetchLeaderboard();
})();