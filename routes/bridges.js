'use strict';

/**
 * Multi-hop Privacy Relay – Bridge Registry & Dispatch Router
 *
 * Routes:
 *   GET  /bridges              – publiek overzichtsdashboard + testformulier (incl. dispatch-resultaat)
 *   POST /bridges/dispatch     – verzend pakket via onion relay-keten → redirect naar GET /bridges?dispatched=1
 *   GET  /bridges/events       – Server-Sent Events (SSE) live relay-stream
 */

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { layout } = require('./layout');
const { readJson, writeJson, escHtml } = require('./helpers');
const { generateKeypair, buildOnionPacket, decryptLayer, sha256, merkleRoot, MERKLE_SEPARATOR } = require('./onion');

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

// Hop-limieten
const MIN_HOPS = 1;
const MAX_HOPS = 5;
const DEFAULT_HOPS = 3;

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

/** Fisher-Yates shuffle voor onbevooroordeelde willekeurige hop-selectie. */
function fisherYatesShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function selectHops(n) {
  const hops = fisherYatesShuffle(bridges).slice(0, n);
  // Valideer dat alle geselecteerde nodes een geldige publieke sleutel hebben
  if (hops.some(b => !b.publicKey)) {
    throw new Error('Geselecteerde relay-node mist een publieke sleutel');
  }
  return hops;
}

function broadcastSse(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch (err) {
      console.error('[SSE] Fout bij schrijven naar client, verbinding verwijderd:', err.message);
      sseClients.delete(client);
    }
  }
}

// ─── GET /bridges ─────────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  const log = readJson(LOG_FILE);
  const logRoot = log.length > 0
    ? log[log.length - 1].cumulativeMerkleRoot
    : merkleRoot([]);
  const recentLog = log.slice(-10).reverse();

  // Succesresultaat: toon laatste log-entry als ?dispatched=1 aanwezig is
  // Data komt uitsluitend uit het log-bestand (server-gegenereerde metadata)
  let dispatchBanner = '';
  if (req.query.dispatched === '1' && log.length > 0) {
    const last = log[log.length - 1];
    const hopChain = ['Afzender', ...last.hops, 'Ontvanger'].join(' → ');
    const status = last.deliveredOk !== false
      ? '<span class="badge badge-approved">✅ Correct afgeleverd</span>'
      : '<span class="badge badge-rejected">⚠️ Afwijking</span>';
    dispatchBanner = `
      <div class="relay-result" style="margin-bottom:1.5rem">
        <h2 style="color:var(--success);margin-bottom:1rem">✅ Pakket succesvol gerouteerd via ${last.hops.length} hop${last.hops.length !== 1 ? 's' : ''}</h2>
        <div class="relay-path" style="margin-bottom:1rem">
          <strong>Route:</strong> ${escHtml(hopChain)}
        </div>
        <div class="relay-details">
          <div class="detail-item">
            <span class="detail-label">Pakket-ID</span>
            <code class="mono">${escHtml(last.packetId)}</code>
          </div>
          <div class="detail-item">
            <span class="detail-label">Payload / versleuteld</span>
            <span>${last.payloadSize} / ${last.encryptedSize} bytes</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Aflevering</span>
            ${status}
          </div>
          <div class="detail-item">
            <span class="detail-label">Pakket-hash (SHA-256)</span>
            <code class="mono">${escHtml(last.packetHash)}</code>
          </div>
          <div class="detail-item">
            <span class="detail-label">Merkle-root</span>
            <code class="mono">${escHtml(last.cumulativeMerkleRoot)}</code>
          </div>
        </div>
      </div>`;
  }

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
    ${dispatchBanner}

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
          <label for="hops">Aantal relay-hops (${MIN_HOPS}–${MAX_HOPS})</label>
          <input id="hops" name="hops" type="number" min="${MIN_HOPS}" max="${MAX_HOPS}" value="${DEFAULT_HOPS}">
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
          // Gebruik textContent/createTextNode om XSS te voorkomen
          var timeSpan = document.createElement('span');
          timeSpan.className = 'sse-time';
          timeSpan.textContent = new Date(d.timestamp).toLocaleTimeString('nl-NL');
          var packetSpan = document.createElement('span');
          packetSpan.className = 'sse-packet';
          packetSpan.textContent = '📦 ' + d.packetId.slice(0, 8) + '…';
          var hopsSpan = document.createElement('span');
          hopsSpan.className = 'sse-hops';
          hopsSpan.textContent = d.hops.join(' → ');
          row.appendChild(timeSpan);
          row.appendChild(document.createTextNode(' via '));
          row.appendChild(packetSpan);
          row.appendChild(document.createTextNode(' '));
          row.appendChild(hopsSpan);
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

  const numHops = Math.min(MAX_HOPS, Math.max(MIN_HOPS, parseInt(req.body.hops, 10) || DEFAULT_HOPS));
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
  const deliveredOk = current.toString('utf8') === rawPayload;

  // Sla bijgewerkte stats op
  writeJson(BRIDGES_FILE, bridges);

  // Voeg toe aan transparantie-log (inclusief cumulatieve Merkle-root voor O(1) admin lookup)
  const log = readJson(LOG_FILE);
  const timestamp = new Date().toISOString();
  const prevRoot = log.length > 0 ? log[log.length - 1].cumulativeMerkleRoot : merkleRoot([]);
  const newRoot = merkleRoot([prevRoot, sha256(`${packetId}${MERKLE_SEPARATOR}${timestamp}`)]);
  const entry = {
    packetId,
    hops: hopTrace,
    payloadSize: Buffer.byteLength(rawPayload, 'utf8'),
    encryptedSize,
    packetHash,
    deliveredOk,
    cumulativeMerkleRoot: newRoot,
    timestamp,
  };
  log.push(entry);
  writeJson(LOG_FILE, log);

  // Stuur SSE-event naar alle verbonden clients
  broadcastSse('relay', { packetId, hops: hopTrace, timestamp });

  // PRG-redirect naar overzichtspagina; resultaat wordt getoond vanuit log-bestand
  res.redirect('/bridges?dispatched=1');
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

