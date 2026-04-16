import { and, eq } from './test_stubs/drizzle-orm';
import { db } from './test_stubs/db-client';
import { idempotencyKeys, orders, payments } from './test_stubs/db-schema';
import { hashRequest } from './test_stubs/idempotency';

export class CheckoutPaymentIntentDomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'CheckoutPaymentIntentDomainError';
    this.code = code;
    this.status = status;
  }
}

export type InitiatePaymentIntentInput = {
  buyerId: string;
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: 'card' | 'bank_transfer' | 'wallet';
  idempotencyKey: string;
  provider?: 'stub' | 'yookassa';
};

export type PaymentRecord = {
  id: string;
  orderId: string;
  buyerId: string;
  eventId: string;
  amount: number;
  currency: string;
  paymentMethod: 'card' | 'bank_transfer' | 'wallet';
  provider: 'stub' | 'yookassa';
  status: 'pending' | 'provider_confirmed' | 'succeeded' | 'failed';
  intentId: string;
  providerPaymentId: string;
  confirmationUrl?: string | null;
  providerStatus: 'requires_action' | 'succeeded' | 'failed';
  lastProviderEventId: string | null;
};

export type InitiatePaymentIntentResult = {
  success: true;
  order_id: string;
  buyer_id: string;
  event_id: string;
  total_minor: number;
  status: 'pending_payment';
  payment_intent: {
    provider: 'stub' | 'yookassa';
    status: 'requires_action';
    intent_id: string;
    provider_payment_id: string;
    next_step: 'payment_confirm' | 'redirect_confirmation';
    expires_at: string;
    confirmation_url?: string;
    handoff?: {
      kind: 'redirect_token';
      token: string;
      redirect_path: string;
    };
  };
};

type OrderPaymentRecord = {
  id: string;
  actorId: string;
  registrationId: string;
  buyerId: string;
  eventId: string;
  totalMinor: number;
  status: 'created' | 'pending_payment' | 'paid' | 'cancelled' | 'refunded' | 'failed';
  paymentProvider: string | null;
};

type IdempotencyClaim =
  | { kind: 'claimed' }
  | { kind: 'replay'; response: InitiatePaymentIntentResult }
  | { kind: 'in_progress' };

type InitiatePaymentIntentDeps = {
  claimIdempotency: (
    input: InitiatePaymentIntentInput,
    requestHash: string,
  ) => Promise<IdempotencyClaim>;
  loadOrderForPayment: (
    orderId: string,
    buyerId: string,
  ) => Promise<OrderPaymentRecord | null>;
  bindPaymentProvider: (
    order: OrderPaymentRecord,
    provider: 'stub' | 'yookassa',
  ) => Promise<'stub' | 'yookassa'>;
  loadCanonicalPayment: (orderId: string) => Promise<PaymentRecord | null>;
  createCanonicalPayment: (args: {
      order: OrderPaymentRecord;
      provider: 'stub' | 'yookassa';
      intentId: string;
      providerPaymentId: string;
      input: InitiatePaymentIntentInput;
    }) => Promise<PaymentRecord>;
  buildProviderPresentation?: (args: {
    payment: PaymentRecord;
    now: Date;
  }) => Pick<
    InitiatePaymentIntentResult['payment_intent'],
    'status' | 'next_step' | 'confirmation_url' | 'handoff'
  >;
  storeIdempotentResponse: (
    input: InitiatePaymentIntentInput,
    requestHash: string,
    result: InitiatePaymentIntentResult,
  ) => Promise<void>;
  now: () => Date;
};

const IDEMPOTENCY_SCOPE = 'checkout_payment_intent';
const PAYMENT_PROVIDER = 'stub' as const;
const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9:_-]{8,128}$/;
const PAYMENT_INTENT_TTL_MS = 15 * 60 * 1000;

export function getPaymentIntentIdempotencyStorageKey(idempotencyKey: string) {
  return `${IDEMPOTENCY_SCOPE}:${idempotencyKey}`;
}

function ensureIdempotencyKeyFormat(idempotencyKey: string) {
  if (!IDEMPOTENCY_KEY_FORMAT.test(idempotencyKey)) {
    throw new CheckoutPaymentIntentDomainError(
      'INVALID_IDEMPOTENCY_KEY',
      'Invalid idempotency key.',
      400,
    );
  }
}

function ensureOrderIsPayable(order: OrderPaymentRecord) {
  if (order.status !== 'pending_payment') {
    throw new CheckoutPaymentIntentDomainError(
      'ORDER_NOT_PENDING_PAYMENT',
      'Order is not eligible for payment initiation.',
      409,
    );
  }

  if (order.totalMinor <= 0) {
    throw new CheckoutPaymentIntentDomainError(
      'ORDER_TOTAL_INVALID',
      'Order total must be positive for payment initiation.',
      409,
    );
  }
}

function ensureInputMatchesOrder(
  order: OrderPaymentRecord,
  input: InitiatePaymentIntentInput,
) {
  if (input.amount !== order.totalMinor) {
    throw new CheckoutPaymentIntentDomainError(
      'ORDER_AMOUNT_MISMATCH',
      'Requested amount does not match the order total.',
      409,
    );
  }
}

function ensurePaymentMatchesInput(
  payment: PaymentRecord,
  input: InitiatePaymentIntentInput,
  provider: 'stub' | 'yookassa',
) {
  if (payment.orderId !== input.orderId || payment.buyerId !== input.buyerId) {
    throw new CheckoutPaymentIntentDomainError(
      'PAYMENT_ORDER_MISMATCH',
      'Payment record does not belong to this order.',
      409,
    );
  }

  if (
    payment.amount !== input.amount ||
    payment.currency !== input.currency ||
    payment.paymentMethod !== input.paymentMethod ||
    payment.provider !== provider
  ) {
    throw new CheckoutPaymentIntentDomainError(
      'PAYMENT_PAYLOAD_MISMATCH',
      'Payment request does not match the canonical payment record.',
      409,
    );
  }

  if (payment.status !== 'pending') {
    throw new CheckoutPaymentIntentDomainError(
      'PAYMENT_ALREADY_FINALIZED',
      'Payment is already finalized.',
      409,
    );
  }
}

function buildIntentId(
  orderId: string,
  requestHash: string,
  provider: 'stub' | 'yookassa',
) {
  const seed = hashRequest({
    orderId,
    provider,
    requestHash,
  });

  return `pi_${seed.slice(0, 24)}`;
}

function buildProviderPaymentId(intentId: string) {
  return `pp_${intentId.slice(3)}`;
}

function buildPaymentIntentResult(args: {
  payment: PaymentRecord;
  now: Date;
  presentation?: Pick<
    InitiatePaymentIntentResult['payment_intent'],
    'status' | 'next_step' | 'confirmation_url' | 'handoff'
  >;
}): InitiatePaymentIntentResult {
  const tokenSeed = hashRequest({
    paymentId: args.payment.id,
    intentId: args.payment.intentId,
  });

  return {
    success: true,
    order_id: args.payment.orderId,
    buyer_id: args.payment.buyerId,
    event_id: args.payment.eventId,
    total_minor: args.payment.amount,
    status: 'pending_payment',
    payment_intent: {
      provider: args.payment.provider,
      status: args.presentation?.status ?? 'requires_action',
      intent_id: args.payment.intentId,
      provider_payment_id: args.payment.providerPaymentId,
      next_step: args.presentation?.next_step ?? 'payment_confirm',
      expires_at: new Date(args.now.getTime() + PAYMENT_INTENT_TTL_MS).toISOString(),
      ...(args.presentation?.confirmation_url
        ? {
            confirmation_url: args.presentation.confirmation_url,
          }
        : {}),
      ...(args.presentation?.handoff
        ? { handoff: args.presentation.handoff }
        : {
            handoff: {
              kind: 'redirect_token',
              token: `ptok_${tokenSeed.slice(0, 24)}`,
              redirect_path: `/checkout/pay/${args.payment.intentId}`,
            },
          }),
    },
  };
}

export function createInitiatePaymentIntentCommand(deps: InitiatePaymentIntentDeps) {
  return async function initiatePaymentIntentCommand(
    input: InitiatePaymentIntentInput,
  ): Promise<InitiatePaymentIntentResult> {
    ensureIdempotencyKeyFormat(input.idempotencyKey);

    const provider = input.provider ?? PAYMENT_PROVIDER;
    const requestHash = hashRequest({
      buyerId: input.buyerId,
      orderId: input.orderId,
      amount: input.amount,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      provider,
    });

    const idempotency = await deps.claimIdempotency(input, requestHash);
    if (idempotency.kind === 'replay') {
      return idempotency.response;
    }
    if (idempotency.kind === 'in_progress') {
      throw new CheckoutPaymentIntentDomainError(
        'IDEMPOTENCY_IN_PROGRESS',
        'Payment initiation is already in progress for this idempotency key.',
        409,
      );
    }

    const order = await deps.loadOrderForPayment(input.orderId, input.buyerId);
    if (!order) {
      throw new CheckoutPaymentIntentDomainError(
        'ORDER_NOT_FOUND',
        'Order not found.',
        404,
      );
    }

    ensureOrderIsPayable(order);
    ensureInputMatchesOrder(order, input);

    const boundProvider = await deps.bindPaymentProvider(order, provider);
    const existingPayment = await deps.loadCanonicalPayment(order.id);
    const generatedIntentId = buildIntentId(order.id, requestHash, boundProvider);

    const payment =
      existingPayment ??
      (await deps.createCanonicalPayment({
        order,
        provider: boundProvider,
        intentId: generatedIntentId,
        providerPaymentId: buildProviderPaymentId(generatedIntentId),
        input,
      }));

    if (existingPayment) {
      ensurePaymentMatchesInput(existingPayment, input, boundProvider);
    }

    const result = buildPaymentIntentResult({
      payment,
      now: deps.now(),
      presentation: deps.buildProviderPresentation?.({
        payment,
        now: deps.now(),
      }),
    });

    await deps.storeIdempotentResponse(input, requestHash, result);

    return result;
  };
}

export async function initiatePaymentIntent(
  input: InitiatePaymentIntentInput,
): Promise<InitiatePaymentIntentResult> {
  return db.transaction(async (tx) => {
    const command = createInitiatePaymentIntentCommand({
      claimIdempotency: async (currentInput, requestHash) => {
        const storageKey = getPaymentIntentIdempotencyStorageKey(
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
          throw new CheckoutPaymentIntentDomainError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was reused with different payload.',
            409,
          );
        }

        if (row.responseBody) {
          return {
            kind: 'replay',
            response: row.responseBody as InitiatePaymentIntentResult,
          };
        }

        return { kind: 'in_progress' };
      },
      loadOrderForPayment: async (orderId, buyerId) => {
        const rows = await tx
          .select({
            id: orders.id,
            buyerId: orders.buyerId,
            eventId: orders.eventId,
            totalMinor: orders.totalMinor,
            status: orders.status,
            paymentProvider: orders.paymentProvider,
          })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.buyerId, buyerId)))
          .limit(1);

        return (rows[0] as OrderPaymentRecord | undefined) ?? null;
      },
      bindPaymentProvider: async (order, provider) => {
        if (order.paymentProvider && order.paymentProvider !== provider) {
          throw new CheckoutPaymentIntentDomainError(
            'PAYMENT_PROVIDER_MISMATCH',
            'Order is already bound to a different payment provider.',
            409,
          );
        }

        if (order.paymentProvider === provider) {
          return provider;
        }

        const rows = await tx
          .update(orders)
          .set({
            paymentProvider: provider,
          })
          .where(eq(orders.id, order.id))
          .returning({
            paymentProvider: orders.paymentProvider,
          });

        const row = rows[0];
        if (!row?.paymentProvider) {
          throw new CheckoutPaymentIntentDomainError(
            'PAYMENT_PROVIDER_BIND_FAILED',
            'Failed to bind payment provider to order.',
            500,
          );
        }

        return row.paymentProvider as 'stub';
      },
      loadCanonicalPayment: async (orderId) => {
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
          })
          .from(payments)
          .where(eq(payments.orderId, orderId))
          .limit(1);

        return (rows[0] as PaymentRecord | undefined) ?? null;
      },
      createCanonicalPayment: async ({
        order,
        provider,
        intentId,
        providerPaymentId,
        input: currentInput,
      }) => {
        const paymentId = `pay_${hashRequest({
          orderId: order.id,
          intentId,
        }).slice(0, 24)}`;

        const rows = await tx
          .insert(payments)
          .values({
            id: paymentId,
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
          })
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
          });

        const row = rows[0];
        if (!row) {
          throw new CheckoutPaymentIntentDomainError(
            'PAYMENT_CREATE_FAILED',
            'Failed to create payment record.',
            500,
          );
        }

        return row as PaymentRecord;
      },
      storeIdempotentResponse: async (currentInput, requestHash, result) => {
        const storageKey = getPaymentIntentIdempotencyStorageKey(
          currentInput.idempotencyKey,
        );

        await tx
          .update(idempotencyKeys)
          .set({
            responseCode: 201,
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
