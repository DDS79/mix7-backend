import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import { withAdminActorContext } from './admin_auth';
import { eventAdminStore, EventAdminError } from './event_admin_store';

const eventPayloadSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(3)
    .max(140)
    .regex(/^[a-z0-9-]+$/),
  venueId: z.string().trim().min(1).max(140).nullable(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(5000),
  status: z.enum(['draft', 'published', 'cancelled', 'completed']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  categoryRef: z.string().trim().min(1).max(140).nullable(),
  characteristicRefs: z.array(z.string().trim().min(1).max(140)).default([]),
  visibility: z.enum(['public', 'private', 'members_only', 'invite_only']),
  metadata: z.record(z.string(), z.unknown()).default({}),
  priceMinor: z.number().int().min(0),
  currency: z.string().trim().length(3).regex(/^[A-Za-z]{3}$/),
  salesOpen: z.boolean().optional(),
});

const eventPatchSchema = eventPayloadSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided.',
);

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

function adminErrorResponse(error: unknown) {
  if (error instanceof EventAdminError) {
    return errorResponse(error.status, error.code, error.message);
  }

  return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Unexpected admin event error.');
}

export async function GET(request: Request) {
  try {
    return await withAdminActorContext({
      request,
      handler: async () => ({
        events: await eventAdminStore.listAdminEvents(),
      }),
      toResponse: (value) =>
        NextResponse.json({
          ok: true,
          data: value,
        }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = eventPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    return await withAdminActorContext({
      request,
      handler: async (context) =>
        await eventAdminStore.createEvent({
          actorId: context.actor.id,
          input: parsed.data,
        }),
      toResponse: (event) =>
        NextResponse.json(
          {
            ok: true,
            data: {
              event,
            },
          },
          { status: 201 },
        ),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH_BY_ID(request: Request, eventId: string) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = eventPatchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    return await withAdminActorContext({
      request,
      handler: async (context) =>
        await eventAdminStore.updateEvent({
          actorId: context.actor.id,
          eventId,
          input: parsed.data,
        }),
      toResponse: (event) =>
        NextResponse.json({
          ok: true,
          data: {
            event,
          },
        }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

async function setSalesState(request: Request, eventId: string, salesOpen: boolean) {
  try {
    return await withAdminActorContext({
      request,
      handler: async (context) =>
        await eventAdminStore.setEventSalesOpen({
          actorId: context.actor.id,
          eventId,
          salesOpen,
        }),
      toResponse: (event) =>
        NextResponse.json({
          ok: true,
          data: {
            event,
          },
        }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST_OPEN_SALES(request: Request, eventId: string) {
  return setSalesState(request, eventId, true);
}

export async function POST_CLOSE_SALES(request: Request, eventId: string) {
  return setSalesState(request, eventId, false);
}

export async function POST_ARCHIVE(request: Request, eventId: string) {
  try {
    return await withAdminActorContext({
      request,
      handler: async (context) =>
        await eventAdminStore.archiveEvent({
          actorId: context.actor.id,
          eventId,
        }),
      toResponse: (event) =>
        NextResponse.json({
          ok: true,
          data: {
            event,
          },
        }),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
