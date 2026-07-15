'use strict';

/**
 * Sphinx-achtig onion-routing cryptografie engine
 *
 * Gebaseerd op het Sphinx packet format principe:
 *   - Elke hop ontsleutelt één laag via ECDH (P-256) + AES-256-GCM
 *   - Elke laag bevat een tijdelijk ECDH-sleutelpaar zodat de verzender anoniem blijft
 *   - Pakketauthenticiteit wordt gegarandeerd via AES-GCM auth-tags
 *   - Merkle-boom voor transparant, verifieerbaar log van gerouteerde pakketten
 *
 * Vereist Node.js >= 18 (hkdfSync + diffieHellman KeyObject API).
 */

const crypto = require('crypto');

const HKDF_INFO = 'card-virtuweel-onion-v1';

// Vaste lege bladwaarde voor Merkle-boom (expliciete constante i.p.v. magische string)
const EMPTY_MERKLE_LEAF = 'empty';

// Scheidingsteken tussen Merkle-knopen om hash-botsingen door aaneenschakeling te voorkomen
const MERKLE_SEPARATOR = '|';

// ─── Sleutelbeheer ───────────────────────────────────────────────────────────

/**
 * Genereer een EC P-256 sleutelpaar.
 * @returns {{ privateKey: string, publicKey: string }} PEM-geëncodeerde sleutels
 */
function generateKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

// ─── Laag-encryptie ──────────────────────────────────────────────────────────

/**
 * Versleutel één laag voor een relay-node via ephemeral ECDH + AES-256-GCM.
 *
 * Pakketindeling (binair):
 *   [2 bytes: ephemerale pubkey-lengte]
 *   [N bytes: ephemerale pubkey (DER/SPKI)]
 *   [12 bytes: IV]
 *   [16 bytes: AES-GCM auth-tag]
 *   [M bytes: ciphertext]
 *
 * @param {Buffer|string} plaintext  Te versleutelen inhoud
 * @param {string} recipientPublicKeyPem  PEM publieke sleutel van de relay-node
 * @returns {Buffer}
 */
function encryptLayer(plaintext, recipientPublicKeyPem) {
  // Tijdelijk sleutelpaar voor deze hop (afzender-anonimiteit)
  const { privateKey: ephPrivPem, publicKey: ephPubDer } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // ECDH gedeeld geheim
  const recipientPubKey = crypto.createPublicKey({ key: recipientPublicKeyPem, format: 'pem' });
  const sharedSecret = crypto.diffieHellman({
    privateKey: crypto.createPrivateKey(ephPrivPem),
    publicKey: recipientPubKey,
  });

  // HKDF-SHA256 → 32-byte AES sleutel
  const aesKey = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, '', HKDF_INFO, 32));

  // AES-256-GCM versleuteling
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext));
  const ciphertext = Buffer.concat([cipher.update(pt), cipher.final()]);
  const authTag = cipher.getAuthTag(); // altijd 16 bytes

  // Frame samenvoegen
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16BE(ephPubDer.length);
  return Buffer.concat([lenBuf, ephPubDer, iv, authTag, ciphertext]);
}

/**
 * Ontsleutel één laag met de privésleutel van de relay-node.
 *
 * @param {Buffer} packetBuf  Versleuteld pakket
 * @param {string} nodePrivateKeyPem  PEM privésleutel van de relay-node
 * @returns {Buffer}  Ontsleutelde binnenlaag (kan nog een pakketlaag of eindpayload zijn)
 */
function decryptLayer(packetBuf, nodePrivateKeyPem) {
  let offset = 0;

  const ephPubLen = packetBuf.readUInt16BE(offset); offset += 2;
  const ephPubDer = packetBuf.subarray(offset, offset + ephPubLen); offset += ephPubLen;
  const iv = packetBuf.subarray(offset, offset + 12); offset += 12;
  const authTag = packetBuf.subarray(offset, offset + 16); offset += 16;
  const ciphertext = packetBuf.subarray(offset);

  const ephPubKey = crypto.createPublicKey({ key: ephPubDer, format: 'der', type: 'spki' });
  const nodePrivKey = crypto.createPrivateKey(nodePrivateKeyPem);

  const sharedSecret = crypto.diffieHellman({ privateKey: nodePrivKey, publicKey: ephPubKey });
  const aesKey = Buffer.from(crypto.hkdfSync('sha256', sharedSecret, '', HKDF_INFO, 32));

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ─── Onion pakket bouw ───────────────────────────────────────────────────────

/**
 * Bouw een volledig N-laags onion-pakket.
 * De payload wordt gewikkeld van binnenste naar buitenste laag, zodat
 * hop 1 de buitenste laag ontsleutelt en de rest doorstuur.
 *
 * @param {Buffer|string|object} payload  Eindinhoud van het pakket
 * @param {string[]} nodePubKeys  Array van PEM publieke sleutels [hop1, hop2, … hopN]
 * @returns {Buffer}
 */
function buildOnionPacket(payload, nodePubKeys) {
  let packet;
  if (Buffer.isBuffer(payload)) {
    packet = payload;
  } else if (typeof payload === 'string') {
    packet = Buffer.from(payload, 'utf8');
  } else {
    packet = Buffer.from(JSON.stringify(payload), 'utf8');
  }
  // Versleutel van binnenste naar buitenste laag:
  // het laatste element (hopN) wordt als eerste versleuteld en vormt de binnenste laag;
  // het eerste element (hop1) wordt als laatste versleuteld en vormt de buitenste laag.
  // Bij relaying ontsleutelt hop1 de buitenste laag en stuurt de rest door naar hop2.
  for (let i = nodePubKeys.length - 1; i >= 0; i--) {
    packet = encryptLayer(packet, nodePubKeys[i]);
  }
  return packet;
}

// ─── Cryptografische hulpfuncties ─────────────────────────────────────────────

/**
 * SHA-256 hash van willekeurige invoer, retourneert hexadecimale string.
 * @param {Buffer|string} data
 * @returns {string}
 */
function sha256(data) {
  const input = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8');
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Bouw een Merkle-boom en retourneer de root-hash.
 * Gebruikt dubbele hashing op bladknoop-paren (Bitcoin-stijl).
 *
 * @param {string[]} leaves  Array van strings (bijv. pakket-IDs of hashes)
 * @returns {string}  Hex Merkle-root
 */
function merkleRoot(leaves) {
  if (!leaves || leaves.length === 0) return sha256(EMPTY_MERKLE_LEAF);
  let hashes = leaves.map(l => sha256(l));
  while (hashes.length > 1) {
    const next = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i];
      const right = i + 1 < hashes.length ? hashes[i + 1] : hashes[i];
      // Gebruik een scheidingsteken '|' om hash-botsingen door aaneenschakeling te voorkomen
      next.push(sha256(left + MERKLE_SEPARATOR + right));
    }
    hashes = next;
  }
  return hashes[0];
}

module.exports = { generateKeypair, encryptLayer, decryptLayer, buildOnionPacket, sha256, merkleRoot, MERKLE_SEPARATOR };
