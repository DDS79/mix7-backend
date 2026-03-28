import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import { withRuntimeActorContext } from './http_session_middleware';
import {
  CheckoutPaymentIntentDomainError,
  initiatePaymentIntent,
} from './payment_http_api';

const requestSchema = z.object({
  buyerId: z.string().uuid().optional(),
  orderId: z.string().uuid(),
  amount: z.coerce.number().positive('amount must be a positive number'),
  currency: z
    .string()
    .trim()
    .length(3, 'currency must be a valid ISO code')
    .regex(/^[A-Za-z]{3}$/, 'currency must be a valid ISO code')
    .transform((value) => value.toUpperCase()),
  paymentMethod: z.enum(['card', 'bank_transfer', 'wallet']),
  provider: z.enum(['stub']).optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9:_-]{8,128}$/;

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Array<{ field: string; message: string }>,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

function validationErrorResponse(error: z.ZodError) {
  return errorResponse(
    400,
    'VALIDATION_ERROR',
    'Request validation failed.',
    error.issues.map((issue) => ({
      field: issue.path.join('.') || 'body',
      message: issue.message,
    })),
  );
}

function readIdempotencyKeyHeader(request: Request): string | undefined {
  const value = request.headers.get(IDEMPOTENCY_KEY_HEADER)?.trim();

  if (!value) {
    return undefined;
  }

  if (!IDEMPOTENCY_KEY_FORMAT.test(value)) {
    throw new CheckoutPaymentIntentDomainError(
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
      return validationErrorResponse(parsed.error);
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
        'Body idempotency_key does not match Idempotency-Key header.',
      );
    }

    const idempotencyKey = headerIdempotencyKey ?? bodyIdempotencyKey;
    if (!idempotencyKey) {
      return errorResponse(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency key is required for payment initiation.',
      );
    }

    return await withRuntimeActorContext({
      request,
      action: 'checkout_payment_intent',
      handler: async (context) => {
        if (
          parsed.data.buyerId &&
          parsed.data.buyerId !== context.actor.buyerRef
        ) {
          throw new CheckoutPaymentIntentDomainError(
            'ACTOR_BUYER_MISMATCH',
            'Request buyerId does not match the resolved actor.',
            409,
          );
        }

        return initiatePaymentIntent({
          buyerId: context.actor.buyerRef,
          orderId: parsed.data.orderId,
          amount: parsed.data.amount,
          currency: parsed.data.currency,
          paymentMethod: parsed.data.paymentMethod,
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
          { status: 201 },
        ),
    });
  } catch (error) {
    if (error instanceof CheckoutPaymentIntentDomainError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      'Unexpected payment intent error.',
    );
  }
}
