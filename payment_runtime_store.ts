import { hashRequest } from './test_stubs/idempotency';
import { eventAdminStore } from './event_admin_store';
import { issuePaidTicketForSuccessfulOrder } from './event_registration_ticket_store';
import {
  paymentCoreStore,
  resetPaymentCoreStoreForTests,
  type RuntimeOrderRecord,
  type RuntimePaymentCoreRecord,
  normalizeRuntimeOrderInput,
} from './payment_core_store';
import {
  CheckoutPaymentConfirmDomainError,
  createConfirmPaymentCommand,
  type ConfirmPaymentInput,
  type ConfirmPaymentResult,
  type PaymentRecord as ConfirmPaymentRecord,
} from './payment_confirm';
import {
  CheckoutPaymentIntentDomainError,
  createInitiatePaymentIntentCommand,
  type InitiatePaymentIntentInput,
  type InitiatePaymentIntentResult,
  type PaymentRecord as IntentPaymentRecord,
} from './payment_intent';
import { createYookassaPayment } from './yookassa_provider';
import { resolveCheckoutProvider } from './yookassa_config';

export type CreateRuntimeOrderInput = {
  id: string;
  actorId?: string;
  registrationId?: string;
  buyerId: string;
  eventId: string;
  totalMinor: number;
  currency?: string;
};

export class CheckoutOrderSourceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'CheckoutOrderSourceError';
    this.code = code;
    this.status = status;
  }
}

type RuntimeIdempotencyEntry<T> = {
  requestHash: string;
  response: T | null;
};

const idempotency = new Map<string, RuntimeIdempotencyEntry<unknown>>();
const paymentTransient = new Map<
  string,
  Pick<
    ConfirmPaymentRecord,
    | 'paymentMethod'
    | 'providerStatus'
    | 'lastProviderEventId'
    | 'version'
    | 'lastAppliedEventId'
    | 'lastAppliedEventSequence'
    | 'reconciliationState'
  >
>();

function now() {
  return new Date();
}

async function ensureEventAllowsNewOrder(eventId: string) {
  const event = await eventAdminStore.getEventById(eventId);
  if (!event) {
    return;
  }

  if (event.archivedAt) {
    throw new CheckoutOrderSourceError(
      'EVENT_NOT_AVAILABLE',
      'Event is not available.',
      409,
    );
  }

  if (!event.salesOpen) {
    throw new CheckoutOrderSourceError(
      'EVENT_SALES_CLOSED',
      'Event sales are closed.',
      409,
    );
  }
}

async function ensureEventAllowsPaymentStart(eventId: string) {
  const event = await eventAdminStore.getEventById(eventId);
  if (!event) {
    return;
  }

  if (event.archivedAt) {
    throw new CheckoutPaymentIntentDomainError(
      'EVENT_NOT_AVAILABLE',
      'Event is not available.',
      409,
    );
  }

  if (!event.salesOpen) {
    throw new CheckoutPaymentIntentDomainError(
      'EVENT_SALES_CLOSED',
      'Event sales are closed.',
      409,
    );
  }
}

export function resetPaymentRuntimeStore() {
  resetPaymentCoreStoreForTests();
  idempotency.clear();
  paymentTransient.clear();
}

export async function seedRuntimeOrder(order: {
  id: string;
  buyerId: string;
  eventId: string;
  totalMinor: number;
  status: 'pending_payment' | 'paid' | 'failed';
  paymentProvider?: string | null;
  actorId?: string;
  registrationId?: string;
  currency?: string;
}) {
  const nowIso = new Date().toISOString();
  const normalized = normalizeRuntimeOrderInput(order);
  const persisted = await paymentCoreStore.persistOrder({
    ...normalized,
    status: order.status,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return {
    ...persisted,
    paymentProvider: order.paymentProvider ?? persisted.paymentProvider,
  };
}

export async function createRuntimeOrder(
  input: CreateRuntimeOrderInput,
): Promise<RuntimeOrderRecord> {
  await ensureEventAllowsNewOrder(input.eventId);

  const existing = await paymentCoreStore.loadOrder(input.id, input.buyerId);
  if (existing) {
    throw new CheckoutOrderSourceError(
      'ORDER_ALREADY_EXISTS',
      'Order already exists.',
      409,
    );
  }

  const normalized = normalizeRuntimeOrderInput(input);
  const nowIso = now().toISOString();

  return paymentCoreStore.persistOrder({
    ...normalized,
    status: 'pending_payment',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

function getIdempotencyEntry<T>(
  scope: string,
  key: string,
): RuntimeIdempotencyEntry<T> | null {
  return (idempotency.get(`${scope}:${key}`) as RuntimeIdempotencyEntry<T> | undefined) ?? null;
}

function setIdempotencyEntry<T>(
  scope: string,
  key: string,
  entry: RuntimeIdempotencyEntry<T>,
) {
  idempotency.set(`${scope}:${key}`, entry as RuntimeIdempotencyEntry<unknown>);
}

function deriveProviderStatus(
  status: ConfirmPaymentRecord['status'],
): ConfirmPaymentRecord['providerStatus'] {
  if (status === 'succeeded') {
    return 'succeeded';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'requires_action';
}

function mapCorePaymentToConfirmPayment(
  payment: RuntimePaymentCoreRecord,
): ConfirmPaymentRecord {
  const transient = paymentTransient.get(payment.id);

  return {
    id: payment.id,
    orderId: payment.orderId,
    buyerId: payment.buyerId,
    eventId: payment.eventId,
    amount: payment.amount,
    currency: payment.currency,
    paymentMethod: transient?.paymentMethod ?? 'card',
    provider: payment.provider,
    status: payment.status,
    intentId: payment.intentId ?? '',
    providerPaymentId: payment.providerPaymentId ?? '',
    providerStatus: transient?.providerStatus ?? deriveProviderStatus(payment.status),
    lastProviderEventId: transient?.lastProviderEventId ?? null,
    version: transient?.version ?? 0,
    lastAppliedEventId: transient?.lastAppliedEventId ?? null,
    lastAppliedEventSequence: transient?.lastAppliedEventSequence ?? null,
    reconciliationState: transient?.reconciliationState ?? 'idle',
  };
}

function mapCorePaymentToIntentPayment(
  payment: RuntimePaymentCoreRecord,
): IntentPaymentRecord {
  const mapped = mapCorePaymentToConfirmPayment(payment);
  return {
    ...mapped,
    confirmationUrl: payment.confirmationUrl,
  } as IntentPaymentRecord;
}

export async function runtimeInitiatePaymentIntent(
  input: InitiatePaymentIntentInput,
): Promise<InitiatePaymentIntentResult> {
  const command = createInitiatePaymentIntentCommand({
    claimIdempotency: async (currentInput, requestHash) => {
      const existing = getIdempotencyEntry<InitiatePaymentIntentResult>(
        'checkout_payment_intent',
        currentInput.idempotencyKey,
      );

      if (!existing) {
        setIdempotencyEntry('checkout_payment_intent', currentInput.idempotencyKey, {
          requestHash,
          response: null,
        });
        return { kind: 'claimed' };
      }

      if (existing.requestHash !== requestHash) {
        throw new CheckoutPaymentIntentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key was reused with different payload.',
          409,
        );
      }

      if (existing.response) {
        return { kind: 'replay', response: existing.response };
      }

      return { kind: 'in_progress' };
    },
    loadOrderForPayment: async (orderId, buyerId) =>
      paymentCoreStore.loadOrder(orderId, buyerId),
    bindPaymentProvider: async (order, provider) => {
      await ensureEventAllowsPaymentStart(order.eventId);

      if (order.paymentProvider && order.paymentProvider !== provider) {
        throw new CheckoutPaymentIntentDomainError(
          'PAYMENT_PROVIDER_MISMATCH',
          'Order is already bound to a different payment provider.',
          409,
        );
      }

      await paymentCoreStore.updateOrderCurrency(order.id, input.currency);

      return provider;
    },
    loadCanonicalPayment: async (orderId) => {
      const payment = await paymentCoreStore.loadPaymentByOrderAny(orderId);
      return payment ? mapCorePaymentToIntentPayment(payment) : null;
    },
    createCanonicalPayment: async ({
      order,
      provider,
      intentId,
      providerPaymentId: initialProviderPaymentId,
      input: currentInput,
    }) => {
      const payment: ConfirmPaymentRecord = {
        id: `pay_${hashRequest({ orderId: order.id, intentId }).slice(0, 24)}`,
        orderId: order.id,
        buyerId: order.buyerId,
        eventId: order.eventId,
        amount: currentInput.amount,
        currency: currentInput.currency,
        paymentMethod: currentInput.paymentMethod,
        provider,
        status: 'pending',
        intentId,
        providerPaymentId: initialProviderPaymentId,
        providerStatus: 'requires_action',
        lastProviderEventId: null,
        version: 0,
        lastAppliedEventId: null,
        lastAppliedEventSequence: null,
        reconciliationState: 'idle',
      };

      let providerPaymentId = payment.providerPaymentId;
      let confirmationUrl: string | null = null;

      if (provider === 'yookassa') {
        const providerPayment = await createYookassaPayment({
          idempotencyKey: currentInput.idempotencyKey,
          orderId: order.id,
          paymentId: payment.id,
          actorId: order.actorId,
          registrationId: order.registrationId,
          eventId: order.eventId,
          amountMinor: currentInput.amount,
          currency: 'RUB',
        });
        providerPaymentId = providerPayment.providerPaymentId;
        confirmationUrl = providerPayment.confirmationUrl;
      }

      await paymentCoreStore.persistPayment({
        id: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        providerPaymentId,
        intentId: payment.intentId,
        confirmationUrl,
        status: payment.status as 'pending',
        createdAt: now().toISOString(),
        updatedAt: now().toISOString(),
      });

      paymentTransient.set(payment.id, {
        paymentMethod: payment.paymentMethod,
        providerStatus: payment.providerStatus,
        lastProviderEventId: payment.lastProviderEventId,
        version: payment.version,
        lastAppliedEventId: payment.lastAppliedEventId,
        lastAppliedEventSequence: payment.lastAppliedEventSequence,
        reconciliationState: payment.reconciliationState,
      });

      return {
        ...payment,
        providerPaymentId,
        confirmationUrl,
      } as IntentPaymentRecord;
    },
    buildProviderPresentation: ({ payment }) =>
      payment.provider === 'yookassa'
        ? {
            status: 'requires_action',
            next_step: 'redirect_confirmation',
            confirmation_url: payment.confirmationUrl ?? undefined,
            handoff: undefined,
          }
        : {
            status: 'requires_action',
            next_step: 'payment_confirm',
            handoff: {
              kind: 'redirect_token',
              token: `ptok_${hashRequest({
                paymentId: payment.id,
                intentId: payment.intentId,
              }).slice(0, 24)}`,
              redirect_path: `/checkout/pay/${payment.intentId}`,
            },
          },
    storeIdempotentResponse: async (currentInput, requestHash, result) => {
      setIdempotencyEntry('checkout_payment_intent', currentInput.idempotencyKey, {
        requestHash,
        response: result,
      });
    },
    now,
  });

  return command({
    ...input,
    provider: input.provider ?? resolveCheckoutProvider(),
  });
}

export async function runtimeHandleProviderPaymentSucceeded(args: {
  provider: 'yookassa';
  providerPaymentId: string;
}) {
  const payment = await paymentCoreStore.loadPaymentByProviderPaymentId(
    args.provider,
    args.providerPaymentId,
  );
  if (!payment) {
    throw new CheckoutPaymentConfirmDomainError(
      'WEBHOOK_MAPPING_FAILED',
      'Provider payment could not be mapped to a canonical payment.',
      404,
    );
  }

  return projectRuntimePaymentSuccess({
    paymentId: payment.id,
  });
}

export async function runtimeConfirmPayment(
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  const command = createConfirmPaymentCommand({
    claimIdempotency: async (currentInput, requestHash) => {
      const existing = getIdempotencyEntry<ConfirmPaymentResult>(
        'checkout_payment_confirm',
        currentInput.idempotencyKey,
      );

      if (!existing) {
        setIdempotencyEntry('checkout_payment_confirm', currentInput.idempotencyKey, {
          requestHash,
          response: null,
        });
        return { kind: 'claimed' };
      }

      if (existing.requestHash !== requestHash) {
        throw new CheckoutPaymentConfirmDomainError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key was reused with different payload.',
          409,
        );
      }

      if (existing.response) {
        return { kind: 'replay', response: existing.response };
      }

      return { kind: 'in_progress' };
    },
    loadPaymentForConfirmation: async (orderId, buyerId, paymentIntentId) => {
      const payment = await paymentCoreStore.loadPaymentByOrder(orderId, buyerId);
      if (!payment) {
        return null;
      }
      const mapped = mapCorePaymentToConfirmPayment(payment);
      if (mapped.intentId !== paymentIntentId) {
        return null;
      }
      return mapped;
    },
    appendPaymentEvent: async () => undefined,
    storeIdempotentResponse: async (currentInput, requestHash, result) => {
      setIdempotencyEntry('checkout_payment_confirm', currentInput.idempotencyKey, {
        requestHash,
        response: result,
      });
    },
    now,
  });

  return command(input);
}

export async function projectRuntimePaymentSuccess(args: { paymentId: string }) {
  const payment = await paymentCoreStore.updatePaymentStatus(args.paymentId, 'succeeded');
  if (!payment) {
    return null;
  }

  const order = await paymentCoreStore.updateOrderStatus(payment.orderId, 'paid');
  if (!order) {
    throw new CheckoutPaymentConfirmDomainError(
      'ORDER_NOT_FOUND',
      'Order projection not found for successful payment.',
      404,
    );
  }

  const issuance = await issuePaidTicketForSuccessfulOrder({
    orderId: order.id,
    actorId: order.actorId,
    registrationId: order.registrationId,
    eventId: order.eventId,
    paidAt: payment.updatedAt,
  });

  return {
    payment,
    order,
    registration: issuance.registration,
    ticket: issuance.ticket,
    replayed: issuance.replayed,
  };
}
