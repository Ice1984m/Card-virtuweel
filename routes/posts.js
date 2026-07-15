'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { layout } = require('./layout');

const router = express.Router();

const POSTS_FILE = path.join(__dirname, '../data/posts.json');
const CERTS_FILE = path.join(__dirname, '../data/certificates.json');

function readPosts() {
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); } catch { return []; }
}
function writePosts(items) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(items, null, 2));
}
function readCerts() {
  try { return JSON.parse(fs.readFileSync(CERTS_FILE, 'utf8')); } catch { return []; }
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

router.get('/', (req, res) => {
  const posts = readPosts();
  const statusLabel = { pending_approval: 'Wacht op goedkeuring', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
  const statusClass = { pending_approval: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };

  const cards = posts.length === 0
    ? '<p class="empty">Nog geen posts aangemaakt.</p>'
    : posts.map(p => `
      <div class="post-card">
        <div class="post-header">
          <h2><a href="/posts/${p.id}">${escHtml(p.title)}</a></h2>
          <span class="badge ${statusClass[p.status] || ''}">${statusLabel[p.status] || p.status}</span>
        </div>
        <p>${escHtml(p.description)}</p>
        <div class="post-meta">
          <strong>Prijs: €${escHtml(String(p.price))}</strong>
          <span>Aangemaakt: ${new Date(p.createdAt).toLocaleDateString('nl-NL')}</span>
        </div>
      </div>`).join('');

  res.send(layout('Posts', `
    <div class="page-header">
      <h1>Posts &amp; Advertenties</h1>
      <a href="/posts/new" class="btn">+ Nieuwe post</a>
    </div>
    ${cards}
  `));
});

router.get('/new', (req, res) => {
  const certs = readCerts().filter(c => c.status === 'approved');
  const certOptions = certs.length === 0
    ? '<option value="">-- Geen goedgekeurde certificaten beschikbaar --</option>'
    : '<option value="">-- Optioneel: koppel een certificaat --</option>' +
      certs.map(c => `<option value="${c.id}">${escHtml(c.type)} – ${escHtml(c.number)}</option>`).join('');

  res.send(layout('Nieuwe post', `
    <div class="page-header">
      <h1>Nieuwe post aanmaken</h1>
    </div>
    <form method="POST" action="/posts" class="form-card">
      <div class="form-group">
        <label for="title">Titel</label>
        <input id="title" name="title" type="text" placeholder="Titel van de post" required>
      </div>
      <div class="form-group">
        <label for="description">Beschrijving</label>
        <textarea id="description" name="description" rows="5" placeholder="Omschrijf uw post..." required></textarea>
      </div>
      <div class="form-group">
        <label for="price">Prijs (€)</label>
        <input id="price" name="price" type="number" min="0" step="0.01" placeholder="0.00" required>
      </div>
      <div class="form-group">
        <label for="certificateId">Gekoppeld certificaat</label>
        <select id="certificateId" name="certificateId">
          ${certOptions}
        </select>
      </div>
      <div class="form-actions">
        <a href="/posts" class="btn btn-secondary">Annuleren</a>
        <button type="submit" class="btn">Post indienen</button>
      </div>
    </form>
  `));
});

router.post('/', (req, res) => {
  const { title, description, price, certificateId } = req.body;
  if (!title || !description || price === undefined || price === '') {
    return res.status(400).send(layout('Fout', '<p class="error">Alle verplichte velden invullen.</p><a href="/posts/new" class="btn">Terug</a>'));
  }
  const posts = readPosts();
  posts.push({
    id: uuidv4(),
    title,
    description,
    price: parseFloat(price) || 0,
    certificateId: certificateId || null,
    status: 'pending_approval',
    createdAt: new Date().toISOString(),
  });
  writePosts(posts);
  res.redirect('/posts');
});

router.get('/:id', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).send(layout('Niet gevonden', '<p>Post niet gevonden.</p><a href="/posts" class="btn">Terug</a>'));

  const certs = readCerts();
  const cert = post.certificateId ? certs.find(c => c.id === post.certificateId) : null;

  const statusLabel = { pending_approval: 'Wacht op goedkeuring', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
  const statusClass = { pending_approval: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };

  const certBlock = cert
    ? `<div class="info-block">
        <h3>Gekoppeld certificaat</h3>
        <p>${escHtml(cert.type)} – ${escHtml(cert.number)} (${escHtml(cert.issuer)})</p>
       </div>`
    : '';

  const paymentBlock = post.status === 'approved'
    ? `<div class="payment-section">
        <h2>Betaling</h2>
        <form class="form-card payment-form" onsubmit="handlePayment(event)">
          <div class="form-group">
            <label for="cardName">Naam op kaart</label>
            <input id="cardName" type="text" placeholder="Jan Janssen" required>
          </div>
          <div class="form-group">
            <label for="cardNumber">Kaartnummer</label>
            <input id="cardNumber" type="text" placeholder="1234 5678 9012 3456" maxlength="19" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="cardExpiry">Vervaldatum</label>
              <input id="cardExpiry" type="text" placeholder="MM/JJ" maxlength="5" required>
            </div>
            <div class="form-group">
              <label for="cardCvv">CVV</label>
              <input id="cardCvv" type="text" placeholder="123" maxlength="4" required>
            </div>
          </div>
          <div class="form-group">
            <label>Bedrag</label>
            <div class="amount-display">€${escHtml(String(post.price.toFixed(2)))}</div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-pay">💳 Betaal nu</button>
          </div>
        </form>
        <div id="paymentSuccess" class="success-msg" style="display:none">
          ✅ Betaling succesvol verwerkt! (demo modus)
        </div>
        <script>
          function handlePayment(e) {
            e.preventDefault();
            document.querySelector('.payment-form').style.display = 'none';
            document.getElementById('paymentSuccess').style.display = 'block';
          }
        </script>
       </div>`
    : `<div class="payment-blocked">
        <span class="lock-icon">🔒</span>
        <p>Deze post moet eerst worden <strong>goedgekeurd</strong> voordat betaling mogelijk is.</p>
        <p class="status-msg">Huidige status: <span class="badge ${statusClass[post.status] || ''}">${statusLabel[post.status] || post.status}</span></p>
       </div>`;

  res.send(layout(escHtml(post.title), `
    <div class="page-header">
      <a href="/posts" class="btn btn-secondary">← Terug</a>
    </div>
    <div class="post-detail">
      <div class="post-detail-header">
        <h1>${escHtml(post.title)}</h1>
        <span class="badge ${statusClass[post.status] || ''}">${statusLabel[post.status] || post.status}</span>
      </div>
      <p class="post-description">${escHtml(post.description)}</p>
      <p class="post-price"><strong>Prijs: €${escHtml(String(post.price.toFixed(2)))}</strong></p>
      ${certBlock}
      ${paymentBlock}
    </div>
  `));
});

module.exports = router;
