import { NextResponse } from './next_server_compat';

import {
  EventRegistrationTicketError,
  getOwnedTicket,
  listOwnedTickets,
} from './event_registration_ticket_store';
import { withRuntimeActorContext } from './http_session_middleware';

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

export async function GET_BY_ID(request: Request, ticketId: string) {
  try {
    return await withRuntimeActorContext({
      request,
      action: 'checkout_payment_intent',
      handler: async (context) =>
        await getOwnedTicket({
          actorId: context.actor.id,
          ticketId,
        }),
      toResponse: (ticket) =>
        NextResponse.json({
          ok: true,
          data: ticket,
        }),
    });
  } catch (error) {
    if (error instanceof EventRegistrationTicketError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      'Unexpected ticket retrieval error.',
    );
  }
}

export async function GET(request: Request) {
  try {
    return await withRuntimeActorContext({
      request,
      action: 'checkout_payment_intent',
      handler: async (context) =>
        await listOwnedTickets({
          actorId: context.actor.id,
        }),
      toResponse: (tickets) =>
        NextResponse.json({
          ok: true,
          data: {
            tickets,
          },
        }),
    });
  } catch (error) {
    if (error instanceof EventRegistrationTicketError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      'Unexpected ticket list retrieval error.',
    );
  }
}
