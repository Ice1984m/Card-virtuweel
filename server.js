'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const https = require('https');
const http = require('http');

const { layout } = require('./routes/layout');
const { escHtml, safeExternalUrl } = require('./routes/helpers');
const certificatesRouter = require('./routes/certificates');
const postsRouter = require('./routes/posts');
const adminRouter = require('./routes/admin');
const browserRouter = require('./routes/browser');
const bridgesRouter = require('./routes/bridges');
const walletRouter = require('./routes/wallet');

const app = express();
const PORT = process.env.PORT || 4242;
const README_URL = 'https://github.com/Ice1984m/Card-virtuweel#readme';
const DEFAULT_APK_DOWNLOAD_URL = 'https://github.com/Ice1984m/Card-virtuweel/releases/download/card-virtuweel-apk/Card-virtuweel.apk';
const ENV_APK_DOWNLOAD_URL = process.env.APK_DOWNLOAD_URL || '';
const CONFIGURED_APK_DOWNLOAD_URL = safeExternalUrl(ENV_APK_DOWNLOAD_URL);
const APK_DOWNLOAD_URL = CONFIGURED_APK_DOWNLOAD_URL || DEFAULT_APK_DOWNLOAD_URL;
const MAX_REDIRECT_DEPTH = 5;
const REQUEST_TIMEOUT_MS = 5000;
const SERVER_USER_AGENT = 'Card-virtuweel-server';

if (ENV_APK_DOWNLOAD_URL && !CONFIGURED_APK_DOWNLOAD_URL) {
  console.warn('Ongeldige APK_DOWNLOAD_URL in omgeving, fallback naar standaard APK-link.');
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/certificates', certificatesRouter);
app.use('/posts', postsRouter);
app.use('/admin', adminRouter);
app.use('/browser', browserRouter);
app.use('/bridges', bridgesRouter);
app.use('/wallet', walletRouter);

app.get('/', (req, res) => {
  res.send(homePage());
});

app.get('/install', (req, res) => {
  res.send(installPage());
});

app.get('/download/apk', (req, res) => {
  const validatedDownloadUrl = safeExternalUrl(APK_DOWNLOAD_URL);
  if (!validatedDownloadUrl) {
    res.status(500).send(apkConfigErrorPage());
    return;
  }
  res.redirect(302, validatedDownloadUrl);
});

app.use((req, res) => {
  res.status(404).send(notFoundPage());
});

app.listen(PORT, () => {
  console.log(`Card-virtuweel draait op http://localhost:${PORT}`);
});

function homePage() {
  return layout('Card-virtuweel – Home', `
    <div class="hero">
      <h1>Card-virtuweel</h1>
      <p class="subtitle">Beheer certificaten, licenties en posts met goedkeuringsproces.</p>
    </div>
    ${renderInstallPanel(true)}
    <div class="card-grid">
      <div class="card-wrapper">
        <a href="/certificates" class="card">
          <span class="icon">📄</span>
          <h2>Certificaten &amp; Licenties</h2>
          <p>Beheer en upload uw certificaten en licenties.</p>
        </a>
        <a href="/certificates/new" class="btn btn-activate">▶ Activeer</a>
      </div>
      <div class="card-wrapper">
        <a href="/posts" class="card">
          <span class="icon">📋</span>
          <h2>Posts &amp; Advertenties</h2>
          <p>Maak een post aan en wacht op goedkeuring.</p>
        </a>
        <a href="/posts/new" class="btn btn-activate">▶ Activeer</a>
      </div>
      <div class="card-wrapper">
        <a href="/admin" class="card">
          <span class="icon">🔑</span>
          <h2>Admin Paneel</h2>
          <p>Keur certificaten en posts goed of af.</p>
        </a>
        <a href="/admin" class="btn btn-activate">▶ Activeer</a>
      </div>
      <div class="card-wrapper">
        <a href="/wallet" class="card">
          <span class="icon">💳</span>
          <h2>Sandbox Wallet</h2>
          <p>Vraag een prepaid testkaart aan, laad veilig op en bekijk transacties.</p>
        </a>
        <a href="/wallet" class="btn btn-activate">▶ Open wallet</a>
      </div>
      <div class="card-wrapper">
        <a href="/browser" class="card">
          <span class="icon">🌐</span>
          <h2>Internet Browser</h2>
          <p>Zoek op internet en koop producten online.</p>
        </a>
        <a href="/browser" class="btn btn-activate">▶ Activeer</a>
      </div>
      <div class="card-wrapper">
        <a href="/bridges" class="card">
          <span class="icon">🔗</span>
          <h2>Privacy Relay</h2>
          <p>Multi-hop onion-routing met AES-256-GCM encryptie en Merkle-transparantie.</p>
        </a>
        <a href="/bridges" class="btn btn-activate">▶ Activeer</a>
      </div>
      <div class="card-wrapper">
        <a href="/download/apk" class="card">
          <span class="icon">📲</span>
          <h2>Download APK</h2>
          <p>Installeer de Card-virtuweel app direct op uw Android-apparaat.</p>
        </a>
        <a href="/download/apk" class="btn btn-activate">⬇ APK downloaden</a>
        <p class="mono">APK URL: <a href="${APK_DOWNLOAD_URL}" target="_blank" rel="noopener noreferrer">${APK_DOWNLOAD_URL}</a></p>
        <p class="mono">README URL: <a href="${README_URL}" target="_blank" rel="noopener noreferrer">${README_URL}</a></p>
      </div>
    </div>
  `);
}

function installPage() {
  return layout('Card-virtuweel – App installeren', `
    <div class="page-header">
      <h1>📲 App installeren</h1>
      <a href="/" class="btn btn-secondary">← Terug naar home</a>
    </div>
    ${renderInstallPanel(false)}
  `);
}

function renderInstallPanel(compact) {
  const installStep = APK_DOWNLOAD_URL
    ? 'Tik op "Download APK" en open het gedownload bestand.'
    : 'Gebruik "Toevoegen aan startscherm" in Chrome zolang er nog geen APK-link is ingesteld.';
  const downloadBlock = APK_DOWNLOAD_URL
    ? `
        <div class="install-actions">
          <a href="/download/apk" class="btn btn-install">⬇ APK downloaden</a>
        </div>
        <p class="install-hint">Open de link op uw Android-apparaat en bevestig daarna de installatie van het APK-bestand.</p>
        <p class="install-link mono">${escHtml(APK_DOWNLOAD_URL)}</p>
      `
    : `
        <div class="install-fallback">
          <strong>Geen APK-link ingesteld.</strong>
          <p>Voeg <code>APK_DOWNLOAD_URL</code> toe aan de omgeving om hier een directe Android-download te tonen.</p>
        </div>
      `;

  return `
    <section class="install-panel${compact ? ' install-panel-compact' : ''}">
      <div class="install-panel-header">
        <div>
          <h2>📦 Android app installeren</h2>
          <p>Download de APK direct of gebruik de bestaande PWA-installatie via Chrome.</p>
        </div>
        ${compact ? '<a href="/install" class="btn btn-secondary btn-small">Installatie openen</a>' : ''}
      </div>
      ${downloadBlock}
      <ol class="install-steps">
        <li>Open deze pagina op uw Android-telefoon.</li>
        <li>${installStep}</li>
        <li>Sta installatie toe als Android om bevestiging vraagt.</li>
        <li>Open de app na installatie vanaf uw startscherm.</li>
      </ol>
      <p class="install-hint">PWA fallback: open de site in Chrome en kies menu ⋮ → "Toevoegen aan startscherm".</p>
    </section>
  `;
}

function notFoundPage() {
  return layout('Pagina niet gevonden', `
    <div class="hero">
      <h1>404 – Pagina niet gevonden</h1>
      <a href="/" class="btn">← Terug naar home</a>
    </div>
  `);
}

function apkNotFoundPage(status) {
  return layout('APK niet beschikbaar', `
    <div class="hero">
      <h1>📲 APK niet beschikbaar</h1>
      <p>De APK kon niet worden gevonden (HTTP ${status || '?'}).</p>
      <p>De APK-release is mogelijk nog niet gepubliceerd. Probeer het later opnieuw of installeer de app als PWA via Chrome.</p>
      <p class="mono">APK URL: <a href="${escHtml(APK_DOWNLOAD_URL)}" target="_blank" rel="noopener noreferrer">${escHtml(APK_DOWNLOAD_URL)}</a></p>
      <div style="margin-top:1.5rem">
        <a href="/install" class="btn">📦 Installatie-instructies</a>
        <a href="/" class="btn btn-secondary">← Terug naar home</a>
      </div>
    </div>
  `);
}

function apkConfigErrorPage() {
  return layout('APK download niet beschikbaar', `
    <div class="hero">
      <h1>⚠️ APK download tijdelijk niet beschikbaar</h1>
      <p>De APK-downloadlink is ongeldig geconfigureerd. Probeer het later opnieuw.</p>
      <div style="margin-top:1.5rem">
        <a href="/install" class="btn">📦 Installatie-instructies</a>
        <a href="/" class="btn btn-secondary">← Terug naar home</a>
      </div>
    </div>
  `);
}

function checkUrlHead(url, callback, depth) {
  if ((depth || 0) > MAX_REDIRECT_DEPTH) {
    callback(null);
    return;
  }
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      callback(null);
      return;
    }
    const lib = parsedUrl.protocol === 'https:' ? https : http;
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (parsedUrl.protocol === 'https:' ? 443 : 80);
    const req = lib.request(
      { method: 'HEAD', hostname: parsedUrl.hostname, port, path: parsedUrl.pathname + parsedUrl.search, headers: { 'User-Agent': SERVER_USER_AGENT } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let location;
          try {
            location = new URL(res.headers.location, url).toString();
          } catch (_) {
            callback(null);
            return;
          }
          checkUrlHead(location, callback, (depth || 0) + 1);
        } else {
          callback(res.statusCode);
        }
      }
    );
    req.on('error', (err) => {
      console.warn('[checkUrlHead] Request error for', url, err.message);
      callback(null);
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => { req.destroy(); callback(null); });
    req.end();
  } catch (_) {
    callback(null);
  }
}

module.exports = app;
