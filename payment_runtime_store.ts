import { hashRequest } from './test_stubs/idempotency';
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

type RuntimeOrder = {
  id: string;
  buyerId: string;
  eventId: string;
  totalMinor: number;
  status: 'created' | 'pending_payment' | 'paid' | 'cancelled' | 'refunded' | 'failed';
  paymentProvider: string | null;
};

type RuntimeIdempotencyEntry<T> = {
  requestHash: string;
  response: T | null;
};

const orders = new Map<string, RuntimeOrder>();
const payments = new Map<string, ConfirmPaymentRecord>();
const idempotency = new Map<string, RuntimeIdempotencyEntry<unknown>>();

function now() {
  return new Date();
}

export function resetPaymentRuntimeStore() {
  orders.clear();
  payments.clear();
  idempotency.clear();
}

export function seedRuntimeOrder(order: RuntimeOrder) {
  orders.set(order.id, order);
  return order;
}

function getIdempotencyEntry<T>(
  scope: string,
  key: string,
): RuntimeIdempotencyEntry<T> | null {
  return (idempotency.get(`${scope}:${key}`) as RuntimeIdempotencyEntry<T> | undefined) ?? null;
}

function setIdempotencyEntry<T>(scope: string, key: string, entry: RuntimeIdempotencyEntry<T>) {
  idempotency.set(`${scope}:${key}`, entry as RuntimeIdempotencyEntry<unknown>);
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
    loadOrderForPayment: async (orderId, buyerId) => {
      const order = orders.get(orderId);
      if (!order || order.buyerId !== buyerId) {
        return null;
      }
      return order;
    },
    bindPaymentProvider: async (order, provider) => {
      if (order.paymentProvider && order.paymentProvider !== provider) {
        throw new CheckoutPaymentIntentDomainError(
          'PAYMENT_PROVIDER_MISMATCH',
          'Order is already bound to a different payment provider.',
          409,
        );
      }

      const next = {
        ...order,
        paymentProvider: provider,
      };
      orders.set(order.id, next);
      return provider;
    },
    loadCanonicalPayment: async (orderId) => {
      for (const payment of payments.values()) {
        if (payment.orderId === orderId) {
          return payment as IntentPaymentRecord;
        }
      }
      return null;
    },
    createCanonicalPayment: async ({ order, provider, intentId, providerPaymentId, input: currentInput }) => {
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
        providerPaymentId,
        providerStatus: 'requires_action',
        lastProviderEventId: null,
        version: 0,
        lastAppliedEventId: null,
        lastAppliedEventSequence: null,
        reconciliationState: 'idle',
      };
      payments.set(payment.id, payment);
      return payment as IntentPaymentRecord;
    },
    storeIdempotentResponse: async (currentInput, requestHash, result) => {
      setIdempotencyEntry('checkout_payment_intent', currentInput.idempotencyKey, {
        requestHash,
        response: result,
      });
    },
    now,
  });

  return command(input);
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
      for (const payment of payments.values()) {
        if (
          payment.orderId === orderId &&
          payment.buyerId === buyerId &&
          payment.intentId === paymentIntentId
        ) {
          return payment;
        }
      }
      return null;
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
