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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-virtueel-payments-'));
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-virtueel-payments-'));
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-virtueel-payments-'));
  const paymentFile = path.join(tempDir, 'payments.json');
  const service = loadService(paymentFile);

  const report = service.generateApprovalReport(service.readPaymentState());

  assert.equal(report.environment, 'sandbox-dev');
  assert.equal(report.render.source, 'render.yaml');
  assert.equal(report.approvalStatus, 'pending_external_approval');
  assert.ok(Array.isArray(report.nextActions));
});

test('invoice generation and payment marks invoice as paid', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-virtueel-payments-'));
  const paymentFile = path.join(tempDir, 'payments.json');
  const service = loadService(paymentFile);

  service.createSandboxWallet('Factuur Tester');
  const topUp = service.createTopUpIntent('100');
  service.confirmIntent(topUp.id, 'approve');

  const invoice = service.createInvoice({
    description: 'APK update app',
    amount: 25,
  });
  const intent = service.createInvoicePaymentIntent(invoice.id);
  const result = service.confirmIntent(intent.id, 'approve');
  const state = service.readPaymentState();
  const paidInvoice = state.invoices.find((entry) => entry.id === invoice.id);

  assert.equal(result.intent.status, 'confirmed');
  assert.equal(state.wallet.balance, 75);
  assert.equal(paidInvoice.status, 'paid');
  assert.equal(paidInvoice.paymentIntentId, intent.id);
  assert.ok(paidInvoice.paidAt);
});

test('invoice due date cannot be in the past', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-virtueel-payments-'));
  const paymentFile = path.join(tempDir, 'payments.json');
  const service = loadService(paymentFile);

  assert.throws(() => {
    service.createInvoice({
      description: 'Verlopen factuur',
      amount: 10,
      dueDate: '2000-01-01',
    });
  }, /Vervaldatum mag niet in het verleden liggen/);
});
