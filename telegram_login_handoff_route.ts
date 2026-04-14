import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import { issueRuntimeSession } from './http_runtime';
import {
  completeTelegramLoginChallenge,
  createTelegramLoginChallenge,
  exchangeTelegramLoginHandoffToken,
  TelegramLoginHandoffError,
} from './telegram_login_handoff_store';

const createRequestSchema = z.object({
  returnPath: z.string().min(1).optional(),
});

const completeRequestSchema = z.object({
  telegramId: z.number().int().positive(),
  displayName: z.string().min(1).optional(),
});

const exchangeRequestSchema = z.object({
  token: z.string().min(1),
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

function validationErrorResponse(error: z.ZodError) {
  return NextResponse.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      },
    },
    { status: 400 },
  );
}

export async function POST_CREATE(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = createRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  try {
    const challenge = createTelegramLoginChallenge({
      returnPath: parsed.data.returnPath,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          challengeId: challenge.id,
          status: challenge.status,
          expiresAt: challenge.expiresAt,
          returnPath: challenge.returnPath,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof TelegramLoginHandoffError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, 'LOGIN_CHALLENGE_CREATION_FAILED', 'Telegram login challenge creation failed.');
  }
}

export async function POST_COMPLETE(request: Request, challengeId: string) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = completeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  try {
    const buyerRef = `tg:${parsed.data.telegramId}`;
    const identity = await issueRuntimeSession({
      buyerRef,
      authType: 'external_provider',
      authStatus: 'active',
      loginRef: buyerRef,
      displayName: parsed.data.displayName ?? `Telegram user ${parsed.data.telegramId}`,
      sessionType: 'authenticated',
      trustLevel: 'active',
      trustSource: 'self_asserted',
    });

    const completion = completeTelegramLoginChallenge({
      challengeId,
      sessionPayload: {
        buyerRef,
        actorId: identity.actor.id,
        authAccountId: identity.authAccount.id,
        sessionId: identity.session.id,
        sessionType: identity.session.sessionType,
        sessionStatus: identity.session.status,
        trustLevel: identity.trust.level,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          challengeId: completion.challenge.id,
          status: completion.challenge.status,
          handoffToken: completion.handoffToken.id,
          expiresAt: completion.handoffToken.expiresAt,
          returnPath: completion.handoffToken.sessionPayload.returnPath,
          replayed: completion.replayed,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof TelegramLoginHandoffError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, 'CHALLENGE_COMPLETION_FAILED', 'Telegram login challenge completion failed.');
  }
}

export async function POST_EXCHANGE(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = exchangeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  try {
    const payload = exchangeTelegramLoginHandoffToken({
      tokenId: parsed.data.token,
    });

    return NextResponse.json(
      {
        ok: true,
        data: payload,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof TelegramLoginHandoffError) {
      return errorResponse(error.status, error.code, error.message);
    }
    return errorResponse(500, 'HANDOFF_TOKEN_EXCHANGE_FAILED', 'Telegram login handoff exchange failed.');
  }
}
