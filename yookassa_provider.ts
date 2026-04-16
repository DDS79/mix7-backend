import { createHash } from 'node:crypto';

import { readYookassaConfig } from './yookassa_config';

export class YookassaProviderError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'YookassaProviderError';
    this.code = code;
    this.status = status;
  }
}

export type YookassaCreatePaymentInput = {
  idempotencyKey: string;
  orderId: string;
  paymentId: string;
  actorId: string;
  registrationId: string;
  eventId: string;
  amountMinor: number;
  currency: 'RUB';
};

export type YookassaCreatePaymentResult = {
  providerPaymentId: string;
  confirmationUrl: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
};

export type YookassaWebhookBody = {
  type: 'notification';
  event: 'payment.succeeded' | 'payment.waiting_for_capture' | 'payment.canceled';
  object: {
    id: string;
    status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
    metadata?: Record<string, string | undefined>;
  };
};

function toAmountValue(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function createAuthorizationHeader(shopId: string, secretKey: string) {
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
}

function buildRequestKey(input: YookassaCreatePaymentInput) {
  return createHash('sha256')
    .update(JSON.stringify({
      provider: 'yookassa',
      orderId: input.orderId,
      paymentId: input.paymentId,
      idempotencyKey: input.idempotencyKey,
    }))
    .digest('hex')
    .slice(0, 32);
}

export async function createYookassaPayment(
  input: YookassaCreatePaymentInput,
): Promise<YookassaCreatePaymentResult> {
  const config = readYookassaConfig();
  if (!config) {
    throw new YookassaProviderError(
      'YOOKASSA_CONFIG_MISSING',
      'YooKassa provider is not configured.',
      500,
    );
  }

  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      authorization: createAuthorizationHeader(config.shopId, config.secretKey),
      'content-type': 'application/json',
      'Idempotence-Key': buildRequestKey(input),
    },
    body: JSON.stringify({
      amount: {
        value: toAmountValue(input.amountMinor),
        currency: input.currency,
      },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: config.returnUrl,
      },
      description: `MIX7 order ${input.orderId}`,
      metadata: {
        order_id: input.orderId,
        payment_id: input.paymentId,
        actor_id: input.actorId,
        registration_id: input.registrationId,
        event_id: input.eventId,
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        id?: string;
        status?: YookassaCreatePaymentResult['status'];
        confirmation?: {
          confirmation_url?: string;
        };
      }
    | {
        type?: string;
        description?: string;
      }
    | null;

  if (!response.ok) {
    throw new YookassaProviderError(
      'YOOKASSA_CREATE_PAYMENT_FAILED',
      typeof payload === 'object' && payload && 'description' in payload && payload.description
        ? payload.description
        : 'YooKassa create payment request failed.',
    );
  }

  const providerPaymentId =
    typeof payload === 'object' && payload && 'id' in payload && payload.id
      ? payload.id
      : null;
  const confirmationUrl =
    typeof payload === 'object' &&
    payload &&
    'confirmation' in payload &&
    payload.confirmation?.confirmation_url
      ? payload.confirmation.confirmation_url
      : null;
  const status =
    typeof payload === 'object' && payload && 'status' in payload && payload.status
      ? payload.status
      : null;

  if (!providerPaymentId) {
    throw new YookassaProviderError(
      'PROVIDER_PAYMENT_ID_NOT_PERSISTED',
      'YooKassa did not return a payment id.',
    );
  }

  if (!confirmationUrl) {
    throw new YookassaProviderError(
      'CONFIRMATION_URL_MISSING',
      'YooKassa did not return confirmation_url.',
    );
  }

  return {
    providerPaymentId,
    confirmationUrl,
    status: status ?? 'pending',
  };
}
