import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import { withRuntimeActorContext } from './http_session_middleware';
import {
  CheckoutOrderSourceError,
  createRuntimeOrder,
} from './payment_runtime_store';

const requestSchema = z.object({
  orderId: z.string().uuid(),
  eventId: z.string().uuid(),
  totalMinor: z.number().int().positive(),
});

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

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    return await withRuntimeActorContext({
      request,
      action: 'checkout_payment_intent',
      handler: async (context) =>
        createRuntimeOrder({
          id: parsed.data.orderId,
          buyerId: context.actor.buyerRef,
          eventId: parsed.data.eventId,
          totalMinor: parsed.data.totalMinor,
        }),
      toResponse: (order) =>
        NextResponse.json(
          {
            ok: true,
            data: {
              orderId: order.id,
              buyerId: order.buyerId,
              eventId: order.eventId,
              totalMinor: order.totalMinor,
              status: order.status,
              paymentProvider: order.paymentProvider,
            },
          },
          { status: 201 },
        ),
    });
  } catch (error) {
    if (error instanceof CheckoutOrderSourceError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      'Unexpected checkout order creation error.',
    );
  }
}
