import { NextResponse } from './next_server_compat';

import {
  EventRegistrationTicketError,
  getPublicEventDetail,
  listPublicEvents,
} from './event_registration_ticket_store';

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

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      events: await listPublicEvents(),
    },
  });
}

export async function GET_BY_SLUG(_request: Request, slug: string) {
  try {
    return NextResponse.json({
      ok: true,
      data: await getPublicEventDetail(slug),
    });
  } catch (error) {
    if (error instanceof EventRegistrationTicketError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(
      500,
      'INTERNAL_SERVER_ERROR',
      'Unexpected event detail error.',
    );
  }
}
