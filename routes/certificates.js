'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { layout } = require('./layout');

const router = express.Router();

const CERT_FILE = path.join(__dirname, '../data/certificates.json');
const UPLOAD_DIR = path.join(__dirname, '../uploads/certificates');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Alleen PDF, JPG en PNG bestanden zijn toegestaan.'));
    }
  },
});

function readCerts() {
  try { return JSON.parse(fs.readFileSync(CERT_FILE, 'utf8')); } catch { return []; }
}
function writeCerts(items) {
  fs.writeFileSync(CERT_FILE, JSON.stringify(items, null, 2));
}

router.get('/', (req, res) => {
  const certs = readCerts();
  const statusLabel = { pending: 'In behandeling', approved: 'Goedgekeurd', rejected: 'Afgekeurd' };
  const statusClass = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' };
  const rows = certs.length === 0
    ? '<tr><td colspan="6" class="empty">Geen certificaten gevonden.</td></tr>'
    : certs.map(c => `
      <tr>
        <td>${escHtml(c.type)}</td>
        <td>${escHtml(c.number)}</td>
        <td>${escHtml(c.issuer)}</td>
        <td>${escHtml(c.expiry)}</td>
        <td><span class="badge ${statusClass[c.status] || ''}">${statusLabel[c.status] || c.status}</span></td>
        <td>${c.filename ? `<a href="/uploads/certificates/${c.filename}" target="_blank">Bekijk</a>` : '–'}</td>
      </tr>`).join('');

  res.send(layout('Certificaten &amp; Licenties', `
    <div class="page-header">
      <h1>Certificaten &amp; Licenties</h1>
      <a href="/certificates/new" class="btn">+ Nieuw certificaat</a>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Type</th><th>Nummer</th><th>Uitgevende instantie</th><th>Vervaldatum</th><th>Status</th><th>Bestand</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `));
});

router.get('/new', (req, res) => {
  res.send(layout('Nieuw certificaat', `
    <div class="page-header">
      <h1>Nieuw certificaat toevoegen</h1>
    </div>
    <form method="POST" action="/certificates" enctype="multipart/form-data" class="form-card">
      <div class="form-group">
        <label for="type">Type certificaat / licentie</label>
        <select id="type" name="type" required>
          <option value="">-- Selecteer type --</option>
          <option>VOG (Verklaring Omtrent Gedrag)</option>
          <option>KvK-registratie</option>
          <option>ISO-certificaat</option>
          <option>Rijbewijs</option>
          <option>Diploma</option>
          <option>Bedrijfslicentie</option>
          <option>Anders</option>
        </select>
      </div>
      <div class="form-group">
        <label for="number">Certificaatnummer</label>
        <input id="number" name="number" type="text" placeholder="bijv. 2024-NL-00123" required>
      </div>
      <div class="form-group">
        <label for="issuer">Uitgevende instantie</label>
        <input id="issuer" name="issuer" type="text" placeholder="bijv. Kamer van Koophandel" required>
      </div>
      <div class="form-group">
        <label for="expiry">Vervaldatum</label>
        <input id="expiry" name="expiry" type="date" required>
      </div>
      <div class="form-group">
        <label for="file">Bestand uploaden (PDF, JPG, PNG – max 5 MB)</label>
        <input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png">
      </div>
      <div class="form-actions">
        <a href="/certificates" class="btn btn-secondary">Annuleren</a>
        <button type="submit" class="btn">Indienen</button>
      </div>
    </form>
  `));
});

router.post('/', upload.single('file'), (req, res) => {
  const { type, number, issuer, expiry } = req.body;
  if (!type || !number || !issuer || !expiry) {
    return res.status(400).send(layout('Fout', '<p class="error">Alle velden zijn verplicht.</p><a href="/certificates/new" class="btn">Terug</a>'));
  }
  const certs = readCerts();
  certs.push({
    id: uuidv4(),
    type,
    number,
    issuer,
    expiry,
    filename: req.file ? req.file.filename : null,
    originalName: req.file ? req.file.originalname : null,
    status: 'pending',
    createdAt: new Date().toISOString(),
  });
  writeCerts(certs);
  res.redirect('/certificates');
});

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = router;
