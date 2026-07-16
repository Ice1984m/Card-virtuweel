'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');

const { layout } = require('./routes/layout');
const { escHtml, safeExternalUrl } = require('./routes/helpers');
const certificatesRouter = require('./routes/certificates');
const postsRouter = require('./routes/posts');
const adminRouter = require('./routes/admin');
const browserRouter = require('./routes/browser');
const bridgesRouter = require('./routes/bridges');

const app = express();
const PORT = process.env.PORT || 4242;
const README_URL = 'https://github.com/Ice1984m/Card-virtuweel#readme';
const DEFAULT_APK_DOWNLOAD_URL = 'https://github.com/Ice1984m/Card-virtuweel/releases/latest/download/Card-virtuweel.apk';
const ENV_APK_DOWNLOAD_URL = process.env.APK_DOWNLOAD_URL || '';
const CONFIGURED_APK_DOWNLOAD_URL = safeExternalUrl(ENV_APK_DOWNLOAD_URL);
const APK_DOWNLOAD_URL = CONFIGURED_APK_DOWNLOAD_URL || DEFAULT_APK_DOWNLOAD_URL;

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

app.get('/', (req, res) => {
  res.send(homePage());
});

app.get('/install', (req, res) => {
  res.send(installPage());
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
        <a href="/install" class="card">
          <span class="icon">📲</span>
          <h2>App installeren</h2>
          <p>Installeer de Card-virtuweel app op uw Android-apparaat of als PWA.</p>
        </a>
        <button class="btn btn-activate btn-pwa-install" style="display:none;">📲 Installeer App</button>
        ${APK_DOWNLOAD_URL ? `<a href="${escHtml(APK_DOWNLOAD_URL)}" class="btn btn-activate" target="_blank" rel="noopener noreferrer">⬇ Download APK</a>` : ''}
        <a href="/install" class="btn btn-secondary btn-small">ℹ Installatie-instructies</a>
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
  const apkBlock = APK_DOWNLOAD_URL
    ? `
        <div class="install-actions">
          <a href="${escHtml(APK_DOWNLOAD_URL)}" class="btn btn-install" target="_blank" rel="noopener noreferrer">⬇ Download APK</a>
        </div>
        <p class="install-hint">Open de APK-link op uw Android-apparaat en bevestig de installatie. Zorg dat "Installatie van onbekende bronnen" is ingeschakeld in de Android-instellingen.</p>
        <p class="install-link mono">${escHtml(APK_DOWNLOAD_URL)}</p>
      `
    : '';

  return `
    <section class="install-panel${compact ? ' install-panel-compact' : ''}">
      <div class="install-panel-header">
        <div>
          <h2>📦 App installeren</h2>
          <p>Installeer Card-virtuweel als app op uw apparaat.</p>
        </div>
        ${compact ? '<a href="/install" class="btn btn-secondary btn-small">Meer info</a>' : ''}
      </div>
      <div class="install-actions">
        <button class="btn btn-install btn-pwa-install" style="display:none;">📲 Installeer als app</button>
      </div>
      <p class="install-hint pwa-install-hint" style="display:none;">Tik op "Installeer als app" om de app direct toe te voegen aan uw startscherm.</p>
      ${apkBlock}
      <ol class="install-steps">
        <li>Open deze pagina op uw Android-telefoon in Chrome.</li>
        <li>${APK_DOWNLOAD_URL ? 'Tik op "Download APK" om de Android-app te installeren, of tik op "Installeer als app" voor de PWA.' : 'Tik op "Installeer als app" als die knop verschijnt, of gebruik het Chrome-menu ⋮ → "Toevoegen aan startscherm".'}</li>
        <li>Bevestig de installatie en open de app vanaf uw startscherm.</li>
      </ol>
      <p class="install-hint">PWA installatie: open de site in Chrome en kies menu ⋮ → "Toevoegen aan startscherm" of "App installeren".</p>
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
