'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');

const { layout } = require('./routes/layout');
const { safeExternalUrl } = require('./routes/helpers');
const certificatesRouter = require('./routes/certificates');
const postsRouter = require('./routes/posts');
const adminRouter = require('./routes/admin');
const browserRouter = require('./routes/browser');
const bridgesRouter = require('./routes/bridges');
const apkRouter = require('./routes/apk');

const app = express();
const PORT = process.env.PORT || 4242;
const ENV_APK_DOWNLOAD_URL = process.env.APK_DOWNLOAD_URL || '';
const CONFIGURED_APK_DOWNLOAD_URL = safeExternalUrl(ENV_APK_DOWNLOAD_URL);

if (ENV_APK_DOWNLOAD_URL && !CONFIGURED_APK_DOWNLOAD_URL) {
  console.warn('Ongeldige APK_DOWNLOAD_URL in omgeving, fallback naar standaard APK-link.');
}

// Expose configured APK URL to routers via app.locals
app.locals.APK_DOWNLOAD_URL = CONFIGURED_APK_DOWNLOAD_URL;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/certificates', certificatesRouter);
app.use('/posts', postsRouter);
app.use('/admin', adminRouter);
app.use('/browser', browserRouter);
app.use('/bridges', bridgesRouter);
app.use('/apk', apkRouter);

app.get('/', (req, res) => {
  res.send(homePage());
});

app.get('/install', (req, res) => {
  res.redirect(301, '/apk');
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
        <a href="/apk" class="card">
          <span class="icon">📲</span>
          <h2>Download APK</h2>
          <p>Installeer de Card-virtuweel app direct op uw Android-apparaat.</p>
        </a>
        <a href="/apk" class="btn btn-activate">⬇ Download APK</a>
      </div>
    </div>
  `);
}

function renderInstallPanel(compact) {
  return `
    <section class="install-panel${compact ? ' install-panel-compact' : ''}">
      <div class="install-panel-header">
        <div>
          <h2>📦 Android app installeren</h2>
          <p>Download de APK direct of gebruik de bestaande PWA-installatie via Chrome.</p>
        </div>
        ${compact ? '<a href="/apk" class="btn btn-secondary btn-small">Download APK</a>' : ''}
      </div>
      <div class="install-actions">
        <a href="/apk" class="btn btn-install">⬇ Download APK</a>
      </div>
      <p class="install-hint">Open de link op uw Android-apparaat en bevestig daarna de installatie van het APK-bestand.</p>
      <ol class="install-steps">
        <li>Open deze pagina op uw Android-telefoon.</li>
        <li>Tik op "Download APK" en open het gedownload bestand.</li>
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

module.exports = app;
