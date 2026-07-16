'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID, randomBytes } = require('crypto');
const { layout } = require('./layout');
const { escHtml } = require('./helpers');
const {
  readPaymentState,
  resetWallet,
  addDevCredit,
} = require('./paymentService');

const router = express.Router();

const SANDBOX_FILE = path.join(__dirname, '../data/sandbox.json');
const MASK_PREFIX_LENGTH = 16;
const MAX_API_KEYS = 20;
const MAX_LABEL_LENGTH = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_WRITES = 10;
const PENDING_KEY_DISPLAY_TTL_MS = 5 * 60 * 1000;

// Temporary in-memory store for newly generated keys (shown once after creation)
const pendingKeyDisplay = new Map();

// ─── Sandbox state helpers ────────────────────────────────────────────────────

function readSandboxState() {
  try {
    return JSON.parse(fs.readFileSync(SANDBOX_FILE, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn('[sandbox] Failed to read sandbox state:', err.message);
    }
    return { apiKeys: [], devOptions: { requireApiKey: false, autoConfirm: false, logLevel: 'info' } };
  }
}

function writeSandboxState(state) {
  fs.writeFileSync(SANDBOX_FILE, JSON.stringify(state, null, 2));
}

function generateApiKey() {
  return `cvw_sandbox_${randomBytes(24).toString('hex')}`;
}

function maskKey(key) {
  if (!key || key.length < MASK_PREFIX_LENGTH) return '****';
  return `${key.slice(0, MASK_PREFIX_LENGTH)}…${key.slice(-6)}`;
}

// Simple in-memory rate limiter for sandbox write operations
const rateLimitMap = new Map();
function sandboxRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  rateLimitMap.set(ip, entry);
  if (entry.count > RATE_LIMIT_MAX_WRITES) {
    return res.redirect('/sandbox?err=' + encodeURIComponent('Te veel verzoeken. Probeer het over een minuut opnieuw.'));
  }
  next();
}

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const sandbox = readSandboxState();
  const payment = readPaymentState();

  // Retrieve newly-generated key for one-time display (never in URL)
  const pendingToken = req.query.newkey;
  let newKeyBanner = '';
  if (pendingToken && pendingKeyDisplay.has(pendingToken)) {
    const newKey = pendingKeyDisplay.get(pendingToken);
    pendingKeyDisplay.delete(pendingToken);
    newKeyBanner = `
      <div class="new-key-banner" role="alert">
        <strong>🔑 Nieuwe API-sleutel aangemaakt – sla deze nu op, hij wordt niet opnieuw getoond:</strong>
        <div class="new-key-value"><code class="mono">${escHtml(newKey)}</code></div>
      </div>`;
  }

  const flash = req.query.flash
    ? `<div class="flash">${escHtml(req.query.flash)}</div>`
    : '';
  const err = req.query.err
    ? `<div class="error">${escHtml(req.query.err)}</div>`
    : '';

  res.send(layout('Sandbox Developer Panel', `
    <div class="page-header">
      <h1>🛠️ Sandbox Developer Panel</h1>
      <a href="/" class="btn btn-secondary">← Home</a>
    </div>
    ${newKeyBanner}${flash}${err}
    <div class="sandbox-layout">
      <section class="sandbox-main">
        ${renderApiKeyPanel(sandbox)}
        ${renderDevOptions(sandbox)}
        ${renderWalletDevOps(payment)}
        ${renderAiBot()}
      </section>
      <aside class="sandbox-side">
        ${renderApiDocs()}
        ${renderSandboxStatus(sandbox, payment)}
      </aside>
    </div>
  `));
});

// Generate API key
router.post('/apikeys/generate', sandboxRateLimit, (req, res) => {
  const sandbox = readSandboxState();
  if ((sandbox.apiKeys || []).length >= MAX_API_KEYS) {
    return res.redirect('/sandbox?err=' + encodeURIComponent(`Maximum aantal API-sleutels (${MAX_API_KEYS}) bereikt.`));
  }
  const label = String(req.body.label || '').trim().slice(0, MAX_LABEL_LENGTH) || 'Mijn sleutel';
  const key = generateApiKey();
  const keyId = randomUUID();
  sandbox.apiKeys = sandbox.apiKeys || [];
  sandbox.apiKeys.push({
    id: keyId,
    label,
    key,
    createdAt: new Date().toISOString(),
    active: true,
  });
  writeSandboxState(sandbox);
  // Store full key in memory for one-time display (not in URL)
  const token = randomUUID();
  pendingKeyDisplay.set(token, key);
  setTimeout(() => pendingKeyDisplay.delete(token), PENDING_KEY_DISPLAY_TTL_MS);
  res.redirect(`/sandbox?newkey=${encodeURIComponent(token)}`);
});

// Revoke API key
router.post('/apikeys/:id/revoke', sandboxRateLimit, (req, res) => {
  const sandbox = readSandboxState();
  sandbox.apiKeys = (sandbox.apiKeys || []).filter(k => k.id !== req.params.id);
  writeSandboxState(sandbox);
  res.redirect('/sandbox?flash=API-sleutel+ingetrokken');
});

// Save dev options
router.post('/settings', sandboxRateLimit, (req, res) => {
  const sandbox = readSandboxState();
  sandbox.devOptions = {
    requireApiKey: req.body.requireApiKey === 'true',
    autoConfirm: req.body.autoConfirm === 'true',
    logLevel: ['info', 'debug', 'warn'].includes(req.body.logLevel) ? req.body.logLevel : 'info',
  };
  writeSandboxState(sandbox);
  res.redirect('/sandbox?flash=Developer+opties+opgeslagen');
});

// Manually add test credit to sandbox wallet
router.post('/wallet/add-credit', sandboxRateLimit, (req, res) => {
  try {
    const wallet = addDevCredit(req.body.amount);
    const rounded = Number(wallet.balance);
    res.redirect(`/sandbox?flash=${encodeURIComponent(`Testtegoed toegevoegd. Huidig saldo: €${rounded.toFixed(2)}.`)}`);
  } catch (err) {
    res.redirect('/sandbox?err=' + encodeURIComponent(err.message || 'Kon testtegoed niet toevoegen.'));
  }
});

// Reset sandbox wallet (dev shortcut)
router.post('/wallet/reset', sandboxRateLimit, (req, res) => {
  resetWallet();
  res.redirect('/sandbox?flash=Sandbox+wallet+gereset');
});

// API endpoint: get API keys (masked)
router.get('/api/keys', (req, res) => {
  const sandbox = readSandboxState();
  res.json({
    keys: (sandbox.apiKeys || []).map(k => ({
      id: k.id,
      label: k.label,
      maskedKey: maskKey(k.key),
      createdAt: k.createdAt,
      active: k.active,
    })),
    devOptions: sandbox.devOptions || {},
  });
});

// ─── Render helpers ───────────────────────────────────────────────────────────

function renderApiKeyPanel(sandbox) {
  const keys = sandbox.apiKeys || [];
  const keyRows = keys.length
    ? keys.map(k => `
        <tr>
          <td><strong>${escHtml(k.label)}</strong></td>
          <td><code class="mono">${escHtml(maskKey(k.key))}</code></td>
          <td>${escHtml(new Date(k.createdAt).toLocaleString('nl-NL'))}</td>
          <td><span class="badge badge-approved">Actief</span></td>
          <td>
            <form method="POST" action="/sandbox/apikeys/${escHtml(k.id)}/revoke" style="display:inline"
              onsubmit="return confirm('API-sleutel intrekken?');">
              <button class="btn btn-small btn-reject">✖ Intrekken</button>
            </form>
          </td>
        </tr>`)
      .join('')
    : '<tr><td colspan="5" class="empty">Nog geen API-sleutels aangemaakt.</td></tr>';

  return `
    <section class="wallet-card">
      <h2>🔑 API-sleutels beheren</h2>
      <p class="wallet-copy">Genereer sandbox API-sleutels voor uw integraties. Sla de volledige sleutel op direct na aanmaak – deze wordt daarna gemaskeerd weergegeven.</p>
      <form method="POST" action="/sandbox/apikeys/generate" class="sandbox-keygen-form">
        <div class="form-group">
          <label for="keyLabel">Sleutelnaam / label</label>
          <input id="keyLabel" name="label" type="text" maxlength="60" placeholder="Bijv. Mijn test-integratie" required>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">🔐 API-sleutel genereren</button>
        </div>
      </form>
      <div class="table-wrap" style="margin-top:1.25rem">
        <table>
          <thead><tr><th>Label</th><th>Sleutel (gemaskeerd)</th><th>Aangemaakt</th><th>Status</th><th>Actie</th></tr></thead>
          <tbody>${keyRows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDevOptions(sandbox) {
  const opts = sandbox.devOptions || {};
  return `
    <section class="wallet-card">
      <h2>⚙️ Developer opties</h2>
      <p class="wallet-copy">Configureer het gedrag van de sandbox tijdens ontwikkeling.</p>
      <form method="POST" action="/sandbox/settings" class="form-card" style="max-width:100%;box-shadow:none;border:none;padding:0;">
        <div class="form-group">
          <label>
            <input type="checkbox" name="requireApiKey" value="true"${opts.requireApiKey ? ' checked' : ''}>
            Vereis API-sleutel voor <code>/wallet/api/*</code> calls
          </label>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" name="autoConfirm" value="true"${opts.autoConfirm ? ' checked' : ''}>
            Automatisch sandbox-betalingen bevestigen (geen handmatige stap)
          </label>
        </div>
        <div class="form-group">
          <label for="logLevel">Log-niveau</label>
          <select id="logLevel" name="logLevel">
            <option value="info"${opts.logLevel === 'info' ? ' selected' : ''}>Info</option>
            <option value="debug"${opts.logLevel === 'debug' ? ' selected' : ''}>Debug</option>
            <option value="warn"${opts.logLevel === 'warn' ? ' selected' : ''}>Waarschuwing</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">Opties opslaan</button>
        </div>
      </form>
    </section>
  `;
}

function renderWalletDevOps(payment) {
  const hasWallet = Boolean(payment && payment.wallet);
  return `
    <section class="wallet-card">
      <h2>💳 Wallet ontwikkelaarsacties</h2>
      <p class="wallet-copy">Handmatige acties voor het testen van de sandbox wallet zonder de normale betalingsflow.</p>
      ${hasWallet ? `
        <form method="POST" action="/sandbox/wallet/add-credit" class="sandbox-credit-form">
          <div class="form-group">
            <label for="creditAmount">Testtegoed toevoegen (€)</label>
            <input id="creditAmount" name="amount" type="number" min="0.01" max="9999" step="0.01" placeholder="100.00" required>
            <small class="install-hint">Voegt direct testsaldo toe zonder top-up autorisatie.</small>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-pay">💰 Tegoed toevoegen</button>
          </div>
        </form>
        <form method="POST" action="/sandbox/wallet/reset" style="margin-top:1rem"
          onsubmit="return confirm('Sandbox wallet volledig resetten?');">
          <button type="submit" class="btn btn-secondary btn-small">🗑 Wallet resetten</button>
        </form>
      ` : `
        <div class="demo-notice">Maak eerst een sandbox wallet aan via <a href="/wallet">Wallet</a>.</div>
      `}
    </section>
  `;
}

function renderAiBot() {
  return `
    <section id="ai-bot" class="wallet-card">
      <h2>🤖 Sandbox AI-navigatieassistent</h2>
      <p class="wallet-copy">Ingebouwde hulpbot voor sandbox-navigatie en programmeerondersteuning. Stel vragen over de API, wallet of configuratie.</p>
      <div class="sandbox-chat" id="sandboxChat">
        <div class="sandbox-chat-log" id="chatLog">
          <div class="chat-msg chat-bot">Hallo! Ik ben de Sandbox AI-assistent. Hoe kan ik u helpen met de Card-virtuweel sandbox?</div>
        </div>
        <div class="sandbox-chat-bar">
          <input id="chatInput" type="text" placeholder="Bijv: hoe genereer ik een API-sleutel?" autocomplete="off">
          <button id="chatSend" class="btn">Verstuur</button>
        </div>
      </div>
      <script>
        (function () {
          var knowledge = [
            {
              q: ['api', 'sleutel', 'key', 'genereer', 'aanmaak'],
              a: 'Ga naar de sectie "API-sleutels beheren" bovenaan deze pagina. Klik op "API-sleutel genereren", geef een label op en sla de volledige sleutel direct op – daarna wordt hij gemaskeerd weergegeven.'
            },
            {
              q: ['wallet', 'aanmaken', 'kaart', 'sandbox'],
              a: 'Ga naar /wallet en klik op "Sandbox kaart aanmaken". Vul uw naam in als kaarthouder. U kunt daarna via dit paneel testtegoeden toevoegen zonder de betalingsflow.'
            },
            {
              q: ['tegoed', 'saldo', 'credit', 'geld', 'toevoegen'],
              a: 'In de sectie "Wallet ontwikkelaarsacties" op deze pagina kunt u direct testsaldo toevoegen. Dit omzeilt de normale top-up autorisatie en is alleen voor sandboxdoeleinden.'
            },
            {
              q: ['top-up', 'opladen', 'betalen', 'transactie'],
              a: 'In de sandbox simuleert u een top-up via /wallet → "Kaart opladen". U wordt doorgestuurd naar een checkoutpagina waar u de betaling handmatig bevestigt of annuleert.'
            },
            {
              q: ['iban', 'rekening', 'bank'],
              a: 'Koppel een IBAN-rekeningnummer via /wallet → "Rekeningnummer toevoegen". Het IBAN wordt gevalideerd (MOD-97 checksum) en gemaskeerd opgeslagen.'
            },
            {
              q: ['apk', 'update', 'download', 'app', 'installeer'],
              a: 'Download de nieuwste APK via /download/apk. De app controleert automatisch op updates via het /api/version endpoint. Na een update verschijnt een melding in de app.'
            },
            {
              q: ['workflow', 'github', 'build', 'ci', 'cd'],
              a: 'De GitHub Actions workflow bouwt automatisch een nieuwe APK bij elke push naar main of bij het aanmaken van een tag. U kunt de workflow ook handmatig starten via het Actions-tabblad op GitHub.'
            },
            {
              q: ['auto', 'bevestig', 'confirm', 'automatisch'],
              a: 'Schakel "Automatisch sandbox-betalingen bevestigen" in bij Developer opties. Hierdoor worden alle sandbox-autorisaties automatisch goedgekeurd zonder handmatige stap.'
            },
            {
              q: ['factuur', 'invoice', 'betaling'],
              a: 'Maak facturen aan via /wallet → "Facturen en betalingen". Een factuur start een betaalintentie die u in de sandbox handmatig bevestigt.'
            },
            {
              q: ['reset', 'verwijder', 'leeg'],
              a: 'Reset de sandbox wallet via de knop "Wallet resetten" in dit paneel of via /wallet. Alle gegevens (saldo, transacties, facturen) worden verwijderd.'
            },
            {
              q: ['status', 'api', 'endpoint'],
              a: 'De sandbox API heeft de volgende endpoints: GET /wallet/api/status, GET /wallet/api/invoices, POST /wallet/api/invoices, POST /wallet/api/invoices/:id/pay, POST /wallet/api/wallet/bank-account, GET /wallet/api/approvals, POST /wallet/api/intents/:id/confirm. Bekijk GET /sandbox/api/keys voor uw API-sleutels.'
            },
          ];

          function findAnswer(question) {
            var q = question.toLowerCase();
            var best = null, bestScore = 0;
            knowledge.forEach(function (item) {
              var score = 0;
              item.q.forEach(function (kw) { if (q.includes(kw)) score++; });
              if (score > bestScore) { bestScore = score; best = item.a; }
            });
            return best || 'Ik weet het antwoord op uw vraag niet precies. Probeer sleutelwoorden zoals: api-sleutel, wallet, tegoed, apk, top-up, factuur, of status.';
          }

          var log = document.getElementById('chatLog');
          var input = document.getElementById('chatInput');
          var btn = document.getElementById('chatSend');

          function sendMessage() {
            var text = input.value.trim();
            if (!text) return;
            var userDiv = document.createElement('div');
            userDiv.className = 'chat-msg chat-user';
            userDiv.textContent = text;
            log.appendChild(userDiv);
            input.value = '';

            setTimeout(function () {
              var botDiv = document.createElement('div');
              botDiv.className = 'chat-msg chat-bot';
              botDiv.textContent = findAnswer(text);
              log.appendChild(botDiv);
              log.scrollTop = log.scrollHeight;
            }, 350);
            log.scrollTop = log.scrollHeight;
          }

          btn.addEventListener('click', sendMessage);
          input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') sendMessage();
          });
        })();
      </script>
    </section>
  `;
}

function renderApiDocs() {
  return `
    <section class="wallet-card wallet-info-card">
      <h2>📖 API documentatie</h2>
      <ul class="wallet-rules" style="font-size:.88rem;">
        <li><code>GET /wallet/api/status</code> – Wallet status &amp; saldo</li>
        <li><code>GET /wallet/api/invoices</code> – Alle facturen</li>
        <li><code>POST /wallet/api/invoices</code> – Factuur aanmaken</li>
        <li><code>POST /wallet/api/invoices/:id/pay</code> – Factuur betalen</li>
        <li><code>POST /wallet/api/wallet/bank-account</code> – IBAN koppelen</li>
        <li><code>GET /wallet/api/approvals</code> – Goedkeuringsrapport</li>
        <li><code>POST /wallet/api/intents/:id/confirm</code> – Intent bevestigen</li>
        <li><code>GET /sandbox/api/keys</code> – API-sleutels (gemaskeerd)</li>
        <li><code>GET /api/version</code> – App versie &amp; APK-link</li>
      </ul>
      <div style="margin-top:1rem">
        <a href="/wallet/api/status" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-small">📤 API status</a>
        <a href="/wallet/api/approvals" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-small" style="margin-left:.5rem">📋 Goedkeuringen</a>
      </div>
    </section>
  `;
}

function renderSandboxStatus(sandbox, payment) {
  const keyCount = (sandbox.apiKeys || []).length;
  const opts = sandbox.devOptions || {};
  const hasWallet = Boolean(payment && payment.wallet);
  return `
    <section class="wallet-card wallet-info-card">
      <h2>📊 Sandbox status</h2>
      <div class="routing-stats-grid" style="grid-template-columns:1fr 1fr;margin-bottom:.75rem;">
        <div class="stat-card">
          <div class="stat-value">${keyCount}</div>
          <div class="stat-label">API-sleutels</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${hasWallet ? '✅' : '⚠️'}</div>
          <div class="stat-label">Wallet</div>
        </div>
      </div>
      <ul class="wallet-rules" style="font-size:.88rem;">
        <li>API-sleutel vereist: <strong>${opts.requireApiKey ? 'Ja' : 'Nee'}</strong></li>
        <li>Auto-bevestigen: <strong>${opts.autoConfirm ? 'Aan' : 'Uit'}</strong></li>
        <li>Log-niveau: <strong>${opts.logLevel || 'info'}</strong></li>
      </ul>
    </section>
  `;
}

module.exports = router;
