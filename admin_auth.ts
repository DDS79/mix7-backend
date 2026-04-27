import { NextResponse } from './next_server_compat';
import { resolveHttpRuntimeContext, runtimeErrorResponse } from './http_runtime';

function parseCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function actorIdsAllowlist() {
  return new Set(parseCsv(process.env.ADMIN_ACTOR_IDS));
}

function telegramIdsAllowlist() {
  return new Set(
    parseCsv(process.env.ADMIN_TELEGRAM_IDS).map((entry) =>
      entry.startsWith('tg:') ? entry : `tg:${entry}`,
    ),
  );
}

function isAdminActor(context: Awaited<ReturnType<typeof resolveHttpRuntimeContext>>) {
  if (actorIdsAllowlist().has(context.actor.id)) {
    return true;
  }

  const authAccount = context.authAccount;
  if (!authAccount || authAccount.authType !== 'external_provider') {
    return false;
  }

  return (
    telegramIdsAllowlist().has(authAccount.loginRef) ||
    telegramIdsAllowlist().has(context.actor.buyerRef)
  );
}

function adminForbiddenResponse() {
  return NextResponse.json(
    {
      error: {
        code: 'ADMIN_FORBIDDEN',
        message: 'Admin permission is required.',
      },
    },
    { status: 403 },
  );
}

export async function withAdminActorContext<T>(args: {
  request: Request;
  handler: (context: Awaited<ReturnType<typeof resolveHttpRuntimeContext>>) => Promise<T>;
  toResponse: (value: T) => Response;
}): Promise<Response> {
  let context: Awaited<ReturnType<typeof resolveHttpRuntimeContext>>;

  try {
    context = await resolveHttpRuntimeContext({
      request: args.request,
      action: 'account_profile_update',
    });
  } catch (error) {
    return runtimeErrorResponse(error);
  }

  if (!isAdminActor(context)) {
    return adminForbiddenResponse();
  }

  const value = await args.handler(context);
  return args.toResponse(value);
}
