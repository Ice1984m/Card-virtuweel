'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadService(paymentFile) {
  process.env.PAYMENT_FILE = paymentFile;
  const modulePath = path.join(__dirname, '../routes/paymentService.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('top-up confirm updates balance and readiness output', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-virtuweel-payments-'));
  const paymentFile = path.join(tempDir, 'payments.json');
  const service = loadService(paymentFile);

  service.createSandboxWallet('Test Gebruiker');
  const topUp = service.createTopUpIntent('25.00');
  const result = service.confirmIntent(topUp.id, 'approve');
  const state = service.readPaymentState();
  const readiness = service.getGoLiveReadiness(state);

  assert.equal(result.intent.status, 'confirmed');
  assert.equal(state.wallet.balance, 25);
  assert.equal(state.transactions[0].type, 'topup');
  assert.equal(readiness.mode, 'test');
  assert.equal(readiness.canGoLive, false);
  assert.ok(readiness.checks.some((check) => check.key === 'render_deployment_configured'));
});

test('purchase fails when balance is insufficient', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-virtuweel-payments-'));
  const paymentFile = path.join(tempDir, 'payments.json');
  const service = loadService(paymentFile);

  service.createSandboxWallet('Nog Een Test');
  const purchase = service.createPurchaseIntent({
    id: 'post-1',
    title: 'Testproduct',
    price: 40,
  });
  const result = service.confirmIntent(purchase.id, 'approve');
  const state = service.readPaymentState();

  assert.equal(result.intent.status, 'failed');
  assert.equal(state.wallet.balance, 0);
  assert.equal(state.transactions.length, 0);
  assert.match(result.intent.failureReason, /Onvoldoende saldo/);
});

test('approval report exposes sandbox-dev render approval data', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-virtuweel-payments-'));
  const paymentFile = path.join(tempDir, 'payments.json');
  const service = loadService(paymentFile);

  const report = service.generateApprovalReport(service.readPaymentState());

  assert.equal(report.environment, 'sandbox-dev');
  assert.equal(report.render.source, 'render.yaml');
  assert.equal(report.approvalStatus, 'pending_external_approval');
  assert.ok(Array.isArray(report.nextActions));
});
