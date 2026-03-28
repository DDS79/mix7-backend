import {
  CheckoutPaymentConfirmDomainError,
  createConfirmPaymentCommand,
  createHandleProviderEventCommand,
  createReconcilePaymentsCommand,
  getPaymentConfirmIdempotencyStorageKey,
  type PaymentEventRecord,
  type PaymentRecord,
  type ProviderEvent,
} from '@/modules/checkout/payment_confirm';

const VALID_INPUT = {
  buyerId: '33333333-3333-4333-8333-333333333333',
  orderId: '44444444-4444-4444-8444-444444444444',
  paymentIntentId: 'pi_123456789012345678901234',
  idempotencyKey: 'pay-confirm-12345678',
  provider: 'stub' as const,
};

const SUCCESS_EVENT: ProviderEvent = {
  eventId: 'prov_evt_success_1',
  provider: 'stub',
  providerPaymentId: 'pp_123456789012345678901234',
  paymentIntentId: VALID_INPUT.paymentIntentId,
  providerStatus: 'succeeded',
  providerSequence: 2,
  occurredAt: '2026-01-01T00:05:00.000Z',
};

const FAILURE_EVENT: ProviderEvent = {
  eventId: 'prov_evt_failed_1',
  provider: 'stub',
  providerPaymentId: 'pp_123456789012345678901234',
  paymentIntentId: VALID_INPUT.paymentIntentId,
  providerStatus: 'failed',
  providerSequence: 1,
  occurredAt: '2026-01-01T00:04:00.000Z',
};

const LATE_PENDING_EVENT: ProviderEvent = {
  eventId: 'prov_evt_pending_1',
  provider: 'stub',
  providerPaymentId: 'pp_123456789012345678901234',
  paymentIntentId: VALID_INPUT.paymentIntentId,
  providerStatus: 'requires_action',
  providerSequence: 1,
  occurredAt: '2026-01-01T00:03:00.000Z',
};

function buildPayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay_123',
    orderId: VALID_INPUT.orderId,
    buyerId: VALID_INPUT.buyerId,
    eventId: '11111111-1111-4111-8111-111111111111',
    amount: 3000,
    currency: 'USD',
    paymentMethod: 'card',
    provider: 'stub',
    status: 'pending',
    intentId: VALID_INPUT.paymentIntentId,
    providerPaymentId: SUCCESS_EVENT.providerPaymentId,
    providerStatus: 'requires_action',
    lastProviderEventId: null,
    version: 0,
    lastAppliedEventId: null,
    lastAppliedEventSequence: null,
    reconciliationState: 'idle',
    ...overrides,
  };
}

describe('createConfirmPaymentCommand', () => {
  it('uses a namespaced persisted key for payment confirm idempotency', () => {
    const rawKey = VALID_INPUT.idempotencyKey;
    const storageKey = getPaymentConfirmIdempotencyStorageKey(rawKey);

    expect(storageKey).toBe(`checkout_payment_confirm:${rawKey}`);
    expect(storageKey).not.toBe(rawKey);
  });

  it('does not mark payment succeeded without a provider event', async () => {
    const appendPaymentEvent = jest.fn(async () => undefined);

    const confirmPayment = createConfirmPaymentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadPaymentForConfirmation: async () => buildPayment(),
      appendPaymentEvent,
      storeIdempotentResponse: async () => undefined,
      now: () => new Date('2026-01-01T00:00:00Z'),
    });

    const result = await confirmPayment(VALID_INPUT);

    expect(result.status).toBe('pending_payment');
    expect(result.payment_confirmation.status).toBe('pending_provider_confirmation');
    expect(appendPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirmation_requested',
        processingStatus: 'applied',
      }),
    );
  });

  it('returns cached idempotent confirmation request result', async () => {
    const confirmPayment = createConfirmPaymentCommand({
      claimIdempotency: async () => ({
        kind: 'replay',
        response: {
          success: true,
          order_id: VALID_INPUT.orderId,
          buyer_id: VALID_INPUT.buyerId,
          event_id: '11111111-1111-4111-8111-111111111111',
          total_minor: 3000,
          status: 'pending_payment',
          payment_confirmation: {
            provider: 'stub',
            intent_id: VALID_INPUT.paymentIntentId,
            provider_payment_id: SUCCESS_EVENT.providerPaymentId,
            status: 'pending_provider_confirmation',
            requested_at: '2026-01-01T00:00:00.000Z',
            next_step: 'await_provider_confirmation',
          },
        },
      }),
      loadPaymentForConfirmation: async () => {
        throw new Error('should not load payment');
      },
      appendPaymentEvent: async () => {
        throw new Error('should not append event');
      },
      storeIdempotentResponse: async () => {
        throw new Error('should not store response');
      },
      now: () => new Date(),
    });

    const result = await confirmPayment(VALID_INPUT);

    expect(result.payment_confirmation.status).toBe('pending_provider_confirmation');
  });

  it('cannot request confirmation twice once payment is finalized', async () => {
    const confirmPayment = createConfirmPaymentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadPaymentForConfirmation: async () =>
        buildPayment({
          status: 'succeeded',
          providerStatus: 'succeeded',
        }),
      appendPaymentEvent: async () => undefined,
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await expect(confirmPayment(VALID_INPUT)).rejects.toMatchObject({
      code: 'PAYMENT_NOT_AWAITING_PROVIDER',
    });
  });

  it('cannot use a foreign intent id', async () => {
    const confirmPayment = createConfirmPaymentCommand({
      claimIdempotency: async () => ({ kind: 'claimed' }),
      loadPaymentForConfirmation: async () => null,
      appendPaymentEvent: async () => undefined,
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await expect(confirmPayment(VALID_INPUT)).rejects.toMatchObject({
      code: 'PAYMENT_NOT_FOUND',
    });
  });

  it('rejects concurrent confirmation for the same idempotency key', async () => {
    const confirmPayment = createConfirmPaymentCommand({
      claimIdempotency: async () => ({ kind: 'in_progress' }),
      loadPaymentForConfirmation: async () => buildPayment(),
      appendPaymentEvent: async () => undefined,
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await expect(confirmPayment(VALID_INPUT)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_IN_PROGRESS',
    });
  });

  it('rejects same key reuse with different payload', async () => {
    const confirmPayment = createConfirmPaymentCommand({
      claimIdempotency: async () => {
        throw new CheckoutPaymentConfirmDomainError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key was reused with different payload.',
          409,
        );
      },
      loadPaymentForConfirmation: async () => buildPayment(),
      appendPaymentEvent: async () => undefined,
      storeIdempotentResponse: async () => undefined,
      now: () => new Date(),
    });

    await expect(confirmPayment(VALID_INPUT)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });
});

describe('createHandleProviderEventCommand', () => {
  it('duplicate provider event is ignored safely', async () => {
    const persistPayment = jest.fn(async (payment: PaymentRecord) => payment);

    const handleProviderEvent = createHandleProviderEventCommand({
      loadPaymentByProviderReference: async () =>
        buildPayment({
          lastAppliedEventId: SUCCESS_EVENT.eventId,
          lastAppliedEventSequence: SUCCESS_EVENT.providerSequence,
          status: 'succeeded',
          providerStatus: 'succeeded',
          version: 2,
        }),
      persistPayment,
      loadOrderProjection: async () => 'paid',
      projectOrder: async () => 'paid',
      appendPaymentEvent: async () => 'appended',
    });

    const result = await handleProviderEvent(SUCCESS_EVENT);

    expect(result.processingStatus).toBe('ignored_duplicate');
    expect(persistPayment).not.toHaveBeenCalled();
  });

  it('older event cannot override newer state', async () => {
    const persistPayment = jest.fn(async (payment: PaymentRecord) => payment);

    const handleProviderEvent = createHandleProviderEventCommand({
      loadPaymentByProviderReference: async () =>
        buildPayment({
          status: 'succeeded',
          providerStatus: 'succeeded',
          lastAppliedEventId: SUCCESS_EVENT.eventId,
          lastAppliedEventSequence: SUCCESS_EVENT.providerSequence,
          version: 2,
        }),
      persistPayment,
      loadOrderProjection: async () => 'paid',
      projectOrder: async () => 'paid',
      appendPaymentEvent: async () => 'appended',
    });

    const result = await handleProviderEvent(FAILURE_EVENT);

    expect(result.processingStatus).toBe('ignored_stale');
    expect(result.paymentStatus).toBe('succeeded');
    expect(persistPayment).not.toHaveBeenCalled();
  });

  it('applies a newer provider success and advances monotonic version', async () => {
    const persistPayment = jest.fn(async (payment: PaymentRecord) => payment);

    const handleProviderEvent = createHandleProviderEventCommand({
      loadPaymentByProviderReference: async () => buildPayment(),
      persistPayment,
      loadOrderProjection: async () => 'pending_payment',
      projectOrder: async () => 'paid',
      appendPaymentEvent: async () => 'appended',
    });

    const result = await handleProviderEvent(SUCCESS_EVENT);

    expect(result.processingStatus).toBe('applied');
    expect(result.paymentStatus).toBe('succeeded');
    expect(result.orderStatus).toBe('paid');
    expect(persistPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'succeeded',
        version: 2,
        lastAppliedEventId: SUCCESS_EVENT.eventId,
        lastAppliedEventSequence: SUCCESS_EVENT.providerSequence,
      }),
    );
  });

  it('out-of-order conflicting event is marked pending for reconciliation', async () => {
    const persistPayment = jest.fn(async (payment: PaymentRecord) => payment);

    const handleProviderEvent = createHandleProviderEventCommand({
      loadPaymentByProviderReference: async () =>
        buildPayment({
          status: 'failed',
          providerStatus: 'failed',
          lastAppliedEventId: FAILURE_EVENT.eventId,
          lastAppliedEventSequence: FAILURE_EVENT.providerSequence,
          version: 1,
        }),
      persistPayment,
      loadOrderProjection: async () => 'failed',
      projectOrder: async () => 'failed',
      appendPaymentEvent: async () => 'appended',
    });

    const result = await handleProviderEvent(SUCCESS_EVENT);

    expect(result.processingStatus).toBe('pending_out_of_order');
    expect(persistPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        reconciliationState: 'pending',
      }),
    );
  });

  it('late pending event after success is ignored as stale', async () => {
    const persistPayment = jest.fn(async (payment: PaymentRecord) => payment);

    const handleProviderEvent = createHandleProviderEventCommand({
      loadPaymentByProviderReference: async () =>
        buildPayment({
          status: 'succeeded',
          providerStatus: 'succeeded',
          lastAppliedEventId: SUCCESS_EVENT.eventId,
          lastAppliedEventSequence: SUCCESS_EVENT.providerSequence,
          version: 2,
        }),
      persistPayment,
      loadOrderProjection: async () => 'paid',
      projectOrder: async () => 'paid',
      appendPaymentEvent: async () => 'appended',
    });

    const result = await handleProviderEvent(LATE_PENDING_EVENT);

    expect(result.processingStatus).toBe('ignored_stale');
    expect(persistPayment).not.toHaveBeenCalled();
  });

  it('projection failure is isolated from financial truth', async () => {
    let persisted: PaymentRecord[] = [];

    const handleProviderEvent = createHandleProviderEventCommand({
      loadPaymentByProviderReference: async () => buildPayment(),
      persistPayment: async (payment) => {
        persisted = [...persisted, payment];
        return payment;
      },
      loadOrderProjection: async () => 'pending_payment',
      projectOrder: async () => {
        throw new Error('projection write failed');
      },
      appendPaymentEvent: async () => 'appended',
    });

    const result = await handleProviderEvent(SUCCESS_EVENT);

    expect(result.processingStatus).toBe('failed_processing');
    expect(persisted[0]).toMatchObject({
      status: 'succeeded',
    });
    expect(persisted[1]).toMatchObject({
      reconciliationState: 'failed',
    });
  });
});

describe('createReconcilePaymentsCommand', () => {
  it('reconciliation converges failed-then-success and success-then-failure variants to provider truth', async () => {
    const applyOrder = jest.fn(async (payment: PaymentRecord) =>
      payment.status === 'succeeded' ? 'paid' : 'failed',
    );

    const reconcilePayments = createReconcilePaymentsCommand({
      loadCandidates: async () => [
        {
          payment: buildPayment({
            status: 'failed',
            providerStatus: 'failed',
            lastAppliedEventId: FAILURE_EVENT.eventId,
            lastAppliedEventSequence: FAILURE_EVENT.providerSequence,
            reconciliationState: 'pending',
            version: 1,
          }),
          orderProjectionStatus: 'failed',
          unresolvedEvents: [
            {
              eventId: SUCCESS_EVENT.eventId,
              paymentId: 'pay_123',
              processingStatus: 'pending_out_of_order',
              providerSequence: SUCCESS_EVENT.providerSequence,
              providerStatus: SUCCESS_EVENT.providerStatus,
            },
          ],
        },
      ],
      fetchProviderSnapshot: async () => ({
        providerStatus: 'succeeded',
        providerSequence: SUCCESS_EVENT.providerSequence,
        providerEventId: SUCCESS_EVENT.eventId,
      }),
      persistPayment: async (payment) => payment,
      projectOrder: applyOrder,
      appendPaymentEvent: async () => undefined,
    });

    const result = await reconcilePayments();

    expect(result).toEqual([
      {
        paymentId: 'pay_123',
        action: 'updated',
        processingStatus: 'applied',
        paymentStatus: 'succeeded',
        orderStatus: 'paid',
      },
    ]);
  });

  it('reconciliation is safe to replay', async () => {
    const candidate = {
      payment: buildPayment({
        status: 'succeeded',
        providerStatus: 'succeeded',
        lastAppliedEventId: SUCCESS_EVENT.eventId,
        lastAppliedEventSequence: SUCCESS_EVENT.providerSequence,
        version: 2,
      }),
      orderProjectionStatus: 'paid' as const,
      unresolvedEvents: [] as PaymentEventRecord[],
    };

    const reconcilePayments = createReconcilePaymentsCommand({
      loadCandidates: async () => [candidate],
      fetchProviderSnapshot: async () => ({
        providerStatus: 'succeeded',
        providerSequence: SUCCESS_EVENT.providerSequence,
        providerEventId: SUCCESS_EVENT.eventId,
      }),
      persistPayment: async (payment) => payment,
      projectOrder: async () => 'paid',
      appendPaymentEvent: async () => undefined,
    });

    const first = await reconcilePayments();
    const second = await reconcilePayments();

    expect(first).toEqual(second);
    expect(first[0].action).toBe('noop');
  });

  it('missing provider event keeps payment pending', async () => {
    const reconcilePayments = createReconcilePaymentsCommand({
      loadCandidates: async () => [
        {
          payment: buildPayment(),
          orderProjectionStatus: 'pending_payment',
          unresolvedEvents: [],
        },
      ],
      fetchProviderSnapshot: async () => ({
        providerStatus: 'requires_action',
        providerSequence: null,
        providerEventId: null,
      }),
      persistPayment: async (payment) => payment,
      projectOrder: async () => 'pending_payment',
      appendPaymentEvent: async () => undefined,
    });

    const result = await reconcilePayments();

    expect(result).toEqual([
      {
        paymentId: 'pay_123',
        action: 'noop',
        processingStatus: 'noop',
        paymentStatus: 'pending',
        orderStatus: 'pending_payment',
      },
    ]);
  });

  it('order projection can be repaired from payment truth', async () => {
    const projectOrder = jest.fn(async () => 'paid' as const);

    const reconcilePayments = createReconcilePaymentsCommand({
      loadCandidates: async () => [
        {
          payment: buildPayment({
            status: 'succeeded',
            providerStatus: 'succeeded',
            version: 2,
            lastAppliedEventId: SUCCESS_EVENT.eventId,
            lastAppliedEventSequence: SUCCESS_EVENT.providerSequence,
          }),
          orderProjectionStatus: 'pending_payment',
          unresolvedEvents: [],
        },
      ],
      fetchProviderSnapshot: async () => ({
        providerStatus: 'succeeded',
        providerSequence: SUCCESS_EVENT.providerSequence,
        providerEventId: SUCCESS_EVENT.eventId,
      }),
      persistPayment: async (payment) => payment,
      projectOrder,
      appendPaymentEvent: async () => undefined,
    });

    const result = await reconcilePayments();

    expect(result).toEqual([
      {
        paymentId: 'pay_123',
        action: 'updated',
        processingStatus: 'applied',
        paymentStatus: 'succeeded',
        orderStatus: 'paid',
      },
    ]);
    expect(projectOrder).toHaveBeenCalledTimes(1);
  });

  it('retrying reconciliation after failed processing is safe', async () => {
    let failOnce = true;

    const reconcilePayments = createReconcilePaymentsCommand({
      loadCandidates: async () => [
        {
          payment: buildPayment({
            status: 'succeeded',
            providerStatus: 'succeeded',
            reconciliationState: 'failed',
            version: 2,
            lastAppliedEventId: SUCCESS_EVENT.eventId,
            lastAppliedEventSequence: SUCCESS_EVENT.providerSequence,
          }),
          orderProjectionStatus: 'pending_payment',
          unresolvedEvents: [
            {
              eventId: SUCCESS_EVENT.eventId,
              paymentId: 'pay_123',
              processingStatus: 'failed_processing',
              providerSequence: SUCCESS_EVENT.providerSequence,
              providerStatus: 'succeeded',
            },
          ],
        },
      ],
      fetchProviderSnapshot: async () => ({
        providerStatus: 'succeeded',
        providerSequence: SUCCESS_EVENT.providerSequence,
        providerEventId: SUCCESS_EVENT.eventId,
      }),
      persistPayment: async (payment) => payment,
      projectOrder: async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error('projection repair failed');
        }
        return 'paid';
      },
      appendPaymentEvent: async () => undefined,
    });

    await expect(reconcilePayments()).rejects.toThrow('projection repair failed');
    await expect(reconcilePayments()).resolves.toEqual([
      {
        paymentId: 'pay_123',
        action: 'updated',
        processingStatus: 'applied',
        paymentStatus: 'succeeded',
        orderStatus: 'paid',
      },
    ]);
  });
});
