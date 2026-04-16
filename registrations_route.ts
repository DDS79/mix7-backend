import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import {
  EventRegistrationTicketError,
  createEventRegistration,
} from './event_registration_ticket_store';
import { withRuntimeActorContext } from './http_session_middleware';
import { SESSION_ID_HEADER } from './http_runtime';

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

function truncateSessionId(sessionId: string | null) {
  if (!sessionId) {
    return null;
  }

  if (sessionId.length <= 20) {
    return sessionId;
  }

  return `${sessionId.slice(0, 8)}...${sessionId.slice(-8)}`;
}

export async function POST(request: Request) {
  const diagnosticContext: {
    eventSlug?: string;
    actorId?: string;
    sessionId?: string | null;
    orderId?: string | null;
  } = {
    sessionId: truncateSessionId(request.headers.get(SESSION_ID_HEADER)?.trim() ?? null),
  };

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    diagnosticContext.eventSlug = parsed.data.eventSlug;

    return await withRuntimeActorContext({
      request,
      action: 'checkout_payment_intent',
      handler: async (context) => {
        diagnosticContext.actorId = context.actor.id;
        const result = await createEventRegistration({
          actorId: context.actor.id,
          buyerId: context.actor.buyerRef,
          eventSlug: parsed.data.eventSlug,
        });
        diagnosticContext.orderId = result.orderId;
        return result;
      },
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
    // Temporary diagnostic instrumentation for production paid-registration debugging.
    console.error(
      JSON.stringify({
        scope: 'registrations_route',
        phase: 'unexpected_error',
        eventSlug: diagnosticContext.eventSlug ?? null,
        actorId: diagnosticContext.actorId ?? null,
        sessionId: diagnosticContext.sessionId ?? null,
        orderId: diagnosticContext.orderId ?? null,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack ?? null : null,
      }),
    );

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
