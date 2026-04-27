import { NextResponse } from './next_server_compat';

import { withAdminActorContext } from './admin_auth';
import { eventAdminStore, EventAdminError } from './event_admin_store';

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const eventId = url.searchParams.get('eventId')?.trim() || undefined;

    return await withAdminActorContext({
      request,
      handler: async () => ({
        auditLog: await eventAdminStore.listAuditLogs({ entityId: eventId }),
      }),
      toResponse: (value) =>
        NextResponse.json({
          ok: true,
          data: value,
        }),
    });
  } catch (error) {
    if (error instanceof EventAdminError) {
      return errorResponse(error.status, error.code, error.message);
    }

    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Unexpected admin audit error.');
  }
}
