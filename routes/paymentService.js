'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID, randomInt } = require('crypto');

const MIN_TOP_UP_AMOUNT = 5;
const MAX_TOP_UP_AMOUNT = 500;
const MAX_PURCHASE_AMOUNT = 1000;
const DAILY_TOP_UP_LIMIT = 2000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 6;

function defaultState() {
  return {
    wallet: null,
    topUpIntents: [],
    paymentIntents: [],
    transactions: [],
    auditLog: [],
    processedWebhooks: [],
  };
}

function getPaymentFile() {
  return process.env.PAYMENT_FILE || path.join(__dirname, '../data/payments.json');
}

function readPaymentState() {
  try {
    const raw = JSON.parse(fs.readFileSync(getPaymentFile(), 'utf8'));
    return {
      ...defaultState(),
      ...raw,
      topUpIntents: Array.isArray(raw.topUpIntents) ? raw.topUpIntents : [],
      paymentIntents: Array.isArray(raw.paymentIntents) ? raw.paymentIntents : [],
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      auditLog: Array.isArray(raw.auditLog) ? raw.auditLog : [],
      processedWebhooks: Array.isArray(raw.processedWebhooks) ? raw.processedWebhooks : [],
    };
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('[payments] Failed to read state:', err.message);
    }
    return defaultState();
  }
}

function writePaymentState(state) {
  fs.writeFileSync(getPaymentFile(), JSON.stringify(state, null, 2));
}

function normalizeAmount(value) {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Voer een geldig bedrag in.');
    err.statusCode = 400;
    throw err;
  }
  return Math.round(amount * 100) / 100;
}

function requireWallet(state) {
  if (!state.wallet || state.wallet.status !== 'sandbox_active') {
    const err = new Error('Maak eerst een sandbox prepaid kaart aan.');
    err.statusCode = 400;
    throw err;
  }
}

function addAudit(state, type, message, meta) {
  state.auditLog.unshift({
    id: randomUUID(),
    type,
    message,
    meta: meta || {},
    timestamp: new Date().toISOString(),
  });
  state.auditLog = state.auditLog.slice(0, 200);
}

function assertRateLimit(state, actionType) {
  const since = Date.now() - RATE_LIMIT_WINDOW_MS;
  const recentCount = state.auditLog.filter((entry) => (
    entry.type === actionType &&
    new Date(entry.timestamp).getTime() >= since
  )).length;

  if (recentCount >= RATE_LIMIT_MAX_REQUESTS) {
    const err = new Error('Te veel betaalverzoeken in korte tijd. Probeer het over een minuut opnieuw.');
    err.statusCode = 429;
    throw err;
  }
}

function getTodaysConfirmedTopUps(state) {
  const today = new Date().toISOString().slice(0, 10);
  return state.transactions
    .filter((entry) => entry.type === 'topup' && entry.status === 'confirmed' && String(entry.createdAt || '').slice(0, 10) === today)
    .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

function createSandboxWallet(holderName) {
  const state = readPaymentState();
  assertRateLimit(state, 'wallet.requested');

  const safeName = String(holderName || '').trim();
  if (!safeName || safeName.length < 2) {
    const err = new Error('Voer een geldige kaarthoudernaam in.');
    err.statusCode = 400;
    throw err;
  }

  if (state.wallet) {
    const err = new Error('Er bestaat al een sandbox wallet in deze omgeving.');
    err.statusCode = 400;
    throw err;
  }

  const last4 = String(randomInt(1000, 10000));
  state.wallet = {
    id: randomUUID(),
    holderName: safeName,
    provider: 'Sandbox PSP',
    providerCardToken: `card_${randomUUID().replace(/-/g, '')}`,
    maskedPan: `5214 **** **** ${last4}`,
    status: 'sandbox_active',
    currency: 'EUR',
    balance: 0,
    issuedAt: new Date().toISOString(),
  };

  addAudit(state, 'wallet.requested', 'Sandbox prepaid kaart aangemaakt.', {
    provider: state.wallet.provider,
    maskedPan: state.wallet.maskedPan,
  });
  writePaymentState(state);
  return state.wallet;
}

function createTopUpIntent(amountInput) {
  const state = readPaymentState();
  requireWallet(state);
  assertRateLimit(state, 'topup.requested');

  const amount = normalizeAmount(amountInput);
  if (amount < MIN_TOP_UP_AMOUNT || amount > MAX_TOP_UP_AMOUNT) {
    const err = new Error(`Top-up bedrag moet tussen €${MIN_TOP_UP_AMOUNT.toFixed(2)} en €${MAX_TOP_UP_AMOUNT.toFixed(2)} liggen.`);
    err.statusCode = 400;
    throw err;
  }

  if (getTodaysConfirmedTopUps(state) + amount > DAILY_TOP_UP_LIMIT) {
    const err = new Error(`Daglimiet bereikt. U kunt per dag maximaal €${DAILY_TOP_UP_LIMIT.toFixed(2)} opladen.`);
    err.statusCode = 400;
    throw err;
  }

  const intent = {
    id: randomUUID(),
    type: 'topup',
    amount,
    currency: 'EUR',
    status: 'pending_confirmation',
    providerReference: `topup_${randomUUID().replace(/-/g, '')}`,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    failureReason: '',
    returnPath: '/wallet',
  };

  state.topUpIntents.unshift(intent);
  addAudit(state, 'topup.requested', `Top-up gestart voor €${amount.toFixed(2)}.`, {
    intentId: intent.id,
    amount,
  });
  writePaymentState(state);
  return intent;
}

function createPurchaseIntent(post) {
  const state = readPaymentState();
  requireWallet(state);
  assertRateLimit(state, 'checkout.requested');

  const amount = normalizeAmount(post.price);
  if (amount > MAX_PURCHASE_AMOUNT) {
    const err = new Error(`Betaling overschrijdt de sandbox limiet van €${MAX_PURCHASE_AMOUNT.toFixed(2)}.`);
    err.statusCode = 400;
    throw err;
  }

  const intent = {
    id: randomUUID(),
    type: 'purchase',
    amount,
    currency: 'EUR',
    status: 'pending_confirmation',
    providerReference: `pay_${randomUUID().replace(/-/g, '')}`,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    failureReason: '',
    postId: post.id,
    postTitle: post.title,
    returnPath: `/posts/${post.id}`,
  };

  state.paymentIntents.unshift(intent);
  addAudit(state, 'checkout.requested', `Betaalautorisatie gestart voor post "${post.title}".`, {
    intentId: intent.id,
    amount,
    postId: post.id,
  });
  writePaymentState(state);
  return intent;
}

function getIntentById(intentId, state) {
  const source = state || readPaymentState();
  return source.topUpIntents.find((entry) => entry.id === intentId) ||
    source.paymentIntents.find((entry) => entry.id === intentId) ||
    null;
}

function pushTransaction(state, transaction) {
  state.transactions.unshift(transaction);
  state.transactions = state.transactions.slice(0, 200);
}

function markIntentTerminal(intent, status, failureReason) {
  intent.status = status;
  intent.confirmedAt = new Date().toISOString();
  intent.failureReason = failureReason || '';
}

function processWebhookEvent(event) {
  const state = readPaymentState();
  const safeEvent = {
    id: String(event.id || ''),
    intentId: String(event.intentId || ''),
    outcome: String(event.outcome || ''),
  };

  if (!safeEvent.id || !safeEvent.intentId || !safeEvent.outcome) {
    const err = new Error('Webhook payload ongeldig.');
    err.statusCode = 400;
    throw err;
  }

  if (state.processedWebhooks.some((entry) => entry.id === safeEvent.id)) {
    return {
      duplicate: true,
      intent: getIntentById(safeEvent.intentId, state),
    };
  }

  const intent = getIntentById(safeEvent.intentId, state);
  if (!intent) {
    const err = new Error('Betalingsintentie niet gevonden.');
    err.statusCode = 404;
    throw err;
  }

  if (['confirmed', 'failed', 'cancelled'].includes(intent.status)) {
    state.processedWebhooks.unshift({
      id: safeEvent.id,
      intentId: safeEvent.intentId,
      outcome: safeEvent.outcome,
      processedAt: new Date().toISOString(),
      deduplicated: true,
    });
    writePaymentState(state);
    return { duplicate: false, intent };
  }

  if (safeEvent.outcome === 'approved') {
    if (intent.type === 'topup') {
      state.wallet.balance = Math.round((Number(state.wallet.balance || 0) + intent.amount) * 100) / 100;
      state.wallet.lastTopUpAt = new Date().toISOString();
      markIntentTerminal(intent, 'confirmed');
      pushTransaction(state, {
        id: randomUUID(),
        type: 'topup',
        status: 'confirmed',
        amount: intent.amount,
        currency: intent.currency,
        createdAt: intent.confirmedAt,
        reference: intent.providerReference,
        intentId: intent.id,
        description: 'Sandbox wallet opgeladen',
      });
      addAudit(state, 'topup.confirmed', `Top-up bevestigd voor €${intent.amount.toFixed(2)}.`, {
        intentId: intent.id,
      });
    } else {
      if (Number(state.wallet.balance || 0) < intent.amount) {
        markIntentTerminal(intent, 'failed', 'Onvoldoende saldo op de sandbox kaart.');
        addAudit(state, 'checkout.failed', `Betaling geweigerd wegens onvoldoende saldo voor "${intent.postTitle}".`, {
          intentId: intent.id,
          postId: intent.postId,
        });
      } else {
        state.wallet.balance = Math.round((Number(state.wallet.balance || 0) - intent.amount) * 100) / 100;
        markIntentTerminal(intent, 'confirmed');
        pushTransaction(state, {
          id: randomUUID(),
          type: 'purchase',
          status: 'confirmed',
          amount: intent.amount,
          currency: intent.currency,
          createdAt: intent.confirmedAt,
          reference: intent.providerReference,
          intentId: intent.id,
          postId: intent.postId,
          description: `Betaling voor post: ${intent.postTitle}`,
        });
        addAudit(state, 'checkout.confirmed', `Betaling bevestigd voor "${intent.postTitle}".`, {
          intentId: intent.id,
          postId: intent.postId,
        });
      }
    }
  } else if (safeEvent.outcome === 'cancelled') {
    markIntentTerminal(intent, 'cancelled', 'Autorisatie geannuleerd door de gebruiker.');
    addAudit(state, `${intent.type}.cancelled`, 'Autorisatie geannuleerd voordat de provider bevestigde.', {
      intentId: intent.id,
    });
  } else {
    markIntentTerminal(intent, 'failed', 'Provider heeft de sandbox autorisatie afgewezen.');
    addAudit(state, `${intent.type}.failed`, 'Provider meldde een mislukte autorisatie.', {
      intentId: intent.id,
    });
  }

  state.processedWebhooks.unshift({
    id: safeEvent.id,
    intentId: safeEvent.intentId,
    outcome: safeEvent.outcome,
    processedAt: new Date().toISOString(),
    deduplicated: false,
  });
  state.processedWebhooks = state.processedWebhooks.slice(0, 200);
  writePaymentState(state);
  return { duplicate: false, intent, wallet: state.wallet };
}

function confirmIntent(intentId, decision) {
  const outcome = decision === 'approve'
    ? 'approved'
    : decision === 'cancel'
      ? 'cancelled'
      : 'failed';

  return processWebhookEvent({
    id: `sandbox_event_${randomUUID().replace(/-/g, '')}`,
    intentId,
    outcome,
  });
}

function getGoLiveReadiness(stateInput) {
  const state = stateInput || readPaymentState();
  const pendingCount = [...state.topUpIntents, ...state.paymentIntents]
    .filter((entry) => entry.status === 'pending_confirmation')
    .length;
  const checks = [
    {
      key: 'wallet_configured',
      label: 'Wallet geconfigureerd',
      passed: Boolean(state.wallet),
      detail: state.wallet ? 'Provider-token en gemaskeerde kaart aanwezig.' : 'Maak eerst een wallet aan.',
    },
    {
      key: 'no_pending_confirmations',
      label: 'Geen openstaande bevestigingen',
      passed: pendingCount === 0,
      detail: pendingCount === 0 ? 'Geen openstaande top-ups of betalingen.' : `${pendingCount} bevestiging(en) wachten nog op verwerking.`,
    },
    {
      key: 'audit_logging_active',
      label: 'Audit logging actief',
      passed: state.auditLog.length > 0,
      detail: state.auditLog.length > 0 ? 'Server-side audittrail aanwezig.' : 'Nog geen audit-events beschikbaar.',
    },
    {
      key: 'render_deployment_configured',
      label: 'Render deploymentbestand aanwezig',
      passed: fs.existsSync(path.join(__dirname, '../render.yaml')),
      detail: 'render.yaml bepaalt de deploy-configuratie voor live hosting.',
    },
    {
      key: 'external_provider_live_approval',
      label: 'Externe live-goedkeuring',
      passed: false,
      detail: 'KYC/AML, provider-contracten en productiecertificaten moeten buiten deze app worden afgegeven.',
    },
  ];

  return {
    mode: 'test',
    canGoLive: checks.every((entry) => entry.passed),
    checks,
  };
}

module.exports = {
  MIN_TOP_UP_AMOUNT,
  MAX_TOP_UP_AMOUNT,
  DAILY_TOP_UP_LIMIT,
  readPaymentState,
  createSandboxWallet,
  createTopUpIntent,
  createPurchaseIntent,
  getIntentById,
  confirmIntent,
  getGoLiveReadiness,
};
