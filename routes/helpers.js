'use strict';

const fs = require('fs');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[readJson] Failed to read ${filePath}:`, err.message);
    }
    return [];
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function formatPrice(price) {
  return Number(price || 0).toFixed(2);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

module.exports = { readJson, writeJson, formatPrice, escHtml, safeExternalUrl };
