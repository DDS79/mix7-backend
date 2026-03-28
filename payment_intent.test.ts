import {
  CheckoutPaymentIntentDomainError,
  createInitiatePaymentIntentCommand,
  getPaymentIntentIdempotencyStorageKey,
  type PaymentRecord,
} from '@/modules/checkout/payment_intent';

const VALID_INPUT = {
  buyerId: '33333333-3333-4333-8333-333333333333',
  orderId: '44444444-4444-4444-8444-444444444444',
  amount: 3000,
  currency: 'USD',
  paymentMethod: 'card' as const,
  idempotencyKey: 'pay-intent-12345678',
  provider: 'stub' as const,
};

const VALID_ORDER = {
  id: VALID_INPUT.orderId,
  buyerId: VALID_INPUT.buyerId,
  eventId: '11111111-1111-4111-8111-111111111111',
  totalMinor: 3000,
  status: 'pending_payment' as const,
  paymentProvider: 'stub',
};

function buildPayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay_123',
    orderId: VALID_INPUT.orderId,
    buyerId: VALID_INPUT.buyerId,
    eventId: VALID_ORDER.eventId,
    amount: VALID_INPUT.amount,
    currency: VALID_INPUT.currency,
    paymentMethod: VALID_INPUT.paymentMethod,
    provider: 'stub',
    status: 'pending',
    intentId: 'pi_123456789012345678901234',
    providerPaymentId: 'pp_123456789012345678901234',
    providerStatus: 'requires_action',
    lastProviderEventId: null,
    version: 0,
    lastAppliedEventId: null,
    lastAppliedEventSequence: null,
    reconciliationState: 'idle',
    ...overrides,
  };
}

describe('createInitiatePaymentIntentCommand', () => {
  it('uses a namespaced persisted key for payment intent idempotency', () => {
    const rawKey = VALID_INPUT.idempotencyKey;
    const storageKey = getPaymentIntentIdempotencyStorageKey(rawKey);

    expect(storageKey).toBe(`checkout_payment_intent:${rawKey}`);
    expect(storageKey).not.toBe(rawKey);
  });

  it('creates a canonical payment record for a pending_payment order', async () => {
    const createCanonicalPayment = jest.fn(async ({ intentId }) =>
      buildPayment({ intentId }),
    );

    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadOrderForPayment: async () => VALID_ORDER,
      bindPaymentProvider: async () => 'stub',
      loadCanonicalPayment: async () => null,
      createCanonicalPayment,
      storeIdempotentResponse: async () => undefined,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const result = await initiatePaymentIntent(VALID_INPUT);

    expect(result.status).toBe('pending_payment');
    expect(result.payment_intent.intent_id).toMatch(/^pi_/);
    expect(result.payment_intent.provider_payment_id).toMatch(/^pp_/);
    expect(createCanonicalPayment).toHaveBeenCalledTimes(1);
  });

  it('returns cached idempotent payment intent result for the same key', async () => {
    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => ({
        kind: 'replay',
        response: {
          success: true,
          order_id: VALID_INPUT.orderId,
          buyer_id: VALID_INPUT.buyerId,
          event_id: VALID_ORDER.eventId,
          total_minor: VALID_INPUT.amount,
          status: 'pending_payment',
          payment_intent: {
            provider: 'stub',
            status: 'requires_action',
            intent_id: 'pi_cached',
            provider_payment_id: 'pp_cached',
            next_step: 'payment_confirm',
            expires_at: '2026-01-01T00:15:00.000Z',
            handoff: {
              kind: 'redirect_token',
              token: 'ptok_cached',
              redirect_path: '/checkout/pay/pi_cached',
            },
          },
        },
      }),
      loadOrderForPayment: async () => {
        throw new Error('should not load order');
      },
      bindPaymentProvider: async () => {
        throw new Error('should not bind provider');
      },
      loadCanonicalPayment: async () => {
        throw new Error('should not load payment');
      },
      createCanonicalPayment: async () => {
        throw new Error('should not create payment');
      },
      storeIdempotentResponse: async () => {
        throw new Error('should not store response');
      },
      now: () => new Date(),
    });

    const result = await initiatePaymentIntent(VALID_INPUT);

    expect(result.payment_intent.intent_id).toBe('pi_cached');
  });

  it('reuses the same canonical payment for a different key with the same payload', async () => {
    const existingPayment = buildPayment();
    const createCanonicalPayment = jest.fn(async () => existingPayment);

    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadOrderForPayment: async () => VALID_ORDER,
      bindPaymentProvider: async () => 'stub',
      loadCanonicalPayment: async () => existingPayment,
      createCanonicalPayment,
      storeIdempotentResponse: async () => undefined,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const result = await initiatePaymentIntent({
      ...VALID_INPUT,
      idempotencyKey: 'pay-intent-87654321',
    });

    expect(result.payment_intent.intent_id).toBe(existingPayment.intentId);
    expect(createCanonicalPayment).not.toHaveBeenCalled();
  });

  it('rejects payload drift against the canonical payment record', async () => {
    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadOrderForPayment: async () => VALID_ORDER,
      bindPaymentProvider: async () => 'stub',
      loadCanonicalPayment: async () =>
        buildPayment({
          currency: 'EUR',
        }),
      createCanonicalPayment: async () => buildPayment(),
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await expect(initiatePaymentIntent(VALID_INPUT)).rejects.toMatchObject({
      code: 'PAYMENT_PAYLOAD_MISMATCH',
    });
  });

  it('rejects a mismatched order amount before payment creation', async () => {
    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadOrderForPayment: async () => ({
        ...VALID_ORDER,
        totalMinor: 2500,
      }),
      bindPaymentProvider: async () => 'stub',
      loadCanonicalPayment: async () => null,
      createCanonicalPayment: async () => buildPayment(),
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await expect(initiatePaymentIntent(VALID_INPUT)).rejects.toMatchObject({
      code: 'ORDER_AMOUNT_MISMATCH',
    });
  });

  it('requires order ownership during lookup', async () => {
    const loadOrderForPayment = jest.fn(async () => VALID_ORDER);

    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadOrderForPayment,
      bindPaymentProvider: async () => 'stub',
      loadCanonicalPayment: async () => null,
      createCanonicalPayment: async ({ intentId }) => buildPayment({ intentId }),
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await initiatePaymentIntent(VALID_INPUT);

    expect(loadOrderForPayment).toHaveBeenCalledWith(
      VALID_INPUT.orderId,
      VALID_INPUT.buyerId,
    );
  });

  it('rejects a concurrent identical request while the first is in progress', async () => {
    let state: 'idle' | 'in_progress' | 'completed' = 'idle';
    let releaseSideEffect: (() => void) | undefined;
    let sideEffects = 0;

    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => {
        if (state === 'idle') {
          state = 'in_progress';
          return { kind: 'claimed' };
        }
        if (state === 'in_progress') {
          return { kind: 'in_progress' };
        }
        return {
          kind: 'replay',
          response: {
            success: true,
            order_id: VALID_INPUT.orderId,
            buyer_id: VALID_INPUT.buyerId,
            event_id: VALID_ORDER.eventId,
            total_minor: VALID_INPUT.amount,
            status: 'pending_payment',
            payment_intent: {
              provider: 'stub',
              status: 'requires_action',
              intent_id: 'pi_replay',
              provider_payment_id: 'pp_replay',
              next_step: 'payment_confirm',
              expires_at: '2026-01-01T00:15:00.000Z',
              handoff: {
                kind: 'redirect_token',
                token: 'ptok_replay',
                redirect_path: '/checkout/pay/pi_replay',
              },
            },
          },
        };
      },
      loadOrderForPayment: async () => VALID_ORDER,
      bindPaymentProvider: async () => {
        sideEffects += 1;
        await new Promise<void>((resolve) => {
          releaseSideEffect = resolve;
        });
        return 'stub';
      },
      loadCanonicalPayment: async () => null,
      createCanonicalPayment: async ({ intentId }) => buildPayment({ intentId }),
      storeIdempotentResponse: async () => {
        state = 'completed';
      },
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const firstPromise = initiatePaymentIntent(VALID_INPUT);
    await Promise.resolve();

    await expect(initiatePaymentIntent(VALID_INPUT)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
    expect(sideEffects).toBe(1);

    releaseSideEffect?.();
    await expect(firstPromise).resolves.toMatchObject({
      success: true,
      order_id: VALID_INPUT.orderId,
    });
  });

  it('fails when order is not pending_payment', async () => {
    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadOrderForPayment: async () => ({
        ...VALID_ORDER,
        status: 'paid',
      }),
      bindPaymentProvider: async () => 'stub',
      loadCanonicalPayment: async () => null,
      createCanonicalPayment: async ({ intentId }) => buildPayment({ intentId }),
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await expect(initiatePaymentIntent(VALID_INPUT)).rejects.toMatchObject({
      code: 'ORDER_NOT_PENDING_PAYMENT',
    });
  });

  it('fails with IDEMPOTENCY_CONFLICT when the same key is reused with different input', async () => {
    const initiatePaymentIntent = createInitiatePaymentIntentCommand({
      claimIdempotency: async () => {
        throw new CheckoutPaymentIntentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key was reused with different payload.',
          409,
        );
      },
      loadOrderForPayment: async () => VALID_ORDER,
      bindPaymentProvider: async () => 'stub',
      loadCanonicalPayment: async () => null,
      createCanonicalPayment: async ({ intentId }) => buildPayment({ intentId }),
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await expect(initiatePaymentIntent(VALID_INPUT)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
});
