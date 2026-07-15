'use strict';

const express = require('express');
const path = require('path');
const { layout } = require('./layout');
const { readJson, writeJson, formatPrice, escHtml } = require('./helpers');

const router = express.Router();

const CERTS_FILE = path.join(__dirname, '../data/certificates.json');
const POSTS_FILE = path.join(__dirname, '../data/posts.json');

router.get('/', (req, res) => {
  const certs = readJson(CERTS_FILE);
  const posts = readJson(POSTS_FILE);

  const pendingCerts = certs.filter(c => c.status === 'pending');
  const pendingPosts = posts.filter(p => p.status === 'pending_approval');

  const certRows = pendingCerts.length === 0
    ? '<tr><td colspan="5" class="empty">Geen certificaten in behandeling.</td></tr>'
    : pendingCerts.map(c => `
      <tr>
        <td>${escHtml(c.type)}</td>
        <td>${escHtml(c.number)}</td>
        <td>${escHtml(c.issuer)}</td>
        <td>${escHtml(c.expiry)}</td>
        <td class="action-cell">
          <form method="POST" action="/admin/certificates/${escHtml(c.id)}/approve" style="display:inline">
            <button class="btn btn-small btn-approve">✔ Goedkeuren</button>
          </form>
          <form method="POST" action="/admin/certificates/${escHtml(c.id)}/reject" style="display:inline">
            <button class="btn btn-small btn-reject">✖ Afwijzen</button>
          </form>
        </td>
      </tr>`).join('');

  const postRows = pendingPosts.length === 0
    ? '<tr><td colspan="4" class="empty">Geen posts in behandeling.</td></tr>'
    : pendingPosts.map(p => `
      <tr>
        <td><a href="/posts/${escHtml(p.id)}">${escHtml(p.title)}</a></td>
        <td>${escHtml(p.description).slice(0, 80)}${p.description.length > 80 ? '…' : ''}</td>
        <td>€${escHtml(formatPrice(p.price))}</td>
        <td class="action-cell">
          <form method="POST" action="/admin/posts/${escHtml(p.id)}/approve" style="display:inline">
            <button class="btn btn-small btn-approve">✔ Goedkeuren</button>
          </form>
          <form method="POST" action="/admin/posts/${escHtml(p.id)}/reject" style="display:inline">
            <button class="btn btn-small btn-reject">✖ Afwijzen</button>
          </form>
        </td>
      </tr>`).join('');

  const flash = req.query.flash
    ? `<div class="flash">${escHtml(req.query.flash)}</div>`
    : '';

  res.send(layout('Admin Paneel', `
    <div class="page-header">
      <h1>🔑 Admin Paneel</h1>
    </div>
    ${flash}

    <section class="admin-section">
      <h2>Certificaten in behandeling <span class="count-badge">${pendingCerts.length}</span></h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Nummer</th><th>Instantie</th><th>Vervaldatum</th><th>Acties</th></tr></thead>
          <tbody>${certRows}</tbody>
        </table>
      </div>
    </section>

    <section class="admin-section">
      <h2>Posts in behandeling <span class="count-badge">${pendingPosts.length}</span></h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Titel</th><th>Beschrijving</th><th>Prijs</th><th>Acties</th></tr></thead>
          <tbody>${postRows}</tbody>
        </table>
      </div>
    </section>

    <section class="admin-section">
      <h2>Overzicht alle certificaten</h2>
      ${allCertsTable(certs)}
    </section>

    <section class="admin-section">
      <h2>Overzicht alle posts</h2>
      ${allPostsTable(posts)}
    </section>
  `));
});

const CERT_STATUS_LABEL = { pending: 'In behandeling', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
const CERT_STATUS_CLASS = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
const POST_STATUS_LABEL = { pending_approval: 'Wacht op goedkeuring', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
const POST_STATUS_CLASS = { pending_approval: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };

function allCertsTable(certs) {
  if (!certs.length) return '<p class="empty">Geen certificaten.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Type</th><th>Nummer</th><th>Instantie</th><th>Vervaldatum</th><th>Status</th></tr></thead>
    <tbody>
      ${certs.map(c => `<tr>
        <td>${escHtml(c.type)}</td>
        <td>${escHtml(c.number)}</td>
        <td>${escHtml(c.issuer)}</td>
        <td>${escHtml(c.expiry)}</td>
        <td><span class="badge ${CERT_STATUS_CLASS[c.status] || ''}">${CERT_STATUS_LABEL[c.status] || escHtml(c.status)}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function allPostsTable(posts) {
  if (!posts.length) return '<p class="empty">Geen posts.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Titel</th><th>Prijs</th><th>Status</th></tr></thead>
    <tbody>
      ${posts.map(p => `<tr>
        <td><a href="/posts/${escHtml(p.id)}">${escHtml(p.title)}</a></td>
        <td>€${escHtml(formatPrice(p.price))}</td>
        <td><span class="badge ${POST_STATUS_CLASS[p.status] || ''}">${POST_STATUS_LABEL[p.status] || escHtml(p.status)}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

router.post('/certificates/:id/approve', (req, res) => {
  const certs = readJson(CERTS_FILE);
  const cert = certs.find(c => c.id === req.params.id);
  if (cert) { cert.status = 'approved'; writeJson(CERTS_FILE, certs); }
  res.redirect('/admin?flash=Certificaat+goedgekeurd');
});

router.post('/certificates/:id/reject', (req, res) => {
  const certs = readJson(CERTS_FILE);
  const cert = certs.find(c => c.id === req.params.id);
  if (cert) { cert.status = 'rejected'; writeJson(CERTS_FILE, certs); }
  res.redirect('/admin?flash=Certificaat+afgewezen');
});

router.post('/posts/:id/approve', (req, res) => {
  const posts = readJson(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (post) { post.status = 'approved'; writeJson(POSTS_FILE, posts); }
  res.redirect('/admin?flash=Post+goedgekeurd');
});

router.post('/posts/:id/reject', (req, res) => {
  const posts = readJson(POSTS_FILE);
  const post = posts.find(p => p.id === req.params.id);
  if (post) { post.status = 'rejected'; writeJson(POSTS_FILE, posts); }
  res.redirect('/admin?flash=Post+afgewezen');
});

module.exports = router;
