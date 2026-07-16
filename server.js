'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');

const { layout } = require('./routes/layout');
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

app.use((req, res) => {
  res.status(404).send(notFoundPage());
});

app.listen(PORT, () => {
  console.log(`Card-virtuweel draait op http://localhost:${PORT}`);
});

function homePage() {
  const apkDownloadUrl = 'https://github.com/Ice1984m/Card-virtuweel/releases/latest/download/Card-virtuweel.apk';
  const readmeUrl = 'https://github.com/Ice1984m/Card-virtuweel#readme';

  return layout('Card-virtuweel – Home', `
    <div class="hero">
      <h1>Card-virtuweel</h1>
      <p class="subtitle">Beheer certificaten, licenties en posts met goedkeuringsproces.</p>
    </div>
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
        <a href="${apkDownloadUrl}" class="card" download>
          <span class="icon">📲</span>
          <h2>Download APK</h2>
          <p>Installeer de Card-virtuweel app direct op uw Android-apparaat.</p>
          <p class="mono">APK URL: ${apkDownloadUrl}</p>
          <p class="mono">README URL: ${readmeUrl}</p>
        </a>
        <a href="${apkDownloadUrl}" class="btn btn-activate" download>⬇ Download APK</a>
      </div>
    </div>
  `);
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
