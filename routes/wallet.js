'use strict';

const express = require('express');
const { layout } = require('./layout');
const { escHtml, formatPrice } = require('./helpers');
const {
  MIN_TOP_UP_AMOUNT,
  MAX_TOP_UP_AMOUNT,
  DAILY_TOP_UP_LIMIT,
  MAX_DAILY_SPENDING_LIMIT,
  DEFAULT_WALLET_SETTINGS,
  readPaymentState,
  createSandboxWallet,
  setWalletBankAccount,
  updateWalletSettings,
  createInvoice,
  createInvoicePaymentIntent,
  createTopUpIntent,
  getIntentById,
  confirmIntent,
  getGoLiveReadiness,
  generateApprovalReport,
  resetWallet,
} = require('./paymentService');

const router = express.Router();

const INTENT_STATUS_LABEL = {
  pending_confirmation: 'Wacht op bevestiging',
  confirmed: 'Bevestigd',
  failed: 'Mislukt',
  cancelled: 'Geannuleerd',
};

const INTENT_STATUS_CLASS = {
  pending_confirmation: 'badge-pending',
  confirmed: 'badge-approved',
  failed: 'badge-rejected',
  cancelled: 'badge-rejected',
};

router.get('/', (req, res) => {
  const state = readPaymentState();
  const wallet = state.wallet;
  const flash = req.query.flash
    ? `<div class="flash">${escHtml(req.query.flash)}</div>`
    : '';

  res.send(layout('Sandbox wallet', `
    <div class="page-header">
      <h1>💳 Sandbox wallet</h1>
    </div>
    ${flash}
    <div class="wallet-layout">
      <section class="wallet-main">
        ${wallet ? renderWalletSummary(wallet) : renderCardRequest()}
        ${wallet ? renderWalletMenu(wallet) : ''}
        ${wallet ? renderWalletSettings(wallet) : ''}
        ${wallet ? renderBankAccountForm(wallet) : ''}
        ${wallet ? renderTopUpForm() : ''}
        ${wallet ? renderInvoiceManager(state) : ''}
        ${wallet ? renderPendingIntents(state) : ''}
        ${wallet ? renderAiAssistant(wallet) : ''}
      </section>
      <aside class="wallet-side">
        ${renderAuditInfo()}
        ${renderGoLiveReadiness(getGoLiveReadiness(state))}
      </aside>
    </div>
    ${wallet ? renderTransactions(state.transactions) : ''}
    ${wallet ? renderAuditTable(state.auditLog) : ''}
  `));
});

router.post('/card/request', (req, res) => {
  try {
    createSandboxWallet(req.body.holderName);
    res.redirect('/wallet?flash=Sandbox+prepaid+kaart+aangemaakt');
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Wallet fout', `
      <div class="page-header"><h1>Wallet fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/wallet" class="btn">← Terug naar wallet</a>
    `));
  }
});

router.post('/card/reset', (req, res) => {
  resetWallet();
  res.redirect('/wallet?flash=Sandbox+wallet+gereset');
});

router.post('/topups', (req, res) => {
  try {
    const intent = createTopUpIntent(req.body.amount);
    res.redirect(`/wallet/checkout/${encodeURIComponent(intent.id)}`);
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Top-up fout', `
      <div class="page-header"><h1>Top-up fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/wallet" class="btn">← Terug naar wallet</a>
    `));
  }
});

router.post('/bank-account', (req, res) => {
  try {
    setWalletBankAccount(req.body.iban);
    res.redirect('/wallet?flash=Rekeningnummer+gekoppeld+aan+wallet');
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Rekeningnummer fout', `
      <div class="page-header"><h1>Rekeningnummer fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/wallet" class="btn">← Terug naar wallet</a>
    `));
  }
});

router.post('/settings', (req, res) => {
  try {
    updateWalletSettings(req.body);
    res.redirect('/wallet?flash=Wallet+instellingen+opgeslagen');
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Instellingen fout', `
      <div class="page-header"><h1>Instellingen fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/wallet" class="btn">← Terug naar wallet</a>
    `));
  }
});

router.post('/invoices', (req, res) => {
  try {
    createInvoice(req.body);
    res.redirect('/wallet?flash=Factuur+aangemaakt');
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Factuur fout', `
      <div class="page-header"><h1>Factuur fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/wallet" class="btn">← Terug naar wallet</a>
    `));
  }
});

router.post('/invoices/:invoiceId/pay', (req, res) => {
  try {
    const intent = createInvoicePaymentIntent(req.params.invoiceId);
    res.redirect(`/wallet/checkout/${encodeURIComponent(intent.id)}`);
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Factuurbetaling fout', `
      <div class="page-header"><h1>Factuurbetaling fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/wallet" class="btn">← Terug naar wallet</a>
    `));
  }
});

router.get('/checkout/:intentId', (req, res) => {
  const intent = getIntentById(req.params.intentId);
  if (!intent) {
    return res.status(404).send(layout('Niet gevonden', '<div class="error">Betalingsintentie niet gevonden.</div><a href="/wallet" class="btn">← Terug naar wallet</a>'));
  }

  res.send(layout('Sandbox provider bevestiging', `
    <div class="page-header">
      <h1>🔐 Sandbox provider bevestiging</h1>
      <a href="${escHtml(intent.returnPath || '/wallet')}" class="btn btn-secondary">← Terug</a>
    </div>
    <section class="checkout-card">
      <div class="demo-notice">
        Officiële bank/itsme-koppelingen zijn niet ingebouwd. Deze pagina simuleert alleen een provider-redirect in sandboxmodus.
      </div>
      <dl class="checkout-summary">
        <div><dt>Type</dt><dd>${escHtml(intent.type === 'topup' ? 'Top-up' : 'Aankoop')}</dd></div>
        <div><dt>Provider referentie</dt><dd class="mono">${escHtml(intent.providerReference)}</dd></div>
        <div><dt>Status</dt><dd><span class="badge ${INTENT_STATUS_CLASS[intent.status] || ''}">${INTENT_STATUS_LABEL[intent.status] || escHtml(intent.status)}</span></dd></div>
        <div><dt>Bedrag</dt><dd>€${escHtml(formatPrice(intent.amount))}</dd></div>
        ${intent.postTitle ? `<div><dt>Post</dt><dd>${escHtml(intent.postTitle)}</dd></div>` : ''}
      </dl>
      ${intent.status === 'pending_confirmation' ? `
        <form method="POST" action="/wallet/checkout/${encodeURIComponent(intent.id)}/confirm" class="checkout-actions">
          <button type="submit" name="decision" value="approve" class="btn btn-approve">✅ Goedkeuren</button>
          <button type="submit" name="decision" value="fail" class="btn btn-reject">❌ Mislukken</button>
          <button type="submit" name="decision" value="cancel" class="btn btn-secondary">↩ Annuleren</button>
        </form>
      ` : `
        <div class="flash">Deze sandbox autorisatie is al verwerkt.</div>
      `}
    </section>
  `));
});

router.post('/checkout/:intentId/confirm', (req, res) => {
  const intent = getIntentById(req.params.intentId);
  if (!intent) {
    return res.status(404).send(layout('Niet gevonden', '<div class="error">Betalingsintentie niet gevonden.</div><a href="/wallet" class="btn">← Terug naar wallet</a>'));
  }

  try {
    const result = confirmIntent(intent.id, req.body.decision);
    const latestIntent = result.intent || getIntentById(intent.id);
    const flash = latestIntent.status === 'confirmed'
      ? 'Sandbox+autorisatie+bevestigd'
      : latestIntent.status === 'cancelled'
        ? 'Sandbox+autorisatie+geannuleerd'
        : 'Sandbox+autorisatie+mislukt';
    res.redirect(`${latestIntent.returnPath || '/wallet'}?flash=${flash}`);
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Provider fout', `
      <div class="page-header"><h1>Provider fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="${escHtml(intent.returnPath || '/wallet')}" class="btn">← Terug</a>
    `));
  }
});

router.get('/api/status', (req, res) => {
  const state = readPaymentState();
  res.json({
    environment: 'test',
    wallet: state.wallet
      ? {
          ...state.wallet,
          linkedBankAccount: state.wallet.maskedBankAccount || null,
        }
      : null,
    availableBalance: state.wallet ? state.wallet.availableBalance : 0,
    pendingTopUps: state.topUpIntents.filter((entry) => entry.status === 'pending_confirmation'),
    pendingPayments: state.paymentIntents.filter((entry) => entry.status === 'pending_confirmation'),
    openInvoices: state.invoices.filter((entry) => entry.status === 'open'),
    recentTransactions: state.transactions.slice(0, 10),
    goLiveReadiness: getGoLiveReadiness(state),
  });
});

// APK wallet sync endpoint – returns a compact snapshot for Android synchronisation
router.get('/api/sync', (req, res) => {
  const state = readPaymentState();
  res.json({
    syncedAt: new Date().toISOString(),
    environment: 'sandbox',
    wallet: state.wallet
      ? {
          holderName: state.wallet.holderName,
          maskedPan: state.wallet.maskedPan,
          provider: state.wallet.provider,
          providerCardToken: state.wallet.providerCardToken,
          balance: state.wallet.availableBalance,
          currency: 'EUR',
          status: state.wallet.status,
          maskedBankAccount: state.wallet.maskedBankAccount || null,
          settings: state.wallet.settings || {},
          lastTopUpAt: state.wallet.lastTopUpAt || null,
        }
      : null,
    openInvoices: state.invoices.filter((entry) => entry.status === 'open').length,
    recentTransactions: state.transactions.slice(0, 5).map((t) => ({
      type: t.type,
      amount: t.amount,
      status: t.status,
      description: t.description,
      createdAt: t.createdAt,
    })),
  });
});

router.get('/api/invoices', (req, res) => {
  const state = readPaymentState();
  res.json({
    invoices: state.invoices,
  });
});

router.post('/api/invoices', (req, res) => {
  try {
    const invoice = createInvoice(req.body);
    res.status(201).json({ success: true, invoice });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/api/invoices/:invoiceId/pay', (req, res) => {
  try {
    const intent = createInvoicePaymentIntent(req.params.invoiceId);
    res.json({
      success: true,
      intent,
      checkoutUrl: `/wallet/checkout/${encodeURIComponent(intent.id)}`,
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/api/wallet/bank-account', (req, res) => {
  try {
    const wallet = setWalletBankAccount(req.body.iban);
    res.json({
      success: true,
      wallet: {
        ...wallet,
        linkedBankAccount: wallet.maskedBankAccount || null,
      },
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/api/intents/:intentId', (req, res) => {
  const intent = getIntentById(req.params.intentId);
  if (!intent) {
    return res.status(404).json({ error: 'Betalingsintentie niet gevonden.' });
  }
  res.json({ intent });
});

router.get('/api/approvals', (req, res) => {
  res.json(generateApprovalReport(readPaymentState()));
});

router.post('/api/intents/:intentId/confirm', (req, res) => {
  const intent = getIntentById(req.params.intentId);
  if (!intent) {
    return res.status(404).json({ error: 'Betalingsintentie niet gevonden.' });
  }

  try {
    const result = confirmIntent(intent.id, req.body.decision);
    res.json({
      success: true,
      intent: result.intent || getIntentById(intent.id),
      goLiveReadiness: getGoLiveReadiness(),
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

function renderCardRequest() {
  return `
    <section class="wallet-card">
      <h2>Sandbox prepaid kaart aanvragen</h2>
      <p class="wallet-copy">Maak een veilige testkaart aan zonder echte PAN-, CVC- of bankgegevens op te slaan.</p>
      <form method="POST" action="/wallet/card/request" class="form-card">
        <div class="form-group">
          <label for="holderName">Kaarthouder</label>
          <input id="holderName" name="holderName" type="text" placeholder="Voor- en achternaam" required>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">Sandbox kaart aanmaken</button>
        </div>
      </form>
    </section>
  `;
}

function renderWalletSummary(wallet) {
  return `
    <section class="wallet-card">
      <h2>Kaartoverzicht</h2>
      <div class="wallet-summary-grid">
        <div class="wallet-summary-item">
          <span class="wallet-label">Provider</span>
          <strong>${escHtml(wallet.provider)}</strong>
        </div>
        <div class="wallet-summary-item">
          <span class="wallet-label">Status</span>
          <span class="badge badge-approved">Sandbox actief</span>
        </div>
        <div class="wallet-summary-item">
          <span class="wallet-label">Kaart</span>
          <strong class="mono">${escHtml(wallet.maskedPan)}</strong>
        </div>
        <div class="wallet-summary-item">
          <span class="wallet-label">Token</span>
          <strong class="mono">${escHtml(wallet.providerCardToken)}</strong>
        </div>
        <div class="wallet-summary-item">
          <span class="wallet-label">Saldo</span>
          <strong class="wallet-balance">€${escHtml(formatPrice(wallet.availableBalance || wallet.balance || 0))}</strong>
        </div>
        <div class="wallet-summary-item">
          <span class="wallet-label">Kaarthouder</span>
          <strong>${escHtml(wallet.holderName)}</strong>
        </div>
        <div class="wallet-summary-item">
          <span class="wallet-label">Rekeningnummer</span>
          <strong class="mono">${escHtml(wallet.maskedBankAccount || 'Nog niet gekoppeld')}</strong>
        </div>
      </div>
      <form method="POST" action="/wallet/card/reset" class="wallet-reset-form" onsubmit="return confirm('Weet u zeker dat u de sandbox wallet wilt resetten? Alle gegevens worden verwijderd.');">
        <button type="submit" class="btn btn-secondary btn-small">🗑 Wallet resetten</button>
      </form>
    </section>
  `;
}

function renderWalletMenu(wallet) {
  const settings = wallet.settings || {};
  const hasBot = Boolean(settings.aiAssistentUrl);
  return `
    <section class="wallet-card">
      <h2>Wallet menu</h2>
      <div class="form-actions">
        <a href="#instellingen" class="btn btn-secondary">⚙️ Instellingen</a>
        <a href="#rekening" class="btn btn-secondary">🏦 Rekening koppelen</a>
        <a href="#opladen" class="btn btn-secondary">💰 Saldo opladen</a>
        <a href="#facturen" class="btn btn-secondary">🧾 Facturen beheren</a>
        <a href="#transacties" class="btn btn-secondary">📊 Transacties bekijken</a>
        ${hasBot ? `<a href="#ai-assistent" class="btn btn-secondary">🤖 AI-assistent</a>` : ''}
        <a href="/wallet/api/status" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">📤 API status</a>
        <a href="/wallet/api/approvals" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">📋 Goedkeuringsrapport</a>
      </div>
    </section>
  `;
}

function renderWalletSettings(wallet) {
  const s = { ...DEFAULT_WALLET_SETTINGS, ...(wallet.settings || {}) };
  return `
    <section id="instellingen" class="wallet-card">
      <h2>⚙️ Wallet instellingen</h2>
      <p class="wallet-copy">Pas standaardinstellingen aan die automatisch actief zijn vanaf het moment dat de wallet live gaat.</p>
      <form method="POST" action="/wallet/settings" class="form-card">
        <div class="form-group">
          <label for="labelNaam">Wallet label / naam</label>
          <input id="labelNaam" name="labelNaam" type="text" maxlength="80" placeholder="Bijv. Mijn prepaidkaart" value="${escHtml(s.labelNaam)}">
        </div>
        <div class="form-group">
          <label for="dagelijksUitgavelimiet">Dagelijks uitgavelimiet (€)</label>
          <input id="dagelijksUitgavelimiet" name="dagelijksUitgavelimiet" type="number" min="1" max="${MAX_DAILY_SPENDING_LIMIT}" step="0.01" value="${escHtml(String(s.dagelijksUitgavelimiet))}" required>
          <small class="install-hint">Maximaal dagelijks uitgavelimiet: €${escHtml(String(MAX_DAILY_SPENDING_LIMIT))}.</small>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="meldingenIngeschakeld" value="true"${s.meldingenIngeschakeld ? ' checked' : ''}>
            Meldingen ingeschakeld
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="autoBevestigOpladen" value="true"${s.autoBevestigOpladen ? ' checked' : ''}>
            Automatisch bevestigen bij opladen (sandbox)
          </label>
        </div>
        <div class="form-group">
          <label for="aiAssistentUrl">Google Cloud AI-bot URL (optioneel)</label>
          <input id="aiAssistentUrl" name="aiAssistentUrl" type="url" placeholder="https://..." value="${escHtml(s.aiAssistentUrl)}">
          <small class="install-hint">Voer de webhook- of chat-URL in van uw zelfgemaakte Google Cloud AI-bot.</small>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">Instellingen opslaan</button>
        </div>
      </form>
    </section>
  `;
}

function renderAiAssistant(wallet) {
  const settings = wallet.settings || {};
  const url = settings.aiAssistentUrl || '';
  if (!url) {
    return '';
  }
  return `
    <section id="ai-assistent" class="wallet-card">
      <h2>🤖 Google Cloud AI-assistent</h2>
      <p class="wallet-copy">Geconfigureerde AI-bot voor wallet-sturing en automatisch programmeren. De bot is bereikbaar via de onderstaande interface.</p>
      <div class="install-hint" style="margin-bottom:0.75rem;">Bot URL: <a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" class="mono">${escHtml(url)}</a></div>
      <iframe
        src="${escHtml(url)}"
        title="Google Cloud AI-assistent"
        width="100%"
        height="480"
        style="border:1px solid #ddd;border-radius:6px;background:#fafafa;"
        sandbox="allow-scripts allow-forms allow-popups"
        loading="lazy"
      ></iframe>
      <p class="install-hint">Werkt de bot niet in het venster? <a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">Open in nieuw tabblad</a>.</p>
    </section>
  `;
}

function renderBankAccountForm(wallet) {
  return `
    <section id="rekening" class="wallet-card">
      <h2>Rekeningnummer toevoegen</h2>
      <p class="wallet-copy">Koppel een IBAN om walletbetalingen te beheren. Alleen gemaskeerde weergave wordt in het overzicht getoond.</p>
      <form method="POST" action="/wallet/bank-account" class="form-card">
        <div class="form-group">
          <label for="iban">IBAN</label>
          <input id="iban" name="iban" type="text" placeholder="BE00 0000 0000 0000" value="" required>
        </div>
        ${wallet.maskedBankAccount ? `<p class="install-hint">Huidig gekoppeld: <span class="mono">${escHtml(wallet.maskedBankAccount)}</span></p>` : ''}
        <div class="form-actions">
          <button type="submit" class="btn">Rekening opslaan</button>
        </div>
      </form>
    </section>
  `;
}

function renderTopUpForm() {
  return `
    <section id="opladen" class="wallet-card">
      <h2>Kaart opladen</h2>
      <p class="wallet-copy">Alleen sandbox bedragen zijn toegestaan. Daglimiet: €${escHtml(formatPrice(DAILY_TOP_UP_LIMIT))}.</p>
      <form method="POST" action="/wallet/topups" class="form-card">
        <div class="form-group">
          <label for="amount">Bedrag (€)</label>
          <input id="amount" name="amount" type="number" min="${MIN_TOP_UP_AMOUNT}" max="${MAX_TOP_UP_AMOUNT}" step="0.01" required>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-pay">Top-up starten</button>
        </div>
      </form>
    </section>
  `;
}

function renderInvoiceManager(state) {
  const openInvoices = state.invoices.filter((entry) => entry.status === 'open');
  const latestInvoices = state.invoices.slice(0, 10);
  return `
    <section id="facturen" class="wallet-card">
      <h2>Facturen en betalingen</h2>
      <p class="wallet-copy">Maak facturen aan en start direct een sandbox betaalautorisatie.</p>
      <form method="POST" action="/wallet/invoices" class="form-card">
        <div class="form-group">
          <label for="description">Omschrijving</label>
          <input id="description" name="description" type="text" placeholder="Omschrijving factuur" required>
        </div>
        <div class="form-group">
          <label for="invoiceAmount">Bedrag (€)</label>
          <input id="invoiceAmount" name="amount" type="number" min="0.01" max="1000" step="0.01" required>
        </div>
        <div class="form-group">
          <label for="dueDate">Vervaldatum (optioneel)</label>
          <input id="dueDate" name="dueDate" type="date">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-pay">Factuur aanmaken</button>
        </div>
      </form>
      <div class="table-wrap wallet-table-spacing">
        <table>
          <thead><tr><th>Factuur</th><th>Bedrag</th><th>Vervaldatum</th><th>Status</th><th>Actie</th></tr></thead>
          <tbody>
            ${latestInvoices.length ? latestInvoices.map((entry) => `<tr>
              <td><strong>${escHtml(entry.number)}</strong><br><span class="wallet-copy">${escHtml(entry.description)}</span></td>
              <td>€${escHtml(formatPrice(entry.amount))}</td>
              <td>${entry.dueDate ? escHtml(new Date(entry.dueDate).toLocaleDateString('nl-NL')) : '—'}</td>
              <td><span class="badge ${entry.status === 'paid' ? 'badge-approved' : 'badge-pending'}">${escHtml(entry.status)}</span></td>
              <td>${entry.status === 'open' ? `<form method="POST" action="/wallet/invoices/${encodeURIComponent(entry.id)}/pay"><button type="submit" class="btn btn-small btn-pay">Betaal</button></form>` : 'Betaald'}</td>
            </tr>`).join('') : '<tr><td colspan="5" class="empty">Nog geen facturen.</td></tr>'}
          </tbody>
        </table>
      </div>
      ${openInvoices.length ? `<p class="install-hint">${escHtml(String(openInvoices.length))} open factuur/facturen klaar voor betaling.</p>` : ''}
    </section>
  `;
}

function renderPendingIntents(state) {
  const pending = [...state.topUpIntents, ...state.paymentIntents]
    .filter((entry) => entry.status === 'pending_confirmation')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!pending.length) {
    return '';
  }

  return `
    <section class="wallet-card">
      <h2>Wacht op providerbevestiging</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Bedrag</th><th>Referentie</th><th>Actie</th></tr></thead>
          <tbody>
            ${pending.map((entry) => `<tr>
              <td>${escHtml(entry.type === 'topup' ? 'Top-up' : 'Aankoop')}</td>
              <td>€${escHtml(formatPrice(entry.amount))}</td>
              <td><code class="mono">${escHtml(entry.providerReference)}</code></td>
              <td><a href="/wallet/checkout/${encodeURIComponent(entry.id)}">Bevestigen</a></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderTransactions(transactions) {
  return `
    <section id="transacties" class="wallet-card">
      <h2>Transactiehistorie</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Omschrijving</th><th>Bedrag</th><th>Status</th><th>Tijdstip</th></tr></thead>
          <tbody>
            ${transactions.length ? transactions.map((entry) => `<tr>
              <td>${escHtml(entry.type === 'topup' ? 'Top-up' : 'Aankoop')}</td>
              <td>${escHtml(entry.description || '—')}</td>
              <td>€${escHtml(formatPrice(entry.amount))}</td>
              <td><span class="badge ${INTENT_STATUS_CLASS[entry.status] || ''}">${INTENT_STATUS_LABEL[entry.status] || escHtml(entry.status)}</span></td>
              <td>${escHtml(new Date(entry.createdAt).toLocaleString('nl-NL'))}</td>
            </tr>`).join('') : '<tr><td colspan="5" class="empty">Nog geen transacties.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAuditInfo() {
  return `
    <section class="wallet-card wallet-info-card">
      <h2>Veiligheidsregels &amp; API</h2>
      <ul class="wallet-rules">
        <li>Geen opslag van volledige kaartnummers, CVC of itsme-geheimen.</li>
        <li>Alle bevestigingen lopen via een server-side testautorisatiestap.</li>
        <li>Top-ups en betalingen worden gelogd in een audittrail.</li>
      </ul>
      <p class="install-hint wallet-hint-spacing">API endpoints: <code>/wallet/api/status</code>, <code>/wallet/api/invoices</code>, <code>/wallet/api/invoices/:id/pay</code>, <code>/wallet/api/wallet/bank-account</code>, <code>/wallet/api/approvals</code> en <code>/wallet/api/intents/:id/confirm</code>.</p>
    </section>
  `;
}

function renderAuditTable(entries) {
  return `
    <section class="wallet-card">
      <h2>Auditlog</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Tijdstip</th><th>Type</th><th>Bericht</th></tr></thead>
          <tbody>
            ${entries.length ? entries.slice(0, 20).map((entry) => `<tr>
              <td>${escHtml(new Date(entry.timestamp).toLocaleString('nl-NL'))}</td>
              <td>${escHtml(entry.type)}</td>
              <td>${escHtml(entry.message)}</td>
            </tr>`).join('') : '<tr><td colspan="3" class="empty">Nog geen audit-events.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderGoLiveReadiness(readiness) {
  return `
    <section class="wallet-card wallet-info-card">
      <h2>Live-goedkeuring status</h2>
      <p class="wallet-copy">Resultaat van de betaal- en deploymentchecks voordat livegang kan worden bevestigd.</p>
      <div class="badge ${readiness.canGoLive ? 'badge-approved' : 'badge-pending'}">${readiness.canGoLive ? 'Klaar voor live' : 'Nog niet live'}</div>
      <div class="wallet-readiness-list">
        ${readiness.checks.map((check) => `<div class="wallet-readiness-item">
          <strong>${check.passed ? '✅' : '⚠️'} ${escHtml(check.label)}</strong>
          <p>${escHtml(check.detail)}</p>
        </div>`).join('')}
      </div>
    </section>
  `;
}

module.exports = router;
