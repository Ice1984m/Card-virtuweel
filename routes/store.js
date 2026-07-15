'use strict';

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/certificates.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAll(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2));
}

module.exports = { readAll, writeAll };
