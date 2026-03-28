import { NextResponse } from './next_server_compat';

import { resolveHttpRuntimeContext, runtimeErrorResponse } from './http_runtime';

export async function GET(request: Request) {
  try {
    const context = await resolveHttpRuntimeContext({
      request,
      action: 'checkout_payment_intent',
    });

    return NextResponse.json({
      ok: true,
      data: {
        actorId: context.actor.id,
        authAccountId: context.authAccount?.id ?? null,
        sessionId: context.session.id,
        sessionType: context.session.sessionType,
        sessionStatus: context.session.status,
        trustLevel: context.trust.level,
        allowed: context.allowed,
        action: context.policy?.action ?? null,
      },
    });
  } catch (error) {
    return runtimeErrorResponse(error);
  }
}
