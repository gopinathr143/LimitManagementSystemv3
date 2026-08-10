import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateApiKey, hashApiKey, fingerprintOf, timingSafeStringEqual } from '../../src/utils/crypto.js';

describe('crypto utils', () => {
  test('generateApiKey produces unique, non-trivial secrets', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    assert.notEqual(a, b);
    assert.ok(a.length >= 32);
  });

  test('hashApiKey is deterministic', () => {
    const key = 'fixed-test-key';
    assert.equal(hashApiKey(key), hashApiKey(key));
  });

  test('fingerprintOf is a short, non-reversible prefix', () => {
    const hash = hashApiKey('some-key');
    const fp = fingerprintOf(hash);
    assert.equal(fp.length, 12);
    assert.equal(hash.startsWith(fp), true);
  });

  test('timingSafeStringEqual compares correctly regardless of length', () => {
    assert.equal(timingSafeStringEqual('abc', 'abc'), true);
    assert.equal(timingSafeStringEqual('abc', 'abcd'), false);
    assert.equal(timingSafeStringEqual('abc', 'xyz'), false);
  });
});
