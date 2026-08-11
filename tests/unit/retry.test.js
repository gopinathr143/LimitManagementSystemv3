import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withTransientRetry } from '../../src/utils/retry.js';

function transientError(code = 112) {
  const err = new Error('simulated transient');
  err.code = code;
  return err;
}

describe('withTransientRetry — BRD §3.3 step 6 / §4.11 AC3 observability hooks', () => {
  test('a non-transient error is rethrown immediately, no retry, no hooks fired', async () => {
    let attempts = 0;
    const onTransient = () => assert.fail('onTransient must not fire for a non-transient error');
    const onExhausted = () => assert.fail('onExhausted must not fire for a non-transient error');
    await assert.rejects(
      () =>
        withTransientRetry(() => {
          attempts += 1;
          throw new Error('permanent failure');
        }, { onTransient, onExhausted }),
      /permanent failure/,
    );
    assert.equal(attempts, 1);
  });

  test('a transient error that eventually succeeds calls onTransient per retry and never onExhausted', async () => {
    let attempts = 0;
    let transientCalls = 0;
    const result = await withTransientRetry(
      () => {
        attempts += 1;
        if (attempts < 3) {
          throw transientError();
        }
        return 'ok';
      },
      { onTransient: () => { transientCalls += 1; }, onExhausted: () => assert.fail('onExhausted must not fire on eventual success') },
    );
    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
    assert.equal(transientCalls, 2);
  });

  test('a transient error on every attempt exhausts retries and calls onExhausted exactly once', async () => {
    let attempts = 0;
    let transientCalls = 0;
    let exhaustedCalls = 0;
    await assert.rejects(
      () =>
        withTransientRetry(
          () => {
            attempts += 1;
            throw transientError();
          },
          { onTransient: () => { transientCalls += 1; }, onExhausted: () => { exhaustedCalls += 1; } },
        ),
      (err) => err.code === 112,
    );
    assert.equal(attempts, 4, '3 backoff attempts plus the final bare call');
    assert.equal(transientCalls, 3);
    assert.equal(exhaustedCalls, 1);
  });

  test('hooks are optional — retry behavior is unchanged when omitted', async () => {
    let attempts = 0;
    const result = await withTransientRetry(() => {
      attempts += 1;
      if (attempts < 2) {
        throw transientError();
      }
      return 'ok';
    });
    assert.equal(result, 'ok');
    assert.equal(attempts, 2);
  });
});
