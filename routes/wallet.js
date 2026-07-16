'use strict';

const express = require('express');
const { layout } = require('./layout');
const { escHtml, formatPrice } = require('./helpers');
const {
  MIN_TOP_UP_AMOUNT,
  MAX_TOP_UP_AMOUNT,
  DAILY_TOP_UP_LIMIT,
  readPaymentState,
  createSandboxWallet,
  createTopUpIntent,
  getIntentById,
  confirmIntent,
  getGoLiveReadiness,
  generateApprovalReport,
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
        ${wallet ? renderTopUpForm() : ''}
        ${wallet ? renderPendingIntents(state) : ''}
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
    wallet: state.wallet,
    pendingTopUps: state.topUpIntents.filter((entry) => entry.status === 'pending_confirmation'),
    pendingPayments: state.paymentIntents.filter((entry) => entry.status === 'pending_confirmation'),
    recentTransactions: state.transactions.slice(0, 10),
    goLiveReadiness: getGoLiveReadiness(state),
  });
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
          <strong class="wallet-balance">€${escHtml(formatPrice(wallet.balance))}</strong>
        </div>
        <div class="wallet-summary-item">
          <span class="wallet-label">Kaarthouder</span>
          <strong>${escHtml(wallet.holderName)}</strong>
        </div>
      </div>
    </section>
  `;
}

function renderTopUpForm() {
  return `
    <section class="wallet-card">
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
    <section class="wallet-card">
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
      <p class="install-hint" style="margin-top:1rem">API endpoints: <code>/wallet/api/status</code>, <code>/wallet/api/approvals</code> en <code>/wallet/api/intents/:id/confirm</code>.</p>
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
