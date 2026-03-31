import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import {
  EventRegistrationTicketError,
  createEventRegistration,
} from './event_registration_ticket_store';
import { withRuntimeActorContext } from './http_session_middleware';

const requestSchema = z.object({
  eventSlug: z
    .string()
    .trim()
    .min(3)
    .max(140)
    .regex(/^[a-z0-9-]+$/, 'eventSlug must be lowercase slug format'),
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
        createEventRegistration({
          actorId: context.actor.id,
          buyerId: context.actor.buyerRef,
          eventSlug: parsed.data.eventSlug,
        }),
      toResponse: (result) =>
        NextResponse.json(
          {
            ok: true,
            data: {
              registrationId: result.registration.id,
              eventId: result.event.id,
              eventSlug: result.event.slug,
              status: result.registration.status,
              nextAction: result.nextAction,
              replayed: result.replayed,
              ...(result.orderId
                ? {
                    checkout: {
                      orderId: result.orderId,
                      totalMinor: result.event.priceMinor,
                      currency: result.event.currency,
                    },
                  }
                : {}),
              ...(result.ticket
                ? {
                    ticket: {
                      ticketId: result.ticket.id,
                    },
                  }
                : {}),
            },
          },
          { status: result.replayed ? 200 : 201 },
        ),
    });
  } catch (error) {
    if (error instanceof EventRegistrationTicketError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      'Unexpected registration error.',
    );
  }
}
