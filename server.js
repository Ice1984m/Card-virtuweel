'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const { Readable } = require('stream');

const { layout } = require('./routes/layout');
const { escHtml } = require('./routes/helpers');
const certificatesRouter = require('./routes/certificates');
const postsRouter = require('./routes/posts');
const adminRouter = require('./routes/admin');
const browserRouter = require('./routes/browser');
const bridgesRouter = require('./routes/bridges');

const app = express();
const PORT = process.env.PORT || 4242;

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

app.get('/download/apk', async (req, res) => {
  if (!APK_DOWNLOAD_URL) {
    res.status(404).send('Er is nog geen APK-downloadlink ingesteld.');
    return;
  }

  try {
    const downloadUrl = new URL(APK_DOWNLOAD_URL);
    const upstream = await fetch(downloadUrl);

    if (!upstream.ok) {
      res.status(502).send(`APK-download is tijdelijk niet beschikbaar (${upstream.status}).`);
      return;
    }

    const filename = sanitizeDownloadFilename(downloadUrl.pathname);
    const contentType = upstream.headers.get('content-type') || 'application/vnd.android.package-archive';
    const contentLength = upstream.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (!upstream.body) {
      res.status(502).send('APK-download bevat geen bestand.');
      return;
    }

    const downloadStream = Readable.fromWeb(upstream.body);
    downloadStream.on('error', (streamErr) => {
      console.error('APK-download streamfout:', streamErr);
      if (!res.headersSent) {
        res.status(502).send('APK-download is tijdelijk niet beschikbaar.');
        return;
      }

      res.destroy(streamErr);
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('APK-download mislukt:', err);
    res.status(502).send('APK-download is tijdelijk niet beschikbaar.');
  }
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
        ${renderHomeDownloadCard()}
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
    ? 'Tik op "Download APK" en open het gedownloade bestand.'
    : 'Gebruik "Toevoegen aan startscherm" in Chrome zolang er nog geen APK-link is ingesteld.';
  const downloadBlock = APK_DOWNLOAD_URL
    ? `
        <div class="install-actions">
          <a href="/download/apk" class="btn btn-install" download="Card-virtuweel.apk">⬇ Download APK</a>
        </div>
        <p class="install-hint">Tik op de knop om het APK-bestand rechtstreeks op uw Android-apparaat te downloaden en bevestig daarna de installatie.</p>
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

function renderHomeDownloadCard() {
  if (!APK_DOWNLOAD_URL) {
    return `
        <a href="/install" class="card">
          <span class="icon">📲</span>
          <h2>App installeren</h2>
          <p>Open de installatiepagina voor PWA-installatie of een latere APK-download.</p>
        </a>
        <a href="/install" class="btn btn-activate">▶ Installatie openen</a>
      `;
  }

  return `
      <a href="/download/apk" class="card" download="Card-virtuweel.apk">
        <span class="icon">📲</span>
        <h2>Download APK</h2>
        <p>Installeer de Card-virtuweel app direct op uw Android-apparaat.</p>
      </a>
      <a href="/download/apk" class="btn btn-activate" download="Card-virtuweel.apk">⬇ Download APK</a>
    `;
}

function safeExternalUrl(value) {
  if (!value) {
    return '';
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch (err) {
    return '';
  }
}

function sanitizeDownloadFilename(urlPathname) {
  const rawName = path.basename(urlPathname) || 'Card-virtuweel.apk';
  const cleanedName = rawName.replace(/[^a-zA-Z0-9._-]/g, '');
  return cleanedName.toLowerCase().endsWith('.apk') ? cleanedName : 'Card-virtuweel.apk';
}

const APK_DOWNLOAD_URL = safeExternalUrl(process.env.APK_DOWNLOAD_URL);

module.exports = app;
