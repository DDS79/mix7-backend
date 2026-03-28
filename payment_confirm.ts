import { and, eq } from './test_stubs/drizzle-orm';
import { db } from './test_stubs/db-client';
import { idempotencyKeys, orders, paymentEvents, payments } from './test_stubs/db-schema';
import { hashRequest } from './test_stubs/idempotency';

export class CheckoutPaymentConfirmDomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'CheckoutPaymentConfirmDomainError';
    this.code = code;
    this.status = status;
  }
}

export type PaymentFinancialState =
  | 'pending'
  | 'provider_confirmed'
  | 'succeeded'
  | 'failed'
  | 'reconciliation_pending'
  | 'reconciliation_failed';

export type OrderProjectionStatus = 'pending_payment' | 'paid' | 'failed';

export type ReconciliationState = 'idle' | 'pending' | 'failed';

export type EventProcessingStatus =
  | 'applied'
  | 'ignored_duplicate'
  | 'ignored_stale'
  | 'pending_out_of_order'
  | 'failed_processing';

export type PaymentRecord = {
  id: string;
  orderId: string;
  buyerId: string;
  eventId: string;
  amount: number;
  currency: string;
  paymentMethod: 'card' | 'bank_transfer' | 'wallet';
  provider: 'stub';
  status: PaymentFinancialState;
  intentId: string;
  providerPaymentId: string;
  providerStatus: 'requires_action' | 'succeeded' | 'failed';
  lastProviderEventId: string | null;
  version: number;
  lastAppliedEventId: string | null;
  lastAppliedEventSequence: number | null;
  reconciliationState: ReconciliationState;
};

export type ConfirmPaymentInput = {
  buyerId: string;
  orderId: string;
  paymentIntentId: string;
  idempotencyKey: string;
  provider?: 'stub';
};

export type ConfirmPaymentResult = {
  success: true;
  order_id: string;
  buyer_id: string;
  event_id: string;
  total_minor: number;
  status: 'pending_payment';
  payment_confirmation: {
    provider: 'stub';
    intent_id: string;
    provider_payment_id: string;
    status: 'pending_provider_confirmation';
    requested_at: string;
    next_step: 'await_provider_confirmation';
  };
};

export type ProviderEvent = {
  eventId: string;
  provider: 'stub';
  providerPaymentId: string;
  paymentIntentId: string;
  providerStatus: 'requires_action' | 'succeeded' | 'failed';
  providerSequence: number;
  occurredAt: string;
};

export type ProviderSnapshot = {
  providerStatus: 'requires_action' | 'succeeded' | 'failed';
  providerSequence: number | null;
  providerEventId: string | null;
};

export type PaymentEventRecord = {
  eventId: string;
  paymentId: string;
  processingStatus: EventProcessingStatus;
  providerSequence: number | null;
  providerStatus: 'requires_action' | 'succeeded' | 'failed' | null;
};

export type ProviderEventResult = {
  success: true;
  paymentId: string;
  orderId: string;
  processingStatus: EventProcessingStatus;
  paymentStatus: PaymentFinancialState;
  orderStatus: OrderProjectionStatus;
};

export type ReconcilePaymentCandidate = {
  payment: PaymentRecord;
  orderProjectionStatus: OrderProjectionStatus;
  unresolvedEvents: PaymentEventRecord[];
};

export type ReconcilePaymentResult = {
  paymentId: string;
  action: 'noop' | 'updated';
  processingStatus: EventProcessingStatus | 'noop';
  paymentStatus: PaymentFinancialState;
  orderStatus: OrderProjectionStatus;
};

export const PAYMENT_EVENTUAL_CONSISTENCY_CONTRACT = {
  allowedIntermediateStates: ['pending', 'provider_confirmed', 'reconciliation_pending'],
  convergenceAuthority: 'provider_truth_then_reconciliation',
  projectionRule: 'order_projection_is_derived_from_payment_truth',
  unresolvedEventStatuses: ['pending_out_of_order', 'failed_processing'],
} as const;

type IdempotencyClaim =
  | { kind: 'claimed' }
  | { kind: 'replay'; response: ConfirmPaymentResult }
  | { kind: 'in_progress' };

type ConfirmPaymentDeps = {
  claimIdempotency: (
    input: ConfirmPaymentInput,
    requestHash: string,
  ) => Promise<IdempotencyClaim>;
  loadPaymentForConfirmation: (
    orderId: string,
    buyerId: string,
    paymentIntentId: string,
  ) => Promise<PaymentRecord | null>;
  appendPaymentEvent: (args: {
    paymentId: string;
    type: string;
    payload: Record<string, unknown>;
    processingStatus: EventProcessingStatus | 'noop';
    eventId?: string | null;
    providerSequence?: number | null;
  }) => Promise<void>;
  storeIdempotentResponse: (
    input: ConfirmPaymentInput,
    requestHash: string,
    result: ConfirmPaymentResult,
  ) => Promise<void>;
  now: () => Date;
};

type HandleProviderEventDeps = {
  loadPaymentByProviderReference: (
    providerPaymentId: string,
    paymentIntentId: string,
  ) => Promise<PaymentRecord | null>;
  persistPayment: (payment: PaymentRecord) => Promise<PaymentRecord>;
  loadOrderProjection: (orderId: string) => Promise<OrderProjectionStatus>;
  projectOrder: (
    payment: PaymentRecord,
  ) => Promise<OrderProjectionStatus>;
  appendPaymentEvent: (args: {
    paymentId: string;
    type: string;
    payload: Record<string, unknown>;
    processingStatus: EventProcessingStatus;
    eventId: string;
    providerSequence: number | null;
  }) => Promise<'appended' | 'duplicate'>;
};

type ReconcilePaymentsDeps = {
  loadCandidates: () => Promise<ReconcilePaymentCandidate[]>;
  fetchProviderSnapshot: (payment: PaymentRecord) => Promise<ProviderSnapshot>;
  persistPayment: (payment: PaymentRecord) => Promise<PaymentRecord>;
  projectOrder: (
    payment: PaymentRecord,
  ) => Promise<OrderProjectionStatus>;
  appendPaymentEvent: (args: {
    paymentId: string;
    type: string;
    payload: Record<string, unknown>;
    processingStatus: EventProcessingStatus | 'noop';
    eventId?: string | null;
    providerSequence?: number | null;
  }) => Promise<void>;
};

const IDEMPOTENCY_SCOPE = 'checkout_payment_confirm';
const PAYMENT_PROVIDER = 'stub' as const;
const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9:_-]{8,128}$/;
const PAYMENT_INTENT_ID_FORMAT = /^pi_[A-Za-z0-9:_-]{8,128}$/;

export function getPaymentConfirmIdempotencyStorageKey(idempotencyKey: string) {
  return `${IDEMPOTENCY_SCOPE}:${idempotencyKey}`;
}

function ensureIdempotencyKeyFormat(idempotencyKey: string) {
  if (!IDEMPOTENCY_KEY_FORMAT.test(idempotencyKey)) {
    throw new CheckoutPaymentConfirmDomainError(
      'INVALID_IDEMPOTENCY_KEY',
      'Invalid idempotency key.',
      400,
    );
  }
}

function ensurePaymentIntentIdFormat(paymentIntentId: string) {
  if (!PAYMENT_INTENT_ID_FORMAT.test(paymentIntentId)) {
    throw new CheckoutPaymentConfirmDomainError(
      'INVALID_PAYMENT_INTENT_ID',
      'Invalid payment intent id.',
      400,
    );
  }
}

function ensurePaymentCanRequestConfirmation(payment: PaymentRecord, provider: 'stub') {
  if (payment.provider !== provider) {
    throw new CheckoutPaymentConfirmDomainError(
      'PAYMENT_PROVIDER_MISMATCH',
      'Payment is bound to a different payment provider.',
      409,
    );
  }

  if (payment.status !== 'pending' || payment.providerStatus !== 'requires_action') {
    throw new CheckoutPaymentConfirmDomainError(
      'PAYMENT_NOT_AWAITING_PROVIDER',
      'Payment is not awaiting provider confirmation.',
      409,
    );
  }
}

function deriveOrderProjectionStatus(
  payment: PaymentRecord,
): OrderProjectionStatus {
  if (payment.status === 'succeeded') {
    return 'paid';
  }

  if (payment.status === 'failed') {
    return 'failed';
  }

  return 'pending_payment';
}

function buildVersionedPayment(
  payment: PaymentRecord,
  overrides: Partial<PaymentRecord>,
  versionIncrement: number,
  event: ProviderEvent | ProviderSnapshot,
): PaymentRecord {
  return {
    ...payment,
    ...overrides,
    version: payment.version + versionIncrement,
    lastAppliedEventId:
      'eventId' in event ? event.eventId : event.providerEventId,
    lastAppliedEventSequence: event.providerSequence,
  };
}

function applyProviderEventTransition(
  payment: PaymentRecord,
  event: ProviderEvent,
): {
  processingStatus: EventProcessingStatus;
  nextPayment: PaymentRecord;
} {
  if (payment.lastAppliedEventId === event.eventId) {
    return {
      processingStatus: 'ignored_duplicate',
      nextPayment: payment,
    };
  }

  if (
    payment.lastAppliedEventSequence !== null &&
    event.providerSequence <= payment.lastAppliedEventSequence
  ) {
    return {
      processingStatus: 'ignored_stale',
      nextPayment: payment,
    };
  }

  if (event.providerStatus === 'requires_action') {
    if (payment.status === 'pending') {
      return {
        processingStatus: 'ignored_stale',
        nextPayment: payment,
      };
    }

    return {
      processingStatus: 'pending_out_of_order',
      nextPayment: {
        ...payment,
        reconciliationState: 'pending',
        status:
          payment.status === 'reconciliation_failed'
            ? 'reconciliation_pending'
            : payment.status,
      },
    };
  }

  if (payment.status === 'succeeded' || payment.status === 'failed') {
    const sameTerminal =
      (payment.status === 'succeeded' && event.providerStatus === 'succeeded') ||
      (payment.status === 'failed' && event.providerStatus === 'failed');

    if (sameTerminal) {
      return {
        processingStatus: 'ignored_stale',
        nextPayment: payment,
      };
    }

    return {
      processingStatus: 'pending_out_of_order',
      nextPayment: {
        ...payment,
        reconciliationState: 'pending',
      },
    };
  }

  if (event.providerStatus === 'failed') {
    return {
      processingStatus: 'applied',
      nextPayment: buildVersionedPayment(
        payment,
        {
          status: 'failed',
          providerStatus: 'failed',
          reconciliationState: 'idle',
          lastProviderEventId: event.eventId,
        },
        1,
        event,
      ),
    };
  }

  const providerConfirmed = buildVersionedPayment(
    payment,
    {
      status: 'provider_confirmed',
      providerStatus: 'succeeded',
      reconciliationState: 'idle',
      lastProviderEventId: event.eventId,
    },
    1,
    event,
  );

  return {
    processingStatus: 'applied',
    nextPayment: {
      ...providerConfirmed,
      status: 'succeeded',
      version: providerConfirmed.version + 1,
    },
  };
}

function applyProviderSnapshotConvergence(
  payment: PaymentRecord,
  snapshot: ProviderSnapshot,
): PaymentRecord | null {
  if (snapshot.providerStatus === 'requires_action') {
    return null;
  }

  if (
    payment.status === 'succeeded' &&
    snapshot.providerStatus === 'succeeded' &&
    deriveOrderProjectionStatus(payment) === 'paid'
  ) {
    return null;
  }

  if (
    payment.status === 'failed' &&
    snapshot.providerStatus === 'failed' &&
    deriveOrderProjectionStatus(payment) === 'failed'
  ) {
    return null;
  }

  const finalStatus =
    snapshot.providerStatus === 'succeeded' ? 'succeeded' : 'failed';

  return buildVersionedPayment(
    payment,
    {
      status: finalStatus,
      providerStatus: snapshot.providerStatus,
      reconciliationState: 'idle',
      lastProviderEventId: snapshot.providerEventId,
    },
    1,
    snapshot,
  );
}

export function createConfirmPaymentCommand(deps: ConfirmPaymentDeps) {
  return async function confirmPaymentCommand(
    input: ConfirmPaymentInput,
  ): Promise<ConfirmPaymentResult> {
    ensureIdempotencyKeyFormat(input.idempotencyKey);
    ensurePaymentIntentIdFormat(input.paymentIntentId);

    const provider = input.provider ?? PAYMENT_PROVIDER;
    const requestHash = hashRequest({
      buyerId: input.buyerId,
      orderId: input.orderId,
      paymentIntentId: input.paymentIntentId,
      provider,
    });

    const idempotency = await deps.claimIdempotency(input, requestHash);
    if (idempotency.kind === 'replay') {
      return idempotency.response;
    }
    if (idempotency.kind === 'in_progress') {
      throw new CheckoutPaymentConfirmDomainError(
        'IDEMPOTENCY_IN_PROGRESS',
        'Payment confirmation is already in progress for this idempotency key.',
        409,
      );
    }

    const payment = await deps.loadPaymentForConfirmation(
      input.orderId,
      input.buyerId,
      input.paymentIntentId,
    );
    if (!payment) {
      throw new CheckoutPaymentConfirmDomainError(
        'PAYMENT_NOT_FOUND',
        'Payment record not found.',
        404,
      );
    }

    ensurePaymentCanRequestConfirmation(payment, provider);

    await deps.appendPaymentEvent({
      paymentId: payment.id,
      type: 'confirmation_requested',
      payload: {
        orderId: payment.orderId,
        paymentIntentId: payment.intentId,
        providerPaymentId: payment.providerPaymentId,
      },
      processingStatus: 'applied',
      eventId: null,
      providerSequence: null,
    });

    const result: ConfirmPaymentResult = {
      success: true,
      order_id: payment.orderId,
      buyer_id: payment.buyerId,
      event_id: payment.eventId,
      total_minor: payment.amount,
      status: 'pending_payment',
      payment_confirmation: {
        provider,
        intent_id: payment.intentId,
        provider_payment_id: payment.providerPaymentId,
        status: 'pending_provider_confirmation',
        requested_at: deps.now().toISOString(),
        next_step: 'await_provider_confirmation',
      },
    };

    await deps.storeIdempotentResponse(input, requestHash, result);

    return result;
  };
}

export function createHandleProviderEventCommand(deps: HandleProviderEventDeps) {
  return async function handleProviderEvent(
    event: ProviderEvent,
  ): Promise<ProviderEventResult> {
    const payment = await deps.loadPaymentByProviderReference(
      event.providerPaymentId,
      event.paymentIntentId,
    );

    if (!payment) {
      throw new CheckoutPaymentConfirmDomainError(
        'PAYMENT_NOT_FOUND',
        'Payment record not found for provider event.',
        404,
      );
    }

    const transition = applyProviderEventTransition(payment, event);

    if (transition.processingStatus === 'ignored_duplicate') {
      await deps.appendPaymentEvent({
        paymentId: payment.id,
        type: 'provider_event_duplicate',
        payload: {
          providerStatus: event.providerStatus,
          providerPaymentId: event.providerPaymentId,
        },
        processingStatus: 'ignored_duplicate',
        eventId: event.eventId,
        providerSequence: event.providerSequence,
      });

      return {
        success: true,
        paymentId: payment.id,
        orderId: payment.orderId,
        processingStatus: 'ignored_duplicate',
        paymentStatus: payment.status,
        orderStatus: deriveOrderProjectionStatus(payment),
      };
    }

    if (transition.processingStatus === 'ignored_stale') {
      await deps.appendPaymentEvent({
        paymentId: payment.id,
        type: 'provider_event_stale',
        payload: {
          providerStatus: event.providerStatus,
          providerPaymentId: event.providerPaymentId,
        },
        processingStatus: 'ignored_stale',
        eventId: event.eventId,
        providerSequence: event.providerSequence,
      });

      return {
        success: true,
        paymentId: payment.id,
        orderId: payment.orderId,
        processingStatus: 'ignored_stale',
        paymentStatus: payment.status,
        orderStatus: deriveOrderProjectionStatus(payment),
      };
    }

    if (transition.processingStatus === 'pending_out_of_order') {
      const pendingPayment = await deps.persistPayment(transition.nextPayment);
      await deps.appendPaymentEvent({
        paymentId: payment.id,
        type: 'provider_event_pending',
        payload: {
          providerStatus: event.providerStatus,
          providerPaymentId: event.providerPaymentId,
        },
        processingStatus: 'pending_out_of_order',
        eventId: event.eventId,
        providerSequence: event.providerSequence,
      });

      return {
        success: true,
        paymentId: pendingPayment.id,
        orderId: pendingPayment.orderId,
        processingStatus: 'pending_out_of_order',
        paymentStatus: pendingPayment.status,
        orderStatus: await deps.loadOrderProjection(pendingPayment.orderId),
      };
    }

    const persistedPayment = await deps.persistPayment(transition.nextPayment);

    try {
      const orderStatus = await deps.projectOrder(persistedPayment);
      await deps.appendPaymentEvent({
        paymentId: persistedPayment.id,
        type:
          event.providerStatus === 'succeeded'
            ? 'provider_confirmed'
            : 'provider_failed',
        payload: {
          providerStatus: event.providerStatus,
          providerPaymentId: event.providerPaymentId,
        },
        processingStatus: 'applied',
        eventId: event.eventId,
        providerSequence: event.providerSequence,
      });

      return {
        success: true,
        paymentId: persistedPayment.id,
        orderId: persistedPayment.orderId,
        processingStatus: 'applied',
        paymentStatus: persistedPayment.status,
        orderStatus,
      };
    } catch (error) {
      const failedProjectionPayment = await deps.persistPayment({
        ...persistedPayment,
        reconciliationState: 'failed',
        status:
          persistedPayment.status === 'reconciliation_pending'
            ? 'reconciliation_failed'
            : persistedPayment.status,
      });

      await deps.appendPaymentEvent({
        paymentId: failedProjectionPayment.id,
        type: 'provider_projection_failed',
        payload: {
          providerStatus: event.providerStatus,
          providerPaymentId: event.providerPaymentId,
          message: error instanceof Error ? error.message : 'unknown projection failure',
        },
        processingStatus: 'failed_processing',
        eventId: event.eventId,
        providerSequence: event.providerSequence,
      });

      return {
        success: true,
        paymentId: failedProjectionPayment.id,
        orderId: failedProjectionPayment.orderId,
        processingStatus: 'failed_processing',
        paymentStatus: failedProjectionPayment.status,
        orderStatus: await deps.loadOrderProjection(failedProjectionPayment.orderId),
      };
    }
  };
}

export function createReconcilePaymentsCommand(deps: ReconcilePaymentsDeps) {
  return async function reconcilePayments(): Promise<ReconcilePaymentResult[]> {
    const candidates = await deps.loadCandidates();
    const results: ReconcilePaymentResult[] = [];

    for (const candidate of candidates) {
      const snapshot = await deps.fetchProviderSnapshot(candidate.payment);
      const reconciledPayment = applyProviderSnapshotConvergence(
        candidate.payment,
        snapshot,
      );

      if (!reconciledPayment) {
        const derivedOrderStatus = deriveOrderProjectionStatus(candidate.payment);

        if (candidate.orderProjectionStatus !== derivedOrderStatus) {
          await deps.projectOrder(candidate.payment);
          await deps.appendPaymentEvent({
            paymentId: candidate.payment.id,
            type: 'projection_repaired',
            payload: {
              expectedOrderStatus: derivedOrderStatus,
            },
            processingStatus: 'applied',
            eventId: null,
            providerSequence: snapshot.providerSequence,
          });

          results.push({
            paymentId: candidate.payment.id,
            action: 'updated',
            processingStatus: 'applied',
            paymentStatus: candidate.payment.status,
            orderStatus: derivedOrderStatus,
          });
          continue;
        }

        results.push({
          paymentId: candidate.payment.id,
          action: 'noop',
          processingStatus: 'noop',
          paymentStatus: candidate.payment.status,
          orderStatus: candidate.orderProjectionStatus,
        });
        continue;
      }

      const persistedPayment = await deps.persistPayment(reconciledPayment);
      const orderStatus = await deps.projectOrder(persistedPayment);
      await deps.appendPaymentEvent({
        paymentId: persistedPayment.id,
        type: 'reconciled',
        payload: {
          providerStatus: snapshot.providerStatus,
          unresolvedEvents: candidate.unresolvedEvents.map((event) => event.eventId),
        },
        processingStatus: 'applied',
        eventId: snapshot.providerEventId,
        providerSequence: snapshot.providerSequence,
      });

      results.push({
        paymentId: persistedPayment.id,
        action: 'updated',
        processingStatus: 'applied',
        paymentStatus: persistedPayment.status,
        orderStatus,
      });
    }

    return results;
  };
}

export async function confirmPayment(
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  return db.transaction(async (tx) => {
    const command = createConfirmPaymentCommand({
      claimIdempotency: async (currentInput, requestHash) => {
        const storageKey = getPaymentConfirmIdempotencyStorageKey(
          currentInput.idempotencyKey,
        );

        const inserted = await tx
          .insert(idempotencyKeys)
          .values({
            key: storageKey,
            scope: IDEMPOTENCY_SCOPE,
            requestHash,
            responseCode: null,
            responseBody: null,
          })
          .onConflictDoNothing()
          .returning({ key: idempotencyKeys.key });

        if (inserted.length > 0) {
          return { kind: 'claimed' };
        }

        const rows = await tx
          .select()
          .from(idempotencyKeys)
          .where(
            and(
              eq(idempotencyKeys.scope, IDEMPOTENCY_SCOPE),
              eq(idempotencyKeys.key, storageKey),
            ),
          )
          .limit(1);

        const row = rows[0];
        if (!row) {
          return { kind: 'claimed' };
        }

        if (row.requestHash !== requestHash) {
          throw new CheckoutPaymentConfirmDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was reused with different payload.',
            409,
          );
        }

        if (row.responseBody) {
          return {
            kind: 'replay',
            response: row.responseBody as ConfirmPaymentResult,
          };
        }

        return { kind: 'in_progress' };
      },
      loadPaymentForConfirmation: async (orderId, buyerId, paymentIntentId) => {
        const rows = await tx
          .select({
            id: payments.id,
            orderId: payments.orderId,
            buyerId: payments.buyerId,
            eventId: payments.eventId,
            amount: payments.amount,
            currency: payments.currency,
            paymentMethod: payments.paymentMethod,
            provider: payments.provider,
            status: payments.status,
            intentId: payments.intentId,
            providerPaymentId: payments.providerPaymentId,
            providerStatus: payments.providerStatus,
            lastProviderEventId: payments.lastProviderEventId,
            version: payments.version,
            lastAppliedEventId: payments.lastAppliedEventId,
            lastAppliedEventSequence: payments.lastAppliedEventSequence,
            reconciliationState: payments.reconciliationState,
          })
          .from(payments)
          .where(
            and(
              eq(payments.orderId, orderId),
              eq(payments.buyerId, buyerId),
              eq(payments.intentId, paymentIntentId),
            ),
          )
          .limit(1);

        return (rows[0] as PaymentRecord | undefined) ?? null;
      },
      appendPaymentEvent: async ({
        paymentId,
        type,
        payload,
        processingStatus,
        eventId,
        providerSequence,
      }) => {
        await tx.insert(paymentEvents).values({
          id: `evt_${hashRequest({
            paymentId,
            type,
            eventId,
            providerSequence,
          }).slice(0, 24)}`,
          paymentId,
          type,
          payloadSnapshot: payload,
          providerEventId: eventId,
          providerSequence,
          processingStatus,
          createdAt: new Date().toISOString(),
        });
      },
      storeIdempotentResponse: async (currentInput, requestHash, result) => {
        const storageKey = getPaymentConfirmIdempotencyStorageKey(
          currentInput.idempotencyKey,
        );

        await tx
          .update(idempotencyKeys)
          .set({
            responseCode: 202,
            responseBody: result as unknown as Record<string, unknown>,
          })
          .where(
            and(
              eq(idempotencyKeys.scope, IDEMPOTENCY_SCOPE),
              eq(idempotencyKeys.key, storageKey),
              eq(idempotencyKeys.requestHash, requestHash),
            ),
          );
      },
      now: () => new Date(),
    });

    return command(input);
  });
}

export async function handleProviderEvent(
  event: ProviderEvent,
): Promise<ProviderEventResult> {
  return db.transaction(async (tx) => {
    const command = createHandleProviderEventCommand({
      loadPaymentByProviderReference: async (providerPaymentId, paymentIntentId) => {
        const rows = await tx
          .select({
            id: payments.id,
            orderId: payments.orderId,
            buyerId: payments.buyerId,
            eventId: payments.eventId,
            amount: payments.amount,
            currency: payments.currency,
            paymentMethod: payments.paymentMethod,
            provider: payments.provider,
            status: payments.status,
            intentId: payments.intentId,
            providerPaymentId: payments.providerPaymentId,
            providerStatus: payments.providerStatus,
            lastProviderEventId: payments.lastProviderEventId,
            version: payments.version,
            lastAppliedEventId: payments.lastAppliedEventId,
            lastAppliedEventSequence: payments.lastAppliedEventSequence,
            reconciliationState: payments.reconciliationState,
          })
          .from(payments)
          .where(
            and(
              eq(payments.providerPaymentId, providerPaymentId),
              eq(payments.intentId, paymentIntentId),
            ),
          )
          .limit(1);

        return (rows[0] as PaymentRecord | undefined) ?? null;
      },
      persistPayment: async (payment) => {
        const rows = await tx
          .update(payments)
          .set({
            status: payment.status,
            providerStatus: payment.providerStatus,
            lastProviderEventId: payment.lastProviderEventId,
            version: payment.version,
            lastAppliedEventId: payment.lastAppliedEventId,
            lastAppliedEventSequence: payment.lastAppliedEventSequence,
            reconciliationState: payment.reconciliationState,
          })
          .where(eq(payments.id, payment.id))
          .returning({
            id: payments.id,
            orderId: payments.orderId,
            buyerId: payments.buyerId,
            eventId: payments.eventId,
            amount: payments.amount,
            currency: payments.currency,
            paymentMethod: payments.paymentMethod,
            provider: payments.provider,
            status: payments.status,
            intentId: payments.intentId,
            providerPaymentId: payments.providerPaymentId,
            providerStatus: payments.providerStatus,
            lastProviderEventId: payments.lastProviderEventId,
            version: payments.version,
            lastAppliedEventId: payments.lastAppliedEventId,
            lastAppliedEventSequence: payments.lastAppliedEventSequence,
            reconciliationState: payments.reconciliationState,
          });

        return rows[0] as PaymentRecord;
      },
      loadOrderProjection: async (orderId) => {
        const rows = await tx
          .select({
            status: orders.status,
          })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);

        return (rows[0]?.status as OrderProjectionStatus | undefined) ?? 'pending_payment';
      },
      projectOrder: async (payment) => {
        const derivedStatus = deriveOrderProjectionStatus(payment);

        const rows = await tx
          .update(orders)
          .set({
            status: derivedStatus,
          })
          .where(eq(orders.id, payment.orderId))
          .returning({
            status: orders.status,
          });

        return (rows[0]?.status as OrderProjectionStatus | undefined) ?? derivedStatus;
      },
      appendPaymentEvent: async ({
        paymentId,
        type,
        payload,
        processingStatus,
        eventId,
        providerSequence,
      }) => {
        const inserted = await tx
          .insert(paymentEvents)
          .values({
            id: `evt_${hashRequest({
              paymentId,
              type,
              eventId,
              providerSequence,
            }).slice(0, 24)}`,
            paymentId,
            type,
            payloadSnapshot: payload,
            providerEventId: eventId,
            providerSequence,
            processingStatus,
            createdAt: new Date().toISOString(),
          })
          .onConflictDoNothing()
          .returning({ id: paymentEvents.id });

        return inserted.length > 0 ? 'appended' : 'duplicate';
      },
    });

    return command(event);
  });
}

export async function reconcilePayments(): Promise<ReconcilePaymentResult[]> {
  return db.transaction(async (tx) => {
    const command = createReconcilePaymentsCommand({
      loadCandidates: async () => {
        const paymentRows = await tx
          .select({
            id: payments.id,
            orderId: payments.orderId,
            buyerId: payments.buyerId,
            eventId: payments.eventId,
            amount: payments.amount,
            currency: payments.currency,
            paymentMethod: payments.paymentMethod,
            provider: payments.provider,
            status: payments.status,
            intentId: payments.intentId,
            providerPaymentId: payments.providerPaymentId,
            providerStatus: payments.providerStatus,
            lastProviderEventId: payments.lastProviderEventId,
            version: payments.version,
            lastAppliedEventId: payments.lastAppliedEventId,
            lastAppliedEventSequence: payments.lastAppliedEventSequence,
            reconciliationState: payments.reconciliationState,
          })
          .from(payments);

        const candidates: ReconcilePaymentCandidate[] = [];

        for (const payment of paymentRows as PaymentRecord[]) {
          const orderRows = await tx
            .select({
              status: orders.status,
            })
            .from(orders)
            .where(eq(orders.id, payment.orderId))
            .limit(1);

          const unresolvedRows = await tx
            .select({
              providerEventId: paymentEvents.providerEventId,
              paymentId: paymentEvents.paymentId,
              processingStatus: paymentEvents.processingStatus,
              providerSequence: paymentEvents.providerSequence,
              providerStatus: paymentEvents.providerStatus,
            })
            .from(paymentEvents)
            .where(eq(paymentEvents.paymentId, payment.id));

          candidates.push({
            payment,
            orderProjectionStatus:
              (orderRows[0]?.status as OrderProjectionStatus | undefined) ?? 'pending_payment',
            unresolvedEvents: (unresolvedRows as Array<{
              providerEventId: string | null;
              paymentId: string;
              processingStatus: EventProcessingStatus;
              providerSequence: number | null;
              providerStatus: 'requires_action' | 'succeeded' | 'failed' | null;
            }>).filter(
              (event) =>
                event.processingStatus === 'pending_out_of_order' ||
                event.processingStatus === 'failed_processing',
            ).map((event) => ({
              eventId: event.providerEventId ?? `internal:${payment.id}`,
              paymentId: event.paymentId,
              processingStatus: event.processingStatus,
              providerSequence: event.providerSequence,
              providerStatus: event.providerStatus,
            })),
          });
        }

        return candidates;
      },
      fetchProviderSnapshot: async (payment) => ({
        providerStatus: payment.providerStatus,
        providerSequence: payment.lastAppliedEventSequence,
        providerEventId: payment.lastProviderEventId,
      }),
      persistPayment: async (payment) => {
        const rows = await tx
          .update(payments)
          .set({
            status: payment.status,
            providerStatus: payment.providerStatus,
            lastProviderEventId: payment.lastProviderEventId,
            version: payment.version,
            lastAppliedEventId: payment.lastAppliedEventId,
            lastAppliedEventSequence: payment.lastAppliedEventSequence,
            reconciliationState: payment.reconciliationState,
          })
          .where(eq(payments.id, payment.id))
          .returning({
            id: payments.id,
            orderId: payments.orderId,
            buyerId: payments.buyerId,
            eventId: payments.eventId,
            amount: payments.amount,
            currency: payments.currency,
            paymentMethod: payments.paymentMethod,
            provider: payments.provider,
            status: payments.status,
            intentId: payments.intentId,
            providerPaymentId: payments.providerPaymentId,
            providerStatus: payments.providerStatus,
            lastProviderEventId: payments.lastProviderEventId,
            version: payments.version,
            lastAppliedEventId: payments.lastAppliedEventId,
            lastAppliedEventSequence: payments.lastAppliedEventSequence,
            reconciliationState: payments.reconciliationState,
          });

        return rows[0] as PaymentRecord;
      },
      projectOrder: async (payment) => {
        const derivedStatus = deriveOrderProjectionStatus(payment);

        const rows = await tx
          .update(orders)
          .set({
            status: derivedStatus,
          })
          .where(eq(orders.id, payment.orderId))
          .returning({
            status: orders.status,
          });

        return (rows[0]?.status as OrderProjectionStatus | undefined) ?? derivedStatus;
      },
      appendPaymentEvent: async ({
        paymentId,
        type,
        payload,
        processingStatus,
        eventId,
        providerSequence,
      }) => {
        await tx.insert(paymentEvents).values({
          id: `evt_${hashRequest({
            paymentId,
            type,
            eventId,
            providerSequence,
          }).slice(0, 24)}`,
          paymentId,
          type,
          payloadSnapshot: payload,
          providerEventId: eventId,
          providerSequence,
          processingStatus,
          createdAt: new Date().toISOString(),
        });
      },
    });

    return command();
  });
}
