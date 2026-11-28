'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x3star-tx-recovery-'));
process.env.DATA_DIR = dataDir;
process.env.DB_FILE = path.join(dataDir, 'test.db');
const D = require('../server/db');

test('transactions recover after a competing writer blocks BEGIN and preserve nested rollback', () => {
  const competingWriter = new DatabaseSync(process.env.DB_FILE);
  try {
    D.db.exec('PRAGMA busy_timeout = 1');
    D.run('CREATE TABLE transaction_probe (id INTEGER PRIMARY KEY, balance INTEGER NOT NULL)');
    D.tx(() => D.run('INSERT INTO transaction_probe VALUES (1, 100)'));

    competingWriter.exec('BEGIN IMMEDIATE');
    let callbackEntered = false;
    assert.throws(() => D.tx(() => { callbackEntered = true; }), /database is locked/);
    assert.equal(callbackEntered, false, 'a failed BEGIN must not run the transaction callback');
    competingWriter.exec('ROLLBACK');

    assert.throws(() => D.tx(() => {
      D.run('UPDATE transaction_probe SET balance = 75 WHERE id = 1');
      D.tx(() => D.run('INSERT INTO transaction_probe VALUES (2, 25)'));
      throw new Error('transfer rejected');
    }), /transfer rejected/);
    assert.equal(D.get('SELECT balance FROM transaction_probe WHERE id = 1').balance, 100);
    assert.equal(D.get('SELECT COUNT(*) AS count FROM transaction_probe').count, 1);

    D.tx(() => {
      D.run('UPDATE transaction_probe SET balance = 75 WHERE id = 1');
      D.tx(() => D.run('INSERT INTO transaction_probe VALUES (2, 25)'));
    });
    assert.equal(D.get('SELECT balance FROM transaction_probe WHERE id = 1').balance, 75);
    assert.equal(D.get('SELECT balance FROM transaction_probe WHERE id = 2').balance, 25);
  } finally {
    try { competingWriter.exec('ROLLBACK'); } catch {}
    competingWriter.close();
    D.db.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
