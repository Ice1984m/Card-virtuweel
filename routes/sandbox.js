'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { layout } = require('./layout');
const { escHtml, formatPrice } = require('./helpers');
const {
  readPaymentState,
  injectSandboxCredit,
  autoSetupSandboxWallet,
  getGoLiveReadiness,
} = require('./paymentService');

const router = express.Router();

const SANDBOX_FILE = path.join(__dirname, '../data/sandbox.json');

function readSandboxState() {
  try {
    return JSON.parse(fs.readFileSync(SANDBOX_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[sandbox] Failed to read state:', err.message);
    }
    return { apiKeys: [], devMode: true, notes: '' };
  }
}

function writeSandboxState(state) {
  fs.writeFileSync(SANDBOX_FILE, JSON.stringify(state, null, 2));
}

router.get('/', (req, res) => {
  const sandbox = readSandboxState();
  const payState = readPaymentState();
  const wallet = payState.wallet;
  const readiness = getGoLiveReadiness(payState);
  const flash = req.query.flash
    ? `<div class="flash">${escHtml(req.query.flash)}</div>`
    : '';

  res.send(layout('🛠️ Sandbox – Ontwikkelaarstools', `
    <div class="page-header">
      <h1>🛠️ Sandbox Ontwikkelaarstools</h1>
      <a href="/wallet" class="btn btn-secondary">← Terug naar wallet</a>
    </div>
    ${flash}
    <div class="wallet-layout">
      <section class="wallet-main">
        ${renderDevModeCard(sandbox)}
        ${renderAiSetupCard(wallet)}
        ${renderCreditInjectCard(wallet)}
        ${renderApiKeysCard(sandbox)}
        ${renderSyncCard(wallet)}
        ${renderDevNotesCard(sandbox)}
      </section>
      <aside class="wallet-side">
        ${renderReadinessCard(readiness)}
        ${renderWalletStatusCard(wallet)}
      </aside>
    </div>
  `));
});

router.post('/toggle-dev-mode', (req, res) => {
  const sandbox = readSandboxState();
  sandbox.devMode = !sandbox.devMode;
  writeSandboxState(sandbox);
  res.redirect('/sandbox?flash=Ontwikkelaarsmodus+' + (sandbox.devMode ? 'ingeschakeld' : 'uitgeschakeld'));
});

router.post('/ai-setup', (req, res) => {
  try {
    autoSetupSandboxWallet(req.body.holderName || '');
    res.redirect('/sandbox?flash=AI+heeft+sandbox+wallet+automatisch+ingesteld+met+€100+startkrediet');
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('AI Setup Fout', `
      <div class="page-header"><h1>AI Setup Fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/sandbox" class="btn">← Terug naar sandbox</a>
    `));
  }
});

router.post('/wallet/credit', (req, res) => {
  try {
    injectSandboxCredit(req.body.amount);
    res.redirect('/sandbox?flash=Sandbox+credit+geïnjecteerd');
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Credit Injectie Fout', `
      <div class="page-header"><h1>Credit Injectie Fout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/sandbox" class="btn">← Terug naar sandbox</a>
    `));
  }
});

router.post('/api-keys/generate', (req, res) => {
  const sandbox = readSandboxState();
  const label = String(req.body.label || 'Sandbox sleutel').trim().slice(0, 80);
  const key = {
    id: randomUUID(),
    label,
    key: `cvw_sandbox_${randomUUID().replace(/-/g, '')}`,
    createdAt: new Date().toISOString(),
  };
  sandbox.apiKeys = sandbox.apiKeys || [];
  sandbox.apiKeys.unshift(key);
  sandbox.apiKeys = sandbox.apiKeys.slice(0, 20);
  writeSandboxState(sandbox);
  res.redirect('/sandbox?flash=API-sleutel+aangemaakt');
});

router.post('/api-keys/:id/delete', (req, res) => {
  const sandbox = readSandboxState();
  sandbox.apiKeys = (sandbox.apiKeys || []).filter((k) => k.id !== req.params.id);
  writeSandboxState(sandbox);
  res.redirect('/sandbox?flash=API-sleutel+verwijderd');
});

router.post('/notes', (req, res) => {
  const sandbox = readSandboxState();
  sandbox.notes = String(req.body.notes || '').trim().slice(0, 2000);
  writeSandboxState(sandbox);
  res.redirect('/sandbox?flash=Notities+opgeslagen');
});

// ─── API JSON endpoints (for APK) ──────────────────────────────────────────

router.get('/api/status', (req, res) => {
  const sandbox = readSandboxState();
  const payState = readPaymentState();
  res.json({
    devMode: sandbox.devMode,
    apiKeyCount: (sandbox.apiKeys || []).length,
    walletConfigured: Boolean(payState.wallet),
    walletBalance: payState.wallet ? payState.wallet.availableBalance : null,
    goLiveReadiness: getGoLiveReadiness(payState),
  });
});

router.post('/api/ai-setup', (req, res) => {
  try {
    const wallet = autoSetupSandboxWallet(req.body.holderName || '');
    res.json({ success: true, wallet: { balance: wallet.availableBalance, holderName: wallet.holderName, maskedPan: wallet.maskedPan } });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/api/wallet/credit', (req, res) => {
  try {
    const wallet = injectSandboxCredit(req.body.amount);
    res.json({ success: true, balance: wallet.availableBalance });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// ─── Render helpers ─────────────────────────────────────────────────────────

function renderDevModeCard(sandbox) {
  const active = sandbox.devMode !== false;
  return `
    <section class="wallet-card">
      <h2>🔧 Ontwikkelaarsmodus</h2>
      <p class="wallet-copy">Schakel de ontwikkelaarsmodus in of uit. In ontwikkelaarsmodus zijn extra tools beschikbaar voor testen en debuggen.</p>
      <div style="margin-bottom:1rem">
        <span class="badge ${active ? 'badge-approved' : 'badge-rejected'}">${active ? 'Ontwikkelaarsmodus AAN' : 'Ontwikkelaarsmodus UIT'}</span>
      </div>
      <form method="POST" action="/sandbox/toggle-dev-mode">
        <button type="submit" class="btn ${active ? 'btn-secondary' : ''}">${active ? '🔴 Uitschakelen' : '🟢 Inschakelen'}</button>
      </form>
    </section>
  `;
}

function renderAiSetupCard(wallet) {
  return `
    <section class="wallet-card">
      <h2>🤖 AI Automatische Sandbox Wallet Instelling</h2>
      <p class="wallet-copy">Laat de AI automatisch een sandbox wallet configureren met optimale instellingen en €100 startkrediet. De AI past dagelijks uitgavelimiet, meldingen en autobevestiging automatisch in.</p>
      ${wallet ? `<p class="install-hint">✅ Wallet is aangemaakt voor <strong>${escHtml(wallet.holderName)}</strong>. AI setup voegt extra startkrediet toe.</p>` : '<p class="install-hint">⚠️ Nog geen wallet aangemaakt. AI setup maakt automatisch een sandbox wallet aan.</p>'}
      <form method="POST" action="/sandbox/ai-setup" class="form-card">
        <div class="form-group">
          <label for="aiHolderName">Kaarthouder naam (optioneel)</label>
          <input id="aiHolderName" name="holderName" type="text" placeholder="Laat leeg voor standaard AI-naam" value="${wallet ? escHtml(wallet.holderName) : ''}">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">🤖 AI Wallet Instellen</button>
        </div>
      </form>
    </section>
  `;
}

function renderCreditInjectCard(wallet) {
  if (!wallet) {
    return `
      <section class="wallet-card">
        <h2>💰 Sandbox Credit Injectie</h2>
        <p class="wallet-copy">Maak eerst een sandbox wallet aan of gebruik de AI auto-setup hierboven.</p>
      </section>
    `;
  }
  return `
    <section class="wallet-card">
      <h2>💰 Sandbox Credit Injectie</h2>
      <p class="wallet-copy">Injecteer direct sandbox-credits in de wallet zonder bank-autorisatiestap. Huidig saldo: <strong>€${escHtml(formatPrice(wallet.availableBalance || wallet.balance || 0))}</strong>.</p>
      <form method="POST" action="/sandbox/wallet/credit" class="form-card">
        <div class="form-group">
          <label for="creditAmount">Bedrag (€)</label>
          <input id="creditAmount" name="amount" type="number" min="0.01" max="10000" step="0.01" required placeholder="bijv. 50.00">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-pay">💸 Credit injecteren</button>
        </div>
      </form>
    </section>
  `;
}

function renderApiKeysCard(sandbox) {
  const keys = sandbox.apiKeys || [];
  return `
    <section class="wallet-card">
      <h2>🔑 API-sleutel beheer</h2>
      <p class="wallet-copy">Beheer sandbox API-sleutels voor APK-integratie en externe testkoppelingen.</p>
      <form method="POST" action="/sandbox/api-keys/generate" class="form-card" style="margin-bottom:1rem">
        <div class="form-group">
          <label for="keyLabel">Sleutel label</label>
          <input id="keyLabel" name="label" type="text" placeholder="bijv. APK Testsleutel" required>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">+ Sleutel aanmaken</button>
        </div>
      </form>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Label</th><th>Sleutel</th><th>Aangemaakt</th><th>Actie</th></tr></thead>
          <tbody>
            ${keys.length ? keys.map((k) => `<tr>
              <td>${escHtml(k.label)}</td>
              <td><code class="mono">${escHtml(k.key)}</code></td>
              <td>${escHtml(new Date(k.createdAt).toLocaleDateString('nl-NL'))}</td>
              <td>
                <form method="POST" action="/sandbox/api-keys/${encodeURIComponent(k.id)}/delete" style="display:inline" onsubmit="return confirm('Sleutel verwijderen?');">
                  <button type="submit" class="btn btn-small btn-reject">🗑 Verwijder</button>
                </form>
              </td>
            </tr>`).join('') : '<tr><td colspan="4" class="empty">Nog geen API-sleutels aangemaakt.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSyncCard(wallet) {
  return `
    <section class="wallet-card">
      <h2>📲 APK Wallet Synchronisatie</h2>
      <p class="wallet-copy">Gebruik onderstaande API-endpoints om de wallet te synchroniseren met de Card-virtuweel Android APK.</p>
      <div class="wallet-rules" style="margin-bottom:1rem">
        <code class="mono">GET /wallet/api/sync</code> – Volledige wallet status voor APK<br>
        <code class="mono">GET /sandbox/api/status</code> – Sandbox developer status<br>
        <code class="mono">POST /sandbox/api/ai-setup</code> – AI wallet auto-setup via APK<br>
        <code class="mono">POST /sandbox/api/wallet/credit</code> – Credit injecteren via APK
      </div>
      <div class="form-actions">
        <a href="/wallet/api/sync" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">📤 Wallet sync API</a>
        <a href="/sandbox/api/status" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">🛠️ Sandbox API status</a>
      </div>
      ${wallet ? `<p class="install-hint">Kaart: <span class="mono">${escHtml(wallet.maskedPan)}</span> | Saldo: €${escHtml(formatPrice(wallet.availableBalance || wallet.balance || 0))}</p>` : '<p class="install-hint">Nog geen wallet geconfigureerd.</p>'}
    </section>
  `;
}

function renderDevNotesCard(sandbox) {
  return `
    <section class="wallet-card">
      <h2>📝 Ontwikkelaarsnotities</h2>
      <form method="POST" action="/sandbox/notes" class="form-card">
        <div class="form-group">
          <textarea name="notes" rows="5" style="width:100%;font-family:monospace;font-size:.9rem" placeholder="Notities voor het ontwikkelteam…">${escHtml(sandbox.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-secondary">Notities opslaan</button>
        </div>
      </form>
    </section>
  `;
}

function renderReadinessCard(readiness) {
  return `
    <section class="wallet-card wallet-info-card">
      <h2>🚀 Live-goedkeuring status</h2>
      <div class="badge ${readiness.canGoLive ? 'badge-approved' : 'badge-pending'}" style="margin-bottom:.75rem">${readiness.canGoLive ? 'Klaar voor live' : 'Nog niet live'}</div>
      <div class="wallet-readiness-list">
        ${readiness.checks.map((check) => `<div class="wallet-readiness-item">
          <strong>${check.passed ? '✅' : '⚠️'} ${escHtml(check.label)}</strong>
          <p>${escHtml(check.detail)}</p>
        </div>`).join('')}
      </div>
    </section>
  `;
}

function renderWalletStatusCard(wallet) {
  if (!wallet) {
    return `
      <section class="wallet-card wallet-info-card">
        <h2>💳 Wallet status</h2>
        <p class="empty">Geen wallet aangemaakt. Gebruik AI auto-setup of ga naar <a href="/wallet">Wallet</a>.</p>
      </section>
    `;
  }
  return `
    <section class="wallet-card wallet-info-card">
      <h2>💳 Wallet status</h2>
      <ul class="wallet-rules">
        <li>Kaarthouder: <strong>${escHtml(wallet.holderName)}</strong></li>
        <li>Kaart: <code class="mono">${escHtml(wallet.maskedPan)}</code></li>
        <li>Saldo: <strong class="wallet-balance">€${escHtml(formatPrice(wallet.availableBalance || wallet.balance || 0))}</strong></li>
        <li>Provider: ${escHtml(wallet.provider)}</li>
        <li>Status: <span class="badge badge-approved">Sandbox actief</span></li>
      </ul>
      <div class="form-actions" style="margin-top:.75rem">
        <a href="/wallet" class="btn btn-secondary btn-small">Open Wallet</a>
      </div>
    </section>
  `;
}

module.exports = router;
