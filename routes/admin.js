'use strict';

const express = require('express');
const path = require('path');
const { layout } = require('./layout');
const { readJson, writeJson, formatPrice, escHtml } = require('./helpers');
const { readPaymentState, getGoLiveReadiness, injectSandboxCredit } = require('./paymentService');
const { sha256, merkleRoot } = require('./onion');

const router = express.Router();

const BRIDGES_FILE = path.join(__dirname, '../data/bridges.json');
const LOG_FILE = path.join(__dirname, '../data/routing-log.json');

const CERTS_FILE = path.join(__dirname, '../data/certificates.json');
const POSTS_FILE = path.join(__dirname, '../data/posts.json');

router.get('/', (req, res) => {
  const certs = readJson(CERTS_FILE);
  const posts = readJson(POSTS_FILE);
  const payments = readPaymentState();
  const goLiveReadiness = getGoLiveReadiness(payments);

  const pendingCerts = certs.filter(c => c.status === 'pending');
  const pendingPosts = posts.filter(p => p.status === 'pending_approval');
  const pendingTopUps = payments.topUpIntents.filter(entry => entry.status === 'pending_confirmation');
  const pendingPayments = payments.paymentIntents.filter(entry => entry.status === 'pending_confirmation');

  const certRows = pendingCerts.length === 0
    ? '<tr><td colspan="5" class="empty">Geen certificaten in behandeling.</td></tr>'
    : pendingCerts.map(c => `
      <tr>
        <td>${escHtml(c.type)}</td>
        <td>${escHtml(c.number)}</td>
        <td>${escHtml(c.issuer)}</td>
        <td>${escHtml(c.expiry)}</td>
        <td class="action-cell">
          <form method="POST" action="/admin/certificates/${escHtml(c.id)}/approve" style="display:inline;vertical-align:middle">
            <input type="number" name="reloadAmount" min="0" max="10000" step="0.01" placeholder="€ herladen" title="Optioneel: wallet herlaadbedrag bij goedkeuring" style="width:7rem;margin-right:.25rem;font-size:.85rem">
            <button class="btn btn-small btn-approve">✔ Goedkeuren</button>
          </form>
          <form method="POST" action="/admin/certificates/${escHtml(c.id)}/reject" style="display:inline">
            <button class="btn btn-small btn-reject">✖ Afwijzen</button>
          </form>
        </td>
      </tr>`).join('');

  const postRows = pendingPosts.length === 0
    ? '<tr><td colspan="4" class="empty">Geen posts in behandeling.</td></tr>'
    : pendingPosts.map(p => `
      <tr>
        <td><a href="/posts/${escHtml(p.id)}">${escHtml(p.title)}</a></td>
        <td>${escHtml(p.description).slice(0, 80)}${p.description.length > 80 ? '…' : ''}</td>
        <td>€${escHtml(formatPrice(p.price))}</td>
        <td class="action-cell">
          <form method="POST" action="/admin/posts/${escHtml(p.id)}/approve" style="display:inline">
            <button class="btn btn-small btn-approve">✔ Goedkeuren</button>
          </form>
          <form method="POST" action="/admin/posts/${escHtml(p.id)}/reject" style="display:inline">
            <button class="btn btn-small btn-reject">✖ Afwijzen</button>
          </form>
        </td>
      </tr>`).join('');

  const flash = req.query.flash
    ? `<div class="flash">${escHtml(req.query.flash)}</div>`
    : '';

  res.send(layout('Admin Paneel', `
    <div class="page-header">
      <h1>🔑 Admin Paneel</h1>
    </div>
    ${flash}

    <section class="admin-section">
      <h2>Certificaten in behandeling <span class="count-badge">${pendingCerts.length}</span></h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Nummer</th><th>Instantie</th><th>Vervaldatum</th><th>Acties</th></tr></thead>
          <tbody>${certRows}</tbody>
        </table>
      </div>
    </section>

    <section class="admin-section">
      <h2>Posts in behandeling <span class="count-badge">${pendingPosts.length}</span></h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Titel</th><th>Beschrijving</th><th>Prijs</th><th>Acties</th></tr></thead>
          <tbody>${postRows}</tbody>
        </table>
      </div>
    </section>

    <section class="admin-section">
      <h2>Overzicht alle certificaten</h2>
      ${allCertsTable(certs)}
    </section>

    <section class="admin-section">
      <h2>Overzicht alle posts</h2>
      ${allPostsTable(posts)}
    </section>

    <section class="admin-section">
      <h2>Sandbox wallet overzicht</h2>
      ${paymentSummary(payments, pendingTopUps.length, pendingPayments.length, goLiveReadiness)}
    </section>

    <section class="admin-section">
      <h2>Recente betaal-auditlog</h2>
      ${paymentAuditTable(payments.auditLog)}
    </section>
  `));
});

const CERT_STATUS_LABEL = { pending: 'In behandeling', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
const CERT_STATUS_CLASS = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
const POST_STATUS_LABEL = { pending_approval: 'Wacht op goedkeuring', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
const POST_STATUS_CLASS = { pending_approval: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };

function allCertsTable(certs) {
  if (!certs.length) return '<p class="empty">Geen certificaten.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Type</th><th>Nummer</th><th>Instantie</th><th>Vervaldatum</th><th>Status</th></tr></thead>
    <tbody>
      ${certs.map(c => `<tr>
        <td>${escHtml(c.type)}</td>
        <td>${escHtml(c.number)}</td>
        <td>${escHtml(c.issuer)}</td>
        <td>${escHtml(c.expiry)}</td>
        <td><span class="badge ${CERT_STATUS_CLASS[c.status] || ''}">${CERT_STATUS_LABEL[c.status] || escHtml(c.status)}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function allPostsTable(posts) {
  if (!posts.length) return '<p class="empty">Geen posts.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Titel</th><th>Prijs</th><th>Status</th></tr></thead>
    <tbody>
      ${posts.map(p => `<tr>
        <td><a href="/posts/${escHtml(p.id)}">${escHtml(p.title)}</a></td>
        <td>€${escHtml(formatPrice(p.price))}</td>
        <td><span class="badge ${POST_STATUS_CLASS[p.status] || ''}">${POST_STATUS_LABEL[p.status] || escHtml(p.status)}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function paymentSummary(payments, pendingTopUps, pendingPayments, goLiveReadiness) {
  if (!payments.wallet) {
    return '<p class="empty">Nog geen sandbox wallet aangemaakt.</p>';
  }

  return `
    <div class="routing-stats-grid">
      <div class="stat-card">
        <div class="stat-value">€${escHtml(formatPrice(payments.wallet.balance))}</div>
        <div class="stat-label">Beschikbaar saldo</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${pendingTopUps}</div>
        <div class="stat-label">Top-ups in behandeling</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${pendingPayments}</div>
        <div class="stat-label">Betalingen in behandeling</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${payments.transactions.length}</div>
        <div class="stat-label">Totaal transacties</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Kaarthouder</th><th>Kaart</th><th>Provider</th><th>Token</th><th>Status</th></tr></thead>
        <tbody>
          <tr>
            <td>${escHtml(payments.wallet.holderName)}</td>
            <td><code class="mono">${escHtml(payments.wallet.maskedPan)}</code></td>
            <td>${escHtml(payments.wallet.provider)}</td>
            <td><code class="mono">${escHtml(payments.wallet.providerCardToken)}</code></td>
            <td><span class="badge badge-approved">Sandbox actief</span></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="wallet-readiness-list" style="margin-top:1rem">
      <div class="wallet-readiness-item">
        <strong>${goLiveReadiness.canGoLive ? '✅' : '⚠️'} Live-goedkeuring</strong>
        <p>${goLiveReadiness.canGoLive ? 'Alle checks staan op groen.' : 'Externe productiegoedkeuring ontbreekt nog; gebruik /wallet/api/status voor API-controle.'}</p>
      </div>
    </div>
  `;
}

function paymentAuditTable(entries) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>Tijdstip</th><th>Type</th><th>Bericht</th></tr></thead>
    <tbody>
      ${entries.length ? entries.slice(0, 15).map((entry) => `<tr>
        <td>${escHtml(new Date(entry.timestamp).toLocaleString('nl-NL'))}</td>
        <td>${escHtml(entry.type)}</td>
        <td>${escHtml(entry.message)}</td>
      </tr>`).join('') : '<tr><td colspan="3" class="empty">Nog geen betaal-events.</td></tr>'}
    </tbody>
  </table></div>`;
}

router.post('/certificates/:id/approve', (req, res) => {
  const certs = readJson(CERTS_FILE);
  const cert = certs.find(c => c.id === req.params.id);
  if (cert) {
    cert.status = 'approved';
    writeJson(CERTS_FILE, certs);
  }
  const reloadAmount = Number.parseFloat(req.body.reloadAmount);
  if (cert && Number.isFinite(reloadAmount) && reloadAmount > 0) {
    try {
      injectSandboxCredit(reloadAmount);
      return res.redirect(`/admin?flash=Certificaat+goedgekeurd+en+€${reloadAmount.toFixed(2)}+aan+wallet+toegevoegd`);
    } catch (_) {
      // wallet may not be configured – silently skip credit injection
    }
  }
  res.redirect('/admin?flash=Certificaat+goedgekeurd');
});

router.post('/certificates/:id/reject', (req, res) => {
  const certs = readJson(CERTS_FILE);
  const cert = certs.find(c => c.id === req.params.id);
  if (cert) { cert.status = 'rejected'; writeJson(CERTS_FILE, certs); }
  res.redirect('/admin?flash=Certificaat+afgewezen');
});

router.post('/posts/:id/approve', (req, res) => {
  const posts = readJson(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (post) { post.status = 'approved'; writeJson(POSTS_FILE, posts); }
  res.redirect('/admin?flash=Post+goedgekeurd');
});

router.post('/posts/:id/reject', (req, res) => {
  const posts = readJson(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (post) { post.status = 'rejected'; writeJson(POSTS_FILE, posts); }
  res.redirect('/admin?flash=Post+afgewezen');
});

// ─── GET /admin/routing – transparantie-dashboard ────────────────────────────

router.get('/routing', (req, res) => {
  const log = readJson(LOG_FILE);
  const bridges = readJson(BRIDGES_FILE);

  // Gebruik de opgeslagen cumulatieve Merkle-root uit het laatste log-item (O(1))
  const logRoot = log.length > 0
    ? log[log.length - 1].cumulativeMerkleRoot
    : merkleRoot([]);
  const totalPackets = log.length;
  const totalHops = log.reduce((sum, e) => sum + (e.hops ? e.hops.length : 0), 0);

  const bridgeRows = !bridges.length
    ? '<tr><td colspan="5" class="empty">Nog geen bridges geïnitialiseerd. Ga naar <a href="/bridges">Routing</a>.</td></tr>'
    : bridges.map(b => {
        const keyFingerprint = b.publicKey ? sha256(b.publicKey) : '—';
        return `<tr>
          <td><strong>${escHtml(b.alias)}</strong></td>
          <td>${escHtml(b.region)}</td>
          <td>${b.stats ? b.stats.packetsRelayed : 0}</td>
          <td>${b.stats ? new Date(b.stats.startedAt).toLocaleString('nl-NL') : '—'}</td>
          <td><code class="mono">${keyFingerprint.slice(0, 24)}…</code></td>
        </tr>`;
      }).join('');

  // Gebruik de vooraf berekende cumulatieve Merkle-root per log-item (O(n))
  const logRows = !log.length
    ? '<tr><td colspan="6" class="empty">Geen pakketten gerouteerd.</td></tr>'
    : [...log].reverse().map(e => `<tr>
        <td><code class="mono">${escHtml(e.packetId.slice(0, 10))}…</code></td>
        <td>${escHtml((e.hops || []).join(' → '))}</td>
        <td>${escHtml(String(e.payloadSize))} / ${escHtml(String(e.encryptedSize || '—'))} bytes</td>
        <td>${new Date(e.timestamp).toLocaleString('nl-NL')}</td>
        <td><code class="mono">${escHtml(e.packetHash ? e.packetHash.slice(0, 16) : '—')}…</code></td>
        <td><code class="mono">${escHtml(e.cumulativeMerkleRoot ? e.cumulativeMerkleRoot.slice(0, 16) : '—')}…</code></td>
      </tr>`).join('');

  res.send(layout('Admin – Routing Dashboard', `
    <div class="page-header">
      <h1>📊 Routing Transparantie-dashboard</h1>
      <a href="/bridges" class="btn btn-secondary">← Naar relay-bruggen</a>
    </div>

    <div class="routing-stats-grid">
      <div class="stat-card">
        <div class="stat-value">${totalPackets}</div>
        <div class="stat-label">Pakketten gerouteerd</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${bridges.length}</div>
        <div class="stat-label">Actieve relay-nodes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalHops}</div>
        <div class="stat-label">Totale relay-hops</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalPackets > 0 ? (totalHops / totalPackets).toFixed(1) : '0'}</div>
        <div class="stat-label">Gemiddelde hops/pakket</div>
      </div>
    </div>

    <section class="admin-section">
      <h2>🔐 Merkle-boom verificatie</h2>
      <div class="merkle-verify-box">
        <p>De Merkle-root van het volledige routing-log garandeert dat geen enkel log-item achteraf is gewijzigd.</p>
        <div class="merkle-root-display">
          <span class="merkle-label">Huidige Merkle-root (${totalPackets} pakketten):</span>
          <code class="mono merkle-root-value">${escHtml(logRoot)}</code>
        </div>
      </div>
    </section>

    <section class="admin-section">
      <h2>🌐 Relay-node status <span class="count-badge">${bridges.length}</span></h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alias</th>
              <th>Regio</th>
              <th>Pakketten gerouteerd</th>
              <th>Actief sinds</th>
              <th>Publieke-sleutel vingerafdruk (SHA-256)</th>
            </tr>
          </thead>
          <tbody>${bridgeRows}</tbody>
        </table>
      </div>
    </section>

    <section class="admin-section">
      <h2>📋 Volledig routing-log <span class="count-badge">${totalPackets}</span></h2>
      <p style="color:var(--muted);font-size:.88rem;margin-bottom:.75rem">
        Payload-inhoud wordt nooit gelogd – alleen anonieme metadata en cryptografische bewijzen.
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pakket-ID</th>
              <th>Route (alias)</th>
              <th>Payload / versleuteld (bytes)</th>
              <th>Tijdstip</th>
              <th>Pakket-hash</th>
              <th>Cumulatieve Merkle-root</th>
            </tr>
          </thead>
          <tbody>${logRows}</tbody>
        </table>
      </div>
    </section>
  `));
});

module.exports = router;
