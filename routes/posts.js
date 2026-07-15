'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { layout } = require('./layout');
const { readJson, writeJson, formatPrice, escHtml } = require('./helpers');

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

  const certBlock = cert
    ? `<div class="info-block">
        <h3>Gekoppeld certificaat</h3>
        <p>${escHtml(cert.type)} – ${escHtml(cert.number)} (${escHtml(cert.issuer)})</p>
       </div>`
    : '';

  const paymentBlock = post.status === 'approved'
    ? buildPaymentBlock(post)
    : `<div class="payment-blocked">
        <span class="lock-icon">🔒</span>
        <p>Deze post moet eerst worden <strong>goedgekeurd</strong> voordat betaling mogelijk is.</p>
        <p class="status-msg">Huidige status: <span class="badge ${STATUS_CLASS[post.status] || ''}">${STATUS_LABEL[post.status] || escHtml(post.status)}</span></p>
       </div>`;

  res.send(layout(escHtml(post.title), `
    <div class="page-header">
      <a href="/posts" class="btn btn-secondary">← Terug</a>
    </div>
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

function buildPaymentBlock(post) {
  const price = escHtml(formatPrice(post.price));
  return `
    <div class="payment-section">
      <h2>Betaling</h2>
      <div class="demo-notice">⚠️ <strong>Demo modus</strong> – Er wordt geen echte betaling verwerkt.</div>

      <div class="payment-tabs" role="tablist">
        <button class="tab-btn tab-active" role="tab" data-tab="nfc">📲 NFC Betalen</button>
        <button class="tab-btn" role="tab" data-tab="card">💳 Kaartbetaling</button>
      </div>

      <!-- NFC tab -->
      <div id="tab-nfc" class="tab-panel">
        <div class="nfc-panel">
          <div id="nfcUnsupported" class="nfc-unsupported" style="display:none">
            <p>⚠️ Web NFC wordt niet ondersteund door deze browser.</p>
            <p>Gebruik <strong>Chrome op Android</strong> om via NFC te betalen, of kies kaartbetaling.</p>
          </div>
          <div id="nfcReady">
            <p class="nfc-instructions">Houd uw NFC-betaalkaart of -apparaat tegen de achterkant van uw telefoon.</p>
            <div class="nfc-animation" id="nfcAnimation">
              <div class="nfc-ring ring1"></div>
              <div class="nfc-ring ring2"></div>
              <div class="nfc-ring ring3"></div>
              <span class="nfc-icon">📡</span>
            </div>
            <div class="amount-display">€${price}</div>
            <button id="btnStartNfc" class="btn btn-nfc">
              📲 Start NFC-betaling
            </button>
            <div id="nfcScanning" class="nfc-scanning" style="display:none">
              <p>🔍 Scannen… houd uw kaart tegen de telefoon</p>
            </div>
            <div id="nfcSuccess" class="success-msg" style="display:none">
              ✅ NFC-tag gelezen! Betaling geïnitieerd voor €${price} (demo modus)
            </div>
            <div id="nfcError" class="error" style="display:none"></div>
          </div>
        </div>
      </div>

      <!-- Card tab -->
      <div id="tab-card" class="tab-panel" style="display:none">

        <!-- One-click payment (shown when card is saved) -->
        <div id="oneClickSection" style="display:none">
          <div class="demo-notice">💾 Opgeslagen kaart gevonden – betaal direct</div>
          <div class="amount-display">€${price}</div>
          <button type="button" class="btn btn-pay" id="btnOneClick">⚡ Betaal met één klik – €${price}</button>
          <div id="oneClickSuccess" class="success-msg" style="display:none">
            ✅ Betaling verwerkt! Bedrag: €${price} (demo modus)
          </div>
          <p style="margin-top:.75rem">
            <button type="button" class="btn btn-secondary btn-small" id="btnRemoveSaved">🗑 Opgeslagen kaart verwijderen</button>
          </p>
          <hr style="margin:1.25rem 0; border:none; border-top:1px solid var(--border)">
          <p style="font-size:.88rem; color:var(--muted)">Of vul een andere kaart in:</p>
        </div>

        <form class="form-card payment-form" id="cardForm">
          <div class="form-group">
            <label for="cardName">Naam op kaart</label>
            <input id="cardName" type="text" placeholder="Jan Janssen" autocomplete="cc-name" required>
          </div>
          <div class="form-group">
            <label for="cardNumber">Kaartnummer</label>
            <input id="cardNumber" type="text" placeholder="1234 5678 9012 3456" maxlength="19"
                   autocomplete="cc-number" inputmode="numeric" required>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="cardExpiry">Vervaldatum</label>
              <input id="cardExpiry" type="text" placeholder="MM/JJ" maxlength="5"
                     autocomplete="cc-exp" required>
            </div>
            <div class="form-group">
              <label for="cardCvv">CVV</label>
              <input id="cardCvv" type="text" placeholder="123" maxlength="4"
                     autocomplete="cc-csc" inputmode="numeric" required>
            </div>
          </div>
          <div class="form-group">
            <label>Bedrag</label>
            <div class="amount-display">€${price}</div>
          </div>
          <div class="form-group">
            <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer">
              <input type="checkbox" id="saveCard" style="width:auto">
              Kaartgegevens opslaan voor één-klik betaling
            </label>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-pay">💳 Betaal nu</button>
          </div>
        </form>
        <div id="cardSuccess" class="success-msg" style="display:none">
          ✅ Kaartbetaling verwerkt! Bedrag: €${price} (demo modus)
        </div>
      </div>
    </div>

    <script>
      (function () {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('tab-active'); });
            document.querySelectorAll('.tab-panel').forEach(function (p) { p.style.display = 'none'; });
            btn.classList.add('tab-active');
            document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
          });
        });

        // Check NFC support on load
        if (!('NDEFReader' in window)) {
          document.getElementById('nfcUnsupported').style.display = 'block';
          document.getElementById('nfcReady').style.display = 'none';
        }

        // NFC payment
        document.getElementById('btnStartNfc').addEventListener('click', async function () {
          var btn = this;
          var scanning = document.getElementById('nfcScanning');
          var success = document.getElementById('nfcSuccess');
          var errEl = document.getElementById('nfcError');
          var anim = document.getElementById('nfcAnimation');

          errEl.style.display = 'none';
          success.style.display = 'none';

          if (!('NDEFReader' in window)) {
            errEl.textContent = 'NFC wordt niet ondersteund door deze browser.';
            errEl.style.display = 'block';
            return;
          }

          try {
            btn.disabled = true;
            scanning.style.display = 'block';
            anim.classList.add('nfc-active');

            var ndef = new NDEFReader();
            await ndef.scan();

            ndef.addEventListener('reading', function (event) {
              scanning.style.display = 'none';
              anim.classList.remove('nfc-active');
              btn.style.display = 'none';
              // Log tag serial number for demo transparency
              console.info('NFC tag gelezen, serialNumber:', event.serialNumber);
              success.style.display = 'block';
            }, { once: true });

            ndef.addEventListener('readingerror', function () {
              scanning.style.display = 'none';
              anim.classList.remove('nfc-active');
              btn.disabled = false;
              errEl.textContent = 'NFC-tag kon niet worden gelezen. Probeer opnieuw.';
              errEl.style.display = 'block';
            });
          } catch (err) {
            scanning.style.display = 'none';
            anim.classList.remove('nfc-active');
            btn.disabled = false;
            if (err.name === 'NotAllowedError') {
              errEl.textContent = 'NFC-toegang geweigerd. Sta NFC-toegang toe in uw browser.';
            } else if (err.name === 'NotSupportedError') {
              errEl.textContent = 'NFC wordt niet ondersteund op dit apparaat.';
            } else {
              errEl.textContent = 'NFC-fout: ' + err.message;
            }
            errEl.style.display = 'block';
          }
        });

        // One-click payment: load saved card
        var savedCard = null;
        try { savedCard = JSON.parse(localStorage.getItem('cardvirtuweel_saved_card')); } catch (e) {}
        if (savedCard && savedCard.masked) {
          document.getElementById('oneClickSection').style.display = 'block';
          document.getElementById('btnOneClick').textContent =
            '⚡ Betaal met één klik – ' + savedCard.masked + ' – €${price}';
        }

        document.getElementById('btnOneClick').addEventListener('click', function () {
          this.style.display = 'none';
          document.getElementById('oneClickSuccess').style.display = 'block';
        });

        document.getElementById('btnRemoveSaved').addEventListener('click', function () {
          localStorage.removeItem('cardvirtuweel_saved_card');
          document.getElementById('oneClickSection').style.display = 'none';
        });

        // Format card number with spaces
        document.getElementById('cardNumber').addEventListener('input', function () {
          var v = this.value.replace(/\\D/g, '').slice(0, 16);
          this.value = v.replace(/(\\d{4})(?=\\d)/g, '$1 ');
        });

        // Format expiry MM/JJ
        document.getElementById('cardExpiry').addEventListener('input', function () {
          var v = this.value.replace(/\\D/g, '').slice(0, 4);
          if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
          this.value = v;
        });

        // Card payment
        document.getElementById('cardForm').addEventListener('submit', function (e) {
          e.preventDefault();
          // Save card if checkbox checked (only masked number stored, no CVV)
          if (document.getElementById('saveCard').checked) {
            var raw = document.getElementById('cardNumber').value.replace(/\\s/g, '');
            var masked = '**** **** **** ' + raw.slice(-4);
            try {
              localStorage.setItem('cardvirtuweel_saved_card', JSON.stringify({
                masked: masked,
                name: document.getElementById('cardName').value,
                expiry: document.getElementById('cardExpiry').value,
              }));
            } catch (e) {}
          }
          document.getElementById('cardForm').style.display = 'none';
          document.getElementById('cardSuccess').style.display = 'block';
        });
      }());
    </script>`;
}

module.exports = router;

