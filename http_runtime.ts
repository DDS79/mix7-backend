import { NextResponse } from './next_server_compat';

import { createResolveActorAuthProfileCommand } from './product_actor_auth_profile';
import {
  createExpireSessionIfNeededCommand,
  createEstablishIdentityTrustCommand,
  createIssueAuthSessionCommand,
  createRevokeSessionCommand,
  createResolveRuntimeActorContextCommand,
  createValidateSessionCommand,
  type AuthSession,
  type IdentityTrust,
  type RegistrationPolicyAction,
  type RuntimeSessionResolution,
  type SessionType,
} from './product_auth_session_identity_trust';
import type { Actor } from './product_domain_anchors';
import type { AuthAccount, ActorProfile } from './product_actor_auth_profile';

export const SESSION_ID_HEADER = 'x-session-id';

export type HttpRuntimeIssueSessionInput = {
  buyerRef: string;
  authType: AuthAccount['authType'];
  authStatus: AuthAccount['status'];
  loginRef?: string | null;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
  metadata?: Record<string, unknown>;
  sessionType?: SessionType;
  expiresInMs?: number | null;
  trustLevel?: IdentityTrust['level'] | null;
  trustSource?: IdentityTrust['source'] | null;
};

export class HttpRuntimeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'HttpRuntimeError';
    this.code = code;
    this.status = status;
  }
}

const actors = new Map<string, Actor>();
const authAccounts = new Map<string, AuthAccount>();
const profiles = new Map<string, ActorProfile>();
const sessions = new Map<string, AuthSession>();
const trusts = new Map<string, IdentityTrust>();

function now() {
  return new Date();
}

const resolveActorAuthProfile = createResolveActorAuthProfileCommand({
  loadActorByBuyerRef: async (buyerRef) => {
    for (const actor of actors.values()) {
      if (actor.buyerRef === buyerRef) {
        return actor;
      }
    }
    return null;
  },
  persistActor: async (actor) => {
    actors.set(actor.id, actor);
    return actor;
  },
  loadAuthAccount: async (actorId, authType, loginRef) => {
    for (const account of authAccounts.values()) {
      if (
        account.actorId === actorId &&
        account.authType === authType &&
        account.loginRef === loginRef
      ) {
        return account;
      }
    }
    return null;
  },
  persistAuthAccount: async (account) => {
    authAccounts.set(account.id, account);
    return account;
  },
  loadActorProfile: async (actorId) => {
    for (const profile of profiles.values()) {
      if (profile.actorId === actorId) {
        return profile;
      }
    }
    return null;
  },
  persistActorProfile: async (profile) => {
    profiles.set(profile.id, profile);
    return profile;
  },
  now,
});

const establishIdentityTrust = createEstablishIdentityTrustCommand({
  persistTrust: async (trust) => {
    trusts.set(`${trust.actorId}:${trust.authAccountId ?? 'anon'}`, trust);
    return trust;
  },
  now,
});

const issueAuthSession = createIssueAuthSessionCommand({
  persistSession: async (session) => {
    sessions.set(session.id, session);
    return session;
  },
  now,
});

const validateSession = createValidateSessionCommand({
  loadActor: async (actorId) => actors.get(actorId) ?? null,
  loadAuthAccount: async (authAccountId) =>
    authAccountId ? authAccounts.get(authAccountId) ?? null : null,
  loadTrust: async (actorId, authAccountId) =>
    trusts.get(`${actorId}:${authAccountId ?? 'anon'}`) ?? null,
  persistSession: async (session) => {
    sessions.set(session.id, session);
    return session;
  },
  now,
});

const resolveRuntimeActorContext = createResolveRuntimeActorContextCommand({
  validateSession,
});
const expireRuntimeSessionIfNeeded = createExpireSessionIfNeededCommand({
  persistSession: async (session) => {
    sessions.set(session.id, session);
    return session;
  },
  now,
});
const revokeRuntimeSession = createRevokeSessionCommand({
  persistSession: async (session) => {
    sessions.set(session.id, session);
    return session;
  },
  now,
});

function mapRuntimeError(error: unknown): HttpRuntimeError {
  if (error instanceof HttpRuntimeError) {
    return error;
  }

  if (error instanceof Error && 'code' in error) {
    const code = String((error as { code: string }).code);
    if (code === 'SESSION_REVOKED') {
      return new HttpRuntimeError('SESSION_REVOKED', error.message, 401);
    }
    if (code === 'SESSION_EXPIRED') {
      return new HttpRuntimeError('SESSION_EXPIRED', error.message, 401);
    }
    if (code === 'ACTOR_NOT_FOUND') {
      return new HttpRuntimeError('ACTOR_NOT_FOUND', error.message, 404);
    }
    if (code === 'ACTOR_INACTIVE') {
      return new HttpRuntimeError('POLICY_FORBIDDEN', error.message, 403);
    }
    if (code === 'IDENTITY_TRUST_INSUFFICIENT') {
      return new HttpRuntimeError('TRUST_INSUFFICIENT', error.message, 403);
    }
    if (code === 'SESSION_TYPE_INSUFFICIENT') {
      return new HttpRuntimeError('POLICY_FORBIDDEN', error.message, 403);
    }
  }

  return new HttpRuntimeError(
    'SESSION_INVALID',
    'Runtime session validation failed.',
    401,
  );
}

export async function issueRuntimeSession(
  input: HttpRuntimeIssueSessionInput,
): Promise<{
  actor: Actor;
  authAccount: AuthAccount;
  profile: ActorProfile;
  session: AuthSession;
  trust: IdentityTrust;
}> {
  const identity = await resolveActorAuthProfile(input);
  const trust = await establishIdentityTrust({
    actor: identity.actor,
    authAccount: identity.authAccount,
    requestedLevel: input.trustLevel ?? undefined,
    source: input.trustSource ?? undefined,
  });
  const session = await issueAuthSession({
    actor: identity.actor,
    authAccount: identity.authAccount,
    sessionType: input.sessionType,
    expiresInMs: input.expiresInMs,
  });

  return {
    actor: identity.actor,
    authAccount: identity.authAccount,
    profile: identity.profile,
    session,
    trust,
  };
}

export async function resolveHttpRuntimeContext(args: {
  request: Request;
  action: RegistrationPolicyAction;
}): Promise<RuntimeSessionResolution> {
  const sessionId = args.request.headers.get(SESSION_ID_HEADER)?.trim();
  if (!sessionId) {
    throw new HttpRuntimeError(
      'SESSION_REQUIRED',
      'Session header is required.',
      401,
    );
  }

  const session = sessions.get(sessionId);
  if (!session) {
    throw new HttpRuntimeError(
      'SESSION_INVALID',
      'Session was not found.',
      401,
    );
  }

  try {
    return await resolveRuntimeActorContext({
      session,
      action: args.action,
    });
  } catch (error) {
    throw mapRuntimeError(error);
  }
}

export async function expireHttpRuntimeSessionIfNeeded(
  sessionId: string,
): Promise<AuthSession> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new HttpRuntimeError(
      'SESSION_INVALID',
      'Session was not found.',
      401,
    );
  }

  return expireRuntimeSessionIfNeeded(session);
}

export async function revokeHttpRuntimeSession(
  sessionId: string,
): Promise<AuthSession> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new HttpRuntimeError(
      'SESSION_INVALID',
      'Session was not found.',
      401,
    );
  }

  return revokeRuntimeSession(session);
}

export function resetHttpRuntimeState() {
  actors.clear();
  authAccounts.clear();
  profiles.clear();
  sessions.clear();
  trusts.clear();
}

export function runtimeErrorResponse(error: unknown) {
  const mapped = mapRuntimeError(error);
  return NextResponse.json(
    {
      error: {
        code: mapped.code,
        message: mapped.message,
      },
    },
    { status: mapped.status },
  );
}
