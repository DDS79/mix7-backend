import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import { issueRuntimeSession } from './http_runtime';

const requestSchema = z.object({
  buyerRef: z.string().min(1),
  authType: z.enum(['anonymous', 'phone', 'email', 'external_provider']),
  authStatus: z.enum(['provisional', 'active', 'blocked']),
  loginRef: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  sessionType: z.enum(['anonymous', 'authenticated', 'elevated']).optional(),
  expiresInMs: z.number().int().positive().optional(),
  trustLevel: z.enum(['anonymous', 'provisional', 'active', 'verified']).optional(),
  trustSource: z
    .enum(['anonymous_session', 'self_asserted', 'registration', 'verification'])
    .optional(),
});

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

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return errorResponse(400, 'INVALID_REQUEST', 'Invalid request');
  }

  try {
    const result = await issueRuntimeSession(parsed.data);
    return NextResponse.json(
      {
        ok: true,
        data: {
          actorId: result.actor.id,
          authAccountId: result.authAccount.id,
          sessionId: result.session.id,
          sessionType: result.session.sessionType,
          sessionStatus: result.session.status,
          trustLevel: result.trust.level,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Session issue failed.';
    return errorResponse(400, 'SESSION_ISSUE_FAILED', message);
  }
}
