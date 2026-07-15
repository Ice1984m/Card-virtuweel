'use strict';

/**
 * Multi-hop Privacy Relay – Bridge Registry & Dispatch Router
 *
 * Routes:
 *   GET  /bridges           – publiek overzichtsdashboard + testformulier
 *   POST /bridges/dispatch  – verzend pakket via onion relay-keten
 *   GET  /bridges/events    – Server-Sent Events (SSE) live relay-stream
 */

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { layout } = require('./layout');
const { readJson, writeJson, escHtml } = require('./helpers');
const { generateKeypair, buildOnionPacket, decryptLayer, sha256, merkleRoot } = require('./onion');

const router = express.Router();

const BRIDGES_FILE = path.join(__dirname, '../data/bridges.json');
const LOG_FILE = path.join(__dirname, '../data/routing-log.json');

const BRIDGE_DEFS = [
  { alias: 'Alpha',   region: 'NL-West'     },
  { alias: 'Beta',    region: 'NL-Oost'     },
  { alias: 'Gamma',   region: 'NL-Zuid'     },
  { alias: 'Delta',   region: 'BE-Brussel'  },
  { alias: 'Epsilon', region: 'DE-West'     },
];

// SSE-clientverbindingen
const sseClients = new Set();

// ─── Bridge-initialisatie ──────────────────────────────────────────────────────

/**
 * Laad bestaande bridges of genereer nieuwe EC-sleutelparen.
 * Privésleutels worden opgeslagen in data/bridges.json – uitsluitend demo-doeleinden.
 * In productie beheert elke node zijn eigen sleutel afzonderlijk.
 */
function initBridges() {
  let stored = readJson(BRIDGES_FILE);
  if (!Array.isArray(stored)) stored = [];

  const indexedStored = Object.fromEntries(stored.map(b => [b.alias, b]));
  let changed = false;

  const bridges = BRIDGE_DEFS.map(({ alias, region }) => {
    const existing = indexedStored[alias];
    if (existing && existing.publicKey && existing.privateKey) return existing;
    changed = true;
    const { privateKey, publicKey } = generateKeypair();
    return {
      id: `bridge-${alias.toLowerCase()}`,
      alias,
      region,
      publicKey,
      privateKey,
      stats: { packetsRelayed: 0, startedAt: new Date().toISOString() },
    };
  });

  if (changed) writeJson(BRIDGES_FILE, bridges);
  return bridges;
}

const bridges = initBridges();

// ─── Hulpfuncties ────────────────────────────────────────────────────────────

function selectHops(n) {
  return [...bridges].sort(() => Math.random() - 0.5).slice(0, n);
}

function broadcastSse(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(msg); } catch (_) { sseClients.delete(client); }
  }
}

// ─── GET /bridges ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const log = readJson(LOG_FILE);
  const logRoot = merkleRoot(log.map(e => e.packetId + e.timestamp));
  const recentLog = log.slice(-10).reverse();

  const bridgeRows = bridges.map(b => `
    <tr>
      <td><strong>${escHtml(b.alias)}</strong></td>
      <td><span class="badge badge-approved">${escHtml(b.region)}</span></td>
      <td>${b.stats.packetsRelayed}</td>
      <td><span class="badge badge-approved">Online</span></td>
      <td><code class="mono">${sha256(b.publicKey).slice(0, 20)}…</code></td>
    </tr>`).join('');

  const logRows = recentLog.length === 0
    ? '<tr><td colspan="5" class="empty">Nog geen pakketten gerouteerd.</td></tr>'
    : recentLog.map(e => `
      <tr>
        <td><code class="mono">${escHtml(e.packetId.slice(0, 8))}…</code></td>
        <td>${escHtml(e.hops.join(' → '))}</td>
        <td>${escHtml(String(e.payloadSize))} bytes</td>
        <td>${new Date(e.timestamp).toLocaleString('nl-NL')}</td>
        <td><code class="mono">${escHtml(e.packetHash.slice(0, 20))}…</code></td>
      </tr>`).join('');

  const flash = req.query.flash
    ? `<div class="flash">${escHtml(req.query.flash)}</div>`
    : '';

  res.send(layout('Privacy Relay – Bruggen', `
    <div class="page-header">
      <h1>🔗 Multi-hop Privacy Relay</h1>
      <a href="/admin/routing" class="btn btn-secondary">📊 Admin-dashboard</a>
    </div>
    ${flash}

    <div class="demo-notice">
      ⚠️ <strong>Demo modus</strong> – Alle ${bridges.length} relay-nodes draaien lokaal op één server.
      In productie zou elke node een aparte server met eigen sleutel zijn.
      Encryptie: AES-256-GCM + ephemeral ECDH P-256 per hop (Sphinx-achtig formaat).
    </div>

    <section class="admin-section">
      <h2>🌐 Actieve relay-nodes <span class="count-badge">${bridges.length}</span></h2>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alias</th>
              <th>Regio</th>
              <th>Pakketten gerouteerd</th>
              <th>Status</th>
              <th>Publieke-sleutel vingerafdruk</th>
            </tr>
          </thead>
          <tbody>${bridgeRows}</tbody>
        </table>
      </div>
    </section>

    <section class="admin-section">
      <h2>📤 Test: verstuur pakket via relay-keten</h2>
      <form method="POST" action="/bridges/dispatch" class="form-card">
        <div class="form-group">
          <label for="payload">Pakket-inhoud (bericht)</label>
          <textarea id="payload" name="payload" rows="3"
            placeholder="Typ hier een testbericht…" required></textarea>
        </div>
        <div class="form-group">
          <label for="hops">Aantal relay-hops (1–5)</label>
          <input id="hops" name="hops" type="number" min="1" max="5" value="3">
        </div>
        <div class="form-actions">
          <button type="submit" class="btn">🚀 Verzend via relay-keten</button>
        </div>
      </form>
    </section>

    <section class="admin-section">
      <h2>📋 Transparantie-log <span class="count-badge">${log.length}</span></h2>
      <p class="merkle-info">
        Merkle-root van alle ${log.length} pakketten:&ensp;<code class="mono">${escHtml(logRoot)}</code>
      </p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Pakket-ID</th>
              <th>Route (alias)</th>
              <th>Payload-grootte</th>
              <th>Tijdstip</th>
              <th>Pakket-hash (SHA-256)</th>
            </tr>
          </thead>
          <tbody>${logRows}</tbody>
        </table>
      </div>
      ${log.length > 10 ? `<p style="margin-top:.5rem;color:var(--muted);font-size:.88rem">Toont de laatste 10 van ${log.length} pakketten. Zie <a href="/admin/routing">Admin-dashboard</a> voor volledig log.</p>` : ''}
    </section>

    <section class="admin-section">
      <h2>📡 Live relay-events</h2>
      <div id="sse-status" class="sse-status">⏳ Verbinden met event-stream…</div>
      <div id="sse-feed" class="sse-feed"></div>
    </section>

    <script>
      (function () {
        var feed = document.getElementById('sse-feed');
        var status = document.getElementById('sse-status');
        var es = new EventSource('/bridges/events');
        es.onopen = function () {
          status.textContent = '🟢 Verbonden – wachten op relay-events…';
        };
        es.addEventListener('relay', function (e) {
          var d = JSON.parse(e.data);
          var row = document.createElement('div');
          row.className = 'sse-row';
          row.innerHTML =
            '<span class="sse-time">' + new Date(d.timestamp).toLocaleTimeString('nl-NL') + '</span>' +
            ' <span class="sse-packet">📦 ' + d.packetId.slice(0, 8) + '…</span>' +
            ' via <span class="sse-hops">' + d.hops.join(' → ') + '</span>';
          feed.prepend(row);
          if (feed.children.length > 20) feed.removeChild(feed.lastChild);
        });
        es.onerror = function () {
          status.textContent = '🔴 Verbinding verbroken – herverbinden…';
        };
      }());
    </script>
  `));
});

// ─── POST /bridges/dispatch ───────────────────────────────────────────────────

router.post('/dispatch', (req, res) => {
  const rawPayload = (req.body.payload || '').trim();
  if (!rawPayload) {
    return res.redirect('/bridges?flash=Pakket-inhoud+is+verplicht');
  }

  const numHops = Math.min(5, Math.max(1, parseInt(req.body.hops, 10) || 3));
  const selectedHops = selectHops(numHops);
  const pubKeys = selectedHops.map(b => b.publicKey);

  // Bouw onion-pakket (N versleutelde lagen)
  const onionPacket = buildOnionPacket(rawPayload, pubKeys);
  const encryptedSize = onionPacket.length;
  const packetHash = sha256(onionPacket);
  const packetId = uuidv4();

  // Simuleer relay: schil lagen af per node
  const hopTrace = [];
  let current = onionPacket;
  for (const bridge of selectedHops) {
    current = decryptLayer(current, bridge.privateKey);
    bridge.stats.packetsRelayed += 1;
    hopTrace.push(bridge.alias);
  }
  const deliveredPayload = current.toString('utf8');

  // Sla bijgewerkte stats op
  writeJson(BRIDGES_FILE, bridges);

  // Voeg toe aan transparantie-log
  const log = readJson(LOG_FILE);
  const entry = {
    packetId,
    hops: hopTrace,
    payloadSize: Buffer.byteLength(rawPayload, 'utf8'),
    encryptedSize,
    packetHash,
    timestamp: new Date().toISOString(),
  };
  log.push(entry);
  writeJson(LOG_FILE, log);

  // Stuur SSE-event naar alle verbonden clients
  broadcastSse('relay', { packetId, hops: hopTrace, timestamp: entry.timestamp });

  // Nieuw Merkle-root na toevoeging
  const newRoot = merkleRoot(log.map(e => e.packetId + e.timestamp));

  const hopHtml = [
    '<div class="hop hop-origin">📤 Afzender</div>',
    ...hopTrace.map(alias =>
      `<div class="hop-arrow">→</div><div class="hop hop-relay">${escHtml(alias)}</div>`
    ),
    '<div class="hop-arrow">→</div>',
    '<div class="hop hop-dest">📥 Ontvanger</div>',
  ].join('');

  res.send(layout('Relay geslaagd', `
    <div class="page-header">
      <a href="/bridges" class="btn btn-secondary">← Terug naar bruggen</a>
    </div>
    <div class="relay-result">
      <h1>✅ Pakket succesvol gerouteerd via ${numHops} hop${numHops !== 1 ? 's' : ''}</h1>

      <div class="relay-path">
        <h3>🛤️ Routing-pad</h3>
        <div class="hop-chain">${hopHtml}</div>
        <p class="hop-info">
          Elke node ontsleutelde slechts één laag en zag alleen de <em>volgende</em> bestemming –
          <strong>niemand kent zowel afzender als ontvanger tegelijk.</strong>
        </p>
      </div>

      <div class="relay-details">
        <div class="detail-item">
          <span class="detail-label">Pakket-ID</span>
          <code class="mono">${escHtml(packetId)}</code>
        </div>
        <div class="detail-item">
          <span class="detail-label">Versleutelingslagen</span>
          <span>${numHops}× AES-256-GCM + ephemeral ECDH P-256</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Originele payload</span>
          <span>${Buffer.byteLength(rawPayload, 'utf8')} bytes</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Versleuteld pakket</span>
          <span>${encryptedSize} bytes</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Ontvangen inhoud</span>
          <span>${escHtml(deliveredPayload)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Pakket-hash (SHA-256)</span>
          <code class="mono">${escHtml(packetHash)}</code>
        </div>
        <div class="detail-item">
          <span class="detail-label">Transparantie-log Merkle-root</span>
          <code class="mono">${escHtml(newRoot)}</code>
        </div>
      </div>
    </div>
  `));
});

// ─── GET /bridges/events (SSE) ───────────────────────────────────────────────

router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Stuur direct een verbindings-event
  res.write(`event: connected\ndata: {"status":"ok"}\n\n`);

  // Keep-alive ping elke 20 seconden
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { clearInterval(keepAlive); }
  }, 20000);

  sseClients.add(res);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

module.exports = router;
