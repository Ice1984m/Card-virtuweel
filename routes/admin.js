'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { layout } = require('./layout');

const router = express.Router();

const CERTS_FILE = path.join(__dirname, '../data/certificates.json');
const POSTS_FILE = path.join(__dirname, '../data/posts.json');

function readCerts() {
  try { return JSON.parse(fs.readFileSync(CERTS_FILE, 'utf8')); } catch { return []; }
}
function writeCerts(items) {
  fs.writeFileSync(CERTS_FILE, JSON.stringify(items, null, 2));
}
function readPosts() {
  try { return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8')); } catch { return []; }
}
function writePosts(items) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(items, null, 2));
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

router.get('/', (req, res) => {
  const certs = readCerts();
  const posts = readPosts();

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
          <form method="POST" action="/admin/certificates/${c.id}/approve" style="display:inline">
            <button class="btn btn-small btn-approve">✔ Goedkeuren</button>
          </form>
          <form method="POST" action="/admin/certificates/${c.id}/reject" style="display:inline">
            <button class="btn btn-small btn-reject">✖ Afwijzen</button>
          </form>
        </td>
      </tr>`).join('');

  const postRows = pendingPosts.length === 0
    ? '<tr><td colspan="4" class="empty">Geen posts in behandeling.</td></tr>'
    : pendingPosts.map(p => `
      <tr>
        <td><a href="/posts/${p.id}">${escHtml(p.title)}</a></td>
        <td>${escHtml(p.description).slice(0, 80)}${p.description.length > 80 ? '…' : ''}</td>
        <td>€${escHtml(String(p.price.toFixed(2)))}</td>
        <td class="action-cell">
          <form method="POST" action="/admin/posts/${p.id}/approve" style="display:inline">
            <button class="btn btn-small btn-approve">✔ Goedkeuren</button>
          </form>
          <form method="POST" action="/admin/posts/${p.id}/reject" style="display:inline">
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

function allCertsTable(certs) {
  const statusLabel = { pending: 'In behandeling', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
  const statusClass = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
  if (!certs.length) return '<p class="empty">Geen certificaten.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Type</th><th>Nummer</th><th>Instantie</th><th>Vervaldatum</th><th>Status</th></tr></thead>
    <tbody>
      ${certs.map(c => `<tr>
        <td>${escHtml(c.type)}</td>
        <td>${escHtml(c.number)}</td>
        <td>${escHtml(c.issuer)}</td>
        <td>${escHtml(c.expiry)}</td>
        <td><span class="badge ${statusClass[c.status] || ''}">${statusLabel[c.status] || c.status}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

function allPostsTable(posts) {
  const statusLabel = { pending_approval: 'Wacht op goedkeuring', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
  const statusClass = { pending_approval: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
  if (!posts.length) return '<p class="empty">Geen posts.</p>';
  return `<div class="table-wrap"><table>
    <thead><tr><th>Titel</th><th>Prijs</th><th>Status</th></tr></thead>
    <tbody>
      ${posts.map(p => `<tr>
        <td><a href="/posts/${p.id}">${escHtml(p.title)}</a></td>
        <td>€${escHtml(String(p.price.toFixed(2)))}</td>
        <td><span class="badge ${statusClass[p.status] || ''}">${statusLabel[p.status] || p.status}</span></td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

router.post('/certificates/:id/approve', (req, res) => {
  const certs = readCerts();
  const cert = certs.find(c => c.id === req.params.id);
  if (cert) { cert.status = 'approved'; writeCerts(certs); }
  res.redirect('/admin?flash=Certificaat+goedgekeurd');
});

router.post('/certificates/:id/reject', (req, res) => {
  const certs = readCerts();
  const cert = certs.find(c => c.id === req.params.id);
  if (cert) { cert.status = 'rejected'; writeCerts(certs); }
  res.redirect('/admin?flash=Certificaat+afgewezen');
});

router.post('/posts/:id/approve', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (post) { post.status = 'approved'; writePosts(posts); }
  res.redirect('/admin?flash=Post+goedgekeurd');
});

router.post('/posts/:id/reject', (req, res) => {
  const posts = readPosts();
  const post = posts.find(p => p.id === req.params.id);
  if (post) { post.status = 'rejected'; writePosts(posts); }
  res.redirect('/admin?flash=Post+afgewezen');
});

module.exports = router;
