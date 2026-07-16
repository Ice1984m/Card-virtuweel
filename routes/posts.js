'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { layout } = require('./layout');
const { readJson, writeJson, formatPrice, escHtml } = require('./helpers');
const { readPaymentState, createPurchaseIntent } = require('./paymentService');

const router = express.Router();

const POSTS_FILE = path.join(__dirname, '../data/posts.json');
const CERTS_FILE = path.join(__dirname, '../data/certificates.json');

const STATUS_LABEL = {
  pending_approval: 'Wacht op goedkeuring',
  approved: 'Goedgekeurd',
  rejected: 'Afgekeurd',
};
const STATUS_CLASS = {
  pending_approval: 'badge-pending',
  approved: 'badge-approved',
  rejected: 'badge-rejected',
};

router.get('/', (req, res) => {
  const posts = readJson(POSTS_FILE);
  const cards = posts.length === 0
    ? '<p class="empty">Nog geen posts aangemaakt.</p>'
    : posts.map(p => `
      <div class="post-card">
        <div class="post-header">
          <h2><a href="/posts/${p.id}">${escHtml(p.title)}</a></h2>
          <span class="badge ${STATUS_CLASS[p.status] || ''}">${STATUS_LABEL[p.status] || escHtml(p.status)}</span>
        </div>
        <p>${escHtml(p.description)}</p>
        <div class="post-meta">
          <strong>Prijs: €${escHtml(formatPrice(p.price))}</strong>
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
  const certs = readJson(CERTS_FILE).filter(c => c.status === 'approved');
  const certOptions = certs.length === 0
    ? '<option value="">-- Geen goedgekeurde certificaten beschikbaar --</option>'
    : '<option value="">-- Optioneel: koppel een certificaat --</option>' +
      certs.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.type)} – ${escHtml(c.number)}</option>`).join('');

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
  const posts = readJson(POSTS_FILE);
  posts.push({
    id: uuidv4(),
    title,
    description,
    price: parseFloat(price) || 0,
    certificateId: certificateId || null,
    status: 'pending_approval',
    createdAt: new Date().toISOString(),
  });
  writeJson(POSTS_FILE, posts);
  res.redirect('/posts');
});

router.get('/:id', (req, res) => {
  const posts = readJson(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (!post) {
    return res.status(404).send(layout('Niet gevonden', '<p>Post niet gevonden.</p><a href="/posts" class="btn">Terug</a>'));
  }

  const certs = readJson(CERTS_FILE);
  const cert = post.certificateId ? certs.find(c => c.id === post.certificateId) : null;
  const flash = req.query.flash
    ? `<div class="flash">${escHtml(req.query.flash)}</div>`
    : '';

  const certBlock = cert
    ? `<div class="info-block">
        <h3>Gekoppeld certificaat</h3>
        <p>${escHtml(cert.type)} – ${escHtml(cert.number)} (${escHtml(cert.issuer)})</p>
       </div>`
    : '';

  const paymentBlock = post.status === 'approved'
    ? buildPaymentBlock(post, readPaymentState())
    : `<div class="payment-blocked">
        <span class="lock-icon">🔒</span>
        <p>Deze post moet eerst worden <strong>goedgekeurd</strong> voordat betaling mogelijk is.</p>
        <p class="status-msg">Huidige status: <span class="badge ${STATUS_CLASS[post.status] || ''}">${STATUS_LABEL[post.status] || escHtml(post.status)}</span></p>
       </div>`;

  res.send(layout(escHtml(post.title), `
    <div class="page-header">
      <a href="/posts" class="btn btn-secondary">← Terug</a>
    </div>
    ${flash}
    <div class="post-detail">
      <div class="post-detail-header">
        <h1>${escHtml(post.title)}</h1>
        <span class="badge ${STATUS_CLASS[post.status] || ''}">${STATUS_LABEL[post.status] || escHtml(post.status)}</span>
      </div>
      <p class="post-description">${escHtml(post.description)}</p>
      <p class="post-price"><strong>Prijs: €${escHtml(formatPrice(post.price))}</strong></p>
      ${certBlock}
      ${paymentBlock}
    </div>
  `));
});

router.post('/:id/pay', (req, res) => {
  const posts = readJson(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);

  if (!post || post.status !== 'approved') {
    return res.status(404).send(layout('Niet gevonden', '<div class="error">Goedgekeurde post niet gevonden.</div><a href="/posts" class="btn">← Terug</a>'));
  }

  try {
    const intent = createPurchaseIntent(post);
    res.redirect(`/wallet/checkout/${encodeURIComponent(intent.id)}`);
  } catch (err) {
    res.status(err.statusCode || 500).send(layout('Betalingsfout', `
      <div class="page-header"><h1>Betalingsfout</h1></div>
      <div class="error">${escHtml(err.message)}</div>
      <a href="/posts/${escHtml(post.id)}" class="btn">← Terug naar post</a>
    `));
  }
});

function buildPaymentBlock(post, paymentState) {
  const price = escHtml(formatPrice(post.price));
  const wallet = paymentState.wallet;
  const relatedIntents = paymentState.paymentIntents
    .filter((intent) => intent.postId === post.id)
    .slice(0, 3);
  const hasBalance = wallet && Number(wallet.balance || 0) >= Number(post.price || 0);

  if (!wallet) {
    return `
      <div class="payment-section">
        <h2>Betaling</h2>
        <div class="demo-notice">Gebruik eerst de sandbox wallet om een prepaid testkaart aan te maken.</div>
        <p>Deze flow gebruikt alleen server-side tokens en bevestigingen. Er worden geen ruwe kaartgegevens in de browser opgeslagen.</p>
        <a href="/wallet" class="btn btn-pay">💳 Open sandbox wallet</a>
      </div>
    `;
  }

  return `
    <div class="payment-section">
      <h2>Veilige sandbox betaling</h2>
      <div class="demo-notice">Provider-redirect in sandboxmodus met server-side autorisatie, auditlogging en token-gebaseerd kaartbeheer.</div>
      <div class="wallet-inline-card">
        <div>
          <p class="wallet-inline-title">Actieve kaart</p>
          <p class="mono">${escHtml(wallet.maskedPan)}</p>
        </div>
        <div>
          <p class="wallet-inline-title">Saldo</p>
          <p class="amount-display">€${escHtml(formatPrice(wallet.balance))}</p>
        </div>
      </div>
      <p>Bedrag voor deze post: <strong>€${price}</strong></p>
      ${hasBalance ? `
        <form method="POST" action="/posts/${encodeURIComponent(post.id)}/pay" class="payment-cta-form">
          <button type="submit" class="btn btn-pay">🔐 Start beveiligde betaalautorisatie</button>
        </form>
      ` : `
        <div class="payment-blocked">
          <span class="lock-icon">💶</span>
          <p>Onvoldoende saldo om deze aankoop te bevestigen.</p>
          <a href="/wallet" class="btn btn-pay">Kaart opladen</a>
        </div>
      `}
      ${relatedIntents.length ? `
        <div class="table-wrap" style="margin-top:1rem">
          <table>
            <thead><tr><th>Provider referentie</th><th>Status</th><th>Actie</th></tr></thead>
            <tbody>
              ${relatedIntents.map((intent) => `<tr>
                <td><code class="mono">${escHtml(intent.providerReference)}</code></td>
                <td><span class="badge ${intent.status === 'confirmed' ? 'badge-approved' : intent.status === 'pending_confirmation' ? 'badge-pending' : 'badge-rejected'}">${escHtml(intent.status)}</span></td>
                <td>${intent.status === 'pending_confirmation' ? `<a href="/wallet/checkout/${encodeURIComponent(intent.id)}">Verder gaan</a>` : 'Afgerond'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      <p class="install-hint" style="margin-top:1rem">Geen lokale opslag van PAN/CVC. Alleen gemaskeerde kaartweergave en provider-token worden bewaard.</p>
      <div class="form-actions">
        <a href="/wallet" class="btn btn-secondary">Wallet beheren</a>
      </div>
    </div>`;
}

module.exports = router;
