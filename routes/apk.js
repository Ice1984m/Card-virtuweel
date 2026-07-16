'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { layout } = require('./layout');
const { escHtml } = require('./helpers');

const router = express.Router();

const LOCAL_APK_PATH = path.join(__dirname, '..', 'public', 'Card-virtuweel.apk');
const LOCAL_APK_URL = '/Card-virtuweel.apk';

// Check once at startup whether a local APK is available.
// A server restart is required after adding or removing the APK file.
const localApkExists = fs.existsSync(LOCAL_APK_PATH);

function getApkUrl(configuredUrl) {
  if (localApkExists) return LOCAL_APK_URL;
  return configuredUrl || '';
}

router.get('/', (req, res) => {
  const apkUrl = getApkUrl(req.app.locals.APK_DOWNLOAD_URL);
  if (apkUrl && apkUrl !== LOCAL_APK_URL) {
    return res.redirect(302, apkUrl);
  }
  res.send(apkDownloadPage(apkUrl));
});

function apkDownloadPage(apkUrl) {
  const hasApk = !!apkUrl;
  const downloadBlock = hasApk
    ? `
      <div class="apk-download-box">
        <a href="${escHtml(apkUrl)}" class="btn btn-apk-dl" download>
          ⬇ Download APK
        </a>
        <p class="apk-hint">Open deze link op uw Android-apparaat en bevestig de installatie.</p>
        <p class="apk-url mono">${escHtml(apkUrl)}</p>
      </div>
    `
    : `
      <div class="apk-unavailable">
        <span class="apk-unavailable-icon">⚠️</span>
        <p><strong>Geen APK-bestand beschikbaar.</strong></p>
        <p>Plaats <code>Card-virtuweel.apk</code> in de <code>public/</code> map,
           of stel <code>APK_DOWNLOAD_URL</code> in als omgevingsvariabele.</p>
      </div>
    `;

  const installSteps = hasApk
    ? `
      <div class="apk-steps-card">
        <h2>Installatie-instructies</h2>
        <ol class="apk-steps">
          <li>Open deze pagina op uw Android-telefoon.</li>
          <li>Tik op "Download APK" en wacht tot het bestand is opgeslagen.</li>
          <li>Open de bestandsbeheerder of Downloads-app en tik op <code>Card-virtuweel.apk</code>. Android vraagt dan om toestemming voor installatie vanuit deze bron.</li>
          <li>Geef toestemming en volg de installatiestappen.</li>
          <li>Open de app vanaf uw startscherm.</li>
        </ol>
        <p class="apk-hint">
          <strong>PWA-alternatief:</strong> open de site in Chrome en kies ⋮ → "Toevoegen aan startscherm".
        </p>
      </div>
    `
    : `
      <div class="apk-steps-card">
        <h2>PWA-installatie (alternatief)</h2>
        <ol class="apk-steps">
          <li>Open deze website in Chrome op uw Android-telefoon.</li>
          <li>Tik op het menu ⋮ rechtsboven.</li>
          <li>Kies "Toevoegen aan startscherm".</li>
          <li>Bevestig en open de app vanaf uw startscherm.</li>
        </ol>
      </div>
    `;

  return layout('Card-virtuweel – Download APK', `
    <div class="apk-page">
      <div class="apk-hero">
        <span class="apk-icon">📲</span>
        <h1>Download Card-virtuweel APK</h1>
        <p class="subtitle">Directe installatie op uw Android-apparaat.</p>
      </div>
      ${downloadBlock}
      ${installSteps}
      <div class="apk-back">
        <a href="/" class="btn btn-secondary">← Terug naar home</a>
      </div>
    </div>
  `);
}

module.exports = router;
