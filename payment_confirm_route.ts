import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import { withRuntimeActorContext } from './http_session_middleware';
import {
  CheckoutPaymentConfirmDomainError,
  confirmPayment,
} from './payment_http_api';

const requestSchema = z.object({
  buyerId: z.string().uuid().optional(),
  orderId: z.string().uuid(),
  paymentIntentId: z.string().min(1).max(140),
  provider: z.enum(['stub']).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9:_-]{8,128}$/;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

function readIdempotencyKeyHeader(request: Request): string | undefined {
  const value = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();

  if (!value) {
    return undefined;
  }

  if (!IDEMPOTENCY_KEY_FORMAT.test(value)) {
    throw new CheckoutPaymentConfirmDomainError(
      'INVALID_IDEMPOTENCY_KEY',
      'Invalid Idempotency-Key header format.',
      400,
    );
  }

  return value;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return errorResponse(400, 'INVALID_REQUEST', 'Invalid request');
    }

    const headerIdempotencyKey = readIdempotencyKeyHeader(request);
    const bodyIdempotencyKey = parsed.data.idempotencyKey?.trim();

    if (
      bodyIdempotencyKey &&
      headerIdempotencyKey &&
      bodyIdempotencyKey !== headerIdempotencyKey
    ) {
      return errorResponse(
        409,
        'IDEMPOTENCY_KEY_MISMATCH',
        'Body idempotencyKey does not match Idempotency-Key header.',
      );
    }

    const idempotencyKey = headerIdempotencyKey ?? bodyIdempotencyKey;
    if (!idempotencyKey) {
      return errorResponse(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency key is required for payment confirmation.',
      );
    }

    return await withRuntimeActorContext({
      request,
      action: 'checkout_payment_confirm',
      handler: async (context) => {
        if (
          parsed.data.buyerId &&
          parsed.data.buyerId !== context.actor.buyerRef
        ) {
          throw new CheckoutPaymentConfirmDomainError(
            'ACTOR_BUYER_MISMATCH',
            'Request buyerId does not match the resolved actor.',
            409,
          );
        }

        return confirmPayment({
          buyerId: context.actor.buyerRef,
          orderId: parsed.data.orderId,
          paymentIntentId: parsed.data.paymentIntentId,
          provider: parsed.data.provider,
          idempotencyKey,
        });
      },
      toResponse: (result) =>
        NextResponse.json(
          {
            ok: true,
            data: result,
          },
          { status: 202 },
        ),
    });
  } catch (error) {
    if (error instanceof CheckoutPaymentConfirmDomainError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      'Unexpected payment confirmation error.',
    );
  }
}
