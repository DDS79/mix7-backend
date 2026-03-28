import type {
  AccessGrant,
  Actor,
  Entitlement,
} from './product_domain_anchors';
import type { AuthAccount } from './product_actor_auth_profile';
import { ProductActorAuthProfileError } from './product_actor_auth_profile';

export type SessionType = 'anonymous' | 'authenticated' | 'elevated';
export type SessionStatus = 'active' | 'expired' | 'revoked';
export type IdentityTrustLevel = 'anonymous' | 'provisional' | 'active' | 'verified';
export type IdentityTrustSource =
  | 'anonymous_session'
  | 'self_asserted'
  | 'registration'
  | 'verification';

export type AuthSession = {
  id: string;
  actorId: string;
  authAccountId: string | null;
  sessionType: SessionType;
  status: SessionStatus;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
  tokenId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IdentityTrust = {
  actorId: string;
  authAccountId: string | null;
  level: IdentityTrustLevel;
  source: IdentityTrustSource;
  updatedAt: string;
};

export type RegistrationPolicyAction =
  | 'checkout_payment_intent'
  | 'checkout_payment_confirm'
  | 'account_profile_update'
  | 'guarded_access_use';

export type RegistrationPolicyRule = {
  action: RegistrationPolicyAction;
  requiredSessionType: SessionType;
  requiredTrustLevel: IdentityTrustLevel;
};

export type RuntimeSessionResolution = {
  actor: Actor;
  authAccount: AuthAccount | null;
  session: AuthSession;
  trust: IdentityTrust;
  policy: RegistrationPolicyRule | null;
  allowed: boolean;
};

export type OwnershipBundle = {
  actor: Actor;
  orders: Array<{ actorId: string; orderId: string }>;
  payments: Array<{ actorId: string; paymentId: string }>;
  entitlements: Entitlement[];
  accessGrants: AccessGrant[];
};

export const REGISTRATION_POLICY_RULES: Record<
  RegistrationPolicyAction,
  RegistrationPolicyRule
> = {
  checkout_payment_intent: {
    action: 'checkout_payment_intent',
    requiredSessionType: 'anonymous',
    requiredTrustLevel: 'anonymous',
  },
  checkout_payment_confirm: {
    action: 'checkout_payment_confirm',
    requiredSessionType: 'anonymous',
    requiredTrustLevel: 'provisional',
  },
  account_profile_update: {
    action: 'account_profile_update',
    requiredSessionType: 'authenticated',
    requiredTrustLevel: 'active',
  },
  guarded_access_use: {
    action: 'guarded_access_use',
    requiredSessionType: 'authenticated',
    requiredTrustLevel: 'verified',
  },
};

export const AUTH_SESSION_TRUST_FUTURE_MAPPING = {
  anonymous_users: 'Actor + anonymous AuthSession + trust=anonymous/provisional',
  registered_users: 'Actor + AuthAccount + authenticated AuthSession + trust=active',
  verified_users: 'Actor + AuthAccount + IdentityTrust(level=verified)',
  residents: 'Actor + ResidentProfile + policy gates using trust/session',
  clients: 'Actor + ClientProfile + authenticated session',
  operators: 'Actor(kind=operator) + elevated session + stronger trust policy',
  guards: 'Actor(kind=guard) + elevated session + stronger trust policy',
  multiple_login_methods: 'many AuthAccount rows per Actor',
  specialization_profiles: 'Actor root with extra profile tables',
  stronger_authorization_policies: 'RegistrationPolicyRule extensions',
} as const;

export const SESSION_STRATEGY_DECISION = {
  chosen: 'stateful',
  whyChosen: [
    'deterministic revocation',
    'server-side actor resolution',
    'persistent operational auditability',
    'safe future fit for guarded/operator access',
  ],
  notChosenNow: {
    jwt_only: 'weaker revocation and actor-claim drift risk',
    hybrid: 'extra complexity before transport/token layer is required',
  },
} as const;

export const SESSION_OBSERVABILITY_FIELDS = [
  'sessionId',
  'actorId',
  'authAccountId',
  'sessionType',
  'sessionStatus',
  'issuedAt',
  'expiresAt',
  'revokedAt',
  'lastSeenAt',
  'tokenId',
] as const;

const TRUST_RANK: Record<IdentityTrustLevel, number> = {
  anonymous: 0,
  provisional: 1,
  active: 2,
  verified: 3,
};

const SESSION_RANK: Record<SessionType, number> = {
  anonymous: 0,
  authenticated: 1,
  elevated: 2,
};

function isoNow(now: Date) {
  return now.toISOString();
}

function deriveDefaultTrustFromAuthAccount(
  authAccount: AuthAccount | null,
): {
  level: IdentityTrustLevel;
  source: IdentityTrustSource;
} {
  if (!authAccount) {
    return {
      level: 'anonymous',
      source: 'anonymous_session',
    };
  }

  if (authAccount.status === 'active') {
    return {
      level: 'active',
      source: 'registration',
    };
  }

  return {
    level: 'provisional',
    source: authAccount.authType === 'anonymous' ? 'anonymous_session' : 'self_asserted',
  };
}

function deriveDefaultSessionType(authAccount: AuthAccount | null): SessionType {
  if (!authAccount || authAccount.authType === 'anonymous') {
    return 'anonymous';
  }

  return 'authenticated';
}

export function createIssueAuthSessionCommand(deps: {
  persistSession: (session: AuthSession) => Promise<AuthSession>;
  now: () => Date;
}) {
  return async function issueAuthSession(args: {
    actor: Actor;
    authAccount: AuthAccount | null;
    sessionType?: SessionType;
    expiresInMs?: number | null;
  }): Promise<AuthSession> {
    const now = deps.now();
    const issuedAt = isoNow(now);
    const sessionType = args.sessionType ?? deriveDefaultSessionType(args.authAccount);
    const expiresAt =
      args.expiresInMs && args.expiresInMs > 0
        ? new Date(now.getTime() + args.expiresInMs).toISOString()
        : null;

    return deps.persistSession({
      id: `sess_${args.actor.id}_${args.authAccount?.id ?? 'anon'}_${sessionType}`,
      actorId: args.actor.id,
      authAccountId: args.authAccount?.id ?? null,
      sessionType,
      status: 'active',
      issuedAt,
      expiresAt,
      revokedAt: null,
      lastSeenAt: issuedAt,
      tokenId: `tok_${args.actor.id}_${args.authAccount?.id ?? 'anon'}_${sessionType}`,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });
  };
}

export function createEstablishIdentityTrustCommand(deps: {
  persistTrust: (trust: IdentityTrust) => Promise<IdentityTrust>;
  now: () => Date;
}) {
  return async function establishIdentityTrust(args: {
    actor: Actor;
    authAccount: AuthAccount | null;
    currentTrust?: IdentityTrust | null;
    requestedLevel?: IdentityTrustLevel | null;
    source?: IdentityTrustSource | null;
  }): Promise<IdentityTrust> {
    const now = deps.now();
    const fallback = deriveDefaultTrustFromAuthAccount(args.authAccount);
    const requestedLevel = args.requestedLevel ?? fallback.level;
    const currentLevel = args.currentTrust?.level ?? 'anonymous';

    if (TRUST_RANK[requestedLevel] < TRUST_RANK[currentLevel]) {
      throw new ProductActorAuthProfileError(
        'TRUST_DOWNGRADE_NOT_ALLOWED',
        'Identity trust cannot be silently downgraded.',
      );
    }

    return deps.persistTrust({
      actorId: args.actor.id,
      authAccountId: args.authAccount?.id ?? null,
      level: requestedLevel,
      source: args.source ?? fallback.source,
      updatedAt: isoNow(now),
    });
  };
}

export function assertSessionUsable(session: AuthSession, now: Date) {
  if (session.status === 'revoked') {
    throw new ProductActorAuthProfileError(
      'SESSION_REVOKED',
      'Session is revoked.',
    );
  }

  if (session.status === 'expired') {
    throw new ProductActorAuthProfileError(
      'SESSION_EXPIRED',
      'Session is expired.',
    );
  }

  if (session.expiresAt && session.expiresAt <= now.toISOString()) {
    throw new ProductActorAuthProfileError(
      'SESSION_EXPIRED',
      'Session is expired.',
    );
  }
}

export function createExpireSessionIfNeededCommand(deps: {
  persistSession: (session: AuthSession) => Promise<AuthSession>;
  now: () => Date;
}) {
  return async function expireSessionIfNeeded(
    session: AuthSession,
  ): Promise<AuthSession> {
    const now = deps.now();
    if (
      session.status === 'active' &&
      session.expiresAt &&
      session.expiresAt <= now.toISOString()
    ) {
      return deps.persistSession({
        ...session,
        status: 'expired',
        updatedAt: now.toISOString(),
      });
    }

    return session;
  };
}

export function createRevokeSessionCommand(deps: {
  persistSession: (session: AuthSession) => Promise<AuthSession>;
  now: () => Date;
}) {
  return async function revokeSession(
    session: AuthSession,
  ): Promise<AuthSession> {
    const now = deps.now().toISOString();
    if (session.status === 'revoked') {
      return session;
    }

    return deps.persistSession({
      ...session,
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    });
  };
}

export function createValidateSessionCommand(deps: {
  loadActor: (actorId: string) => Promise<Actor | null>;
  loadAuthAccount: (authAccountId: string | null) => Promise<AuthAccount | null>;
  loadTrust: (
    actorId: string,
    authAccountId: string | null,
  ) => Promise<IdentityTrust | null>;
  persistSession: (session: AuthSession) => Promise<AuthSession>;
  now: () => Date;
}) {
  const expireSessionIfNeeded = createExpireSessionIfNeededCommand({
    persistSession: deps.persistSession,
    now: deps.now,
  });

  return async function validateSession(args: {
    session: AuthSession;
    action?: RegistrationPolicyAction;
  }): Promise<RuntimeSessionResolution> {
    const actor = await deps.loadActor(args.session.actorId);
    if (!actor) {
      throw new ProductActorAuthProfileError(
        'ACTOR_NOT_FOUND',
        'Actor for session was not found.',
      );
    }

    const authAccount = await deps.loadAuthAccount(args.session.authAccountId);
    const effectiveSession = await expireSessionIfNeeded(args.session);
    assertSessionUsable(effectiveSession, deps.now());

    const trust =
      (await deps.loadTrust(actor.id, authAccount?.id ?? null)) ?? {
        actorId: actor.id,
        authAccountId: authAccount?.id ?? null,
        ...deriveDefaultTrustFromAuthAccount(authAccount),
        updatedAt: deps.now().toISOString(),
      };

    const touchedSession =
      effectiveSession.status === 'active'
        ? await deps.persistSession({
            ...effectiveSession,
            lastSeenAt: deps.now().toISOString(),
            updatedAt: deps.now().toISOString(),
          })
        : effectiveSession;

    let policy: RegistrationPolicyRule | null = null;
    let allowed = true;

    if (args.action) {
      policy = REGISTRATION_POLICY_RULES[args.action];
      assertActionAllowedByRegistrationPolicy({
        action: args.action,
        actor,
        session: touchedSession,
        trust,
        now: deps.now(),
      });
    }

    return {
      actor,
      authAccount,
      session: touchedSession,
      trust,
      policy,
      allowed,
    };
  };
}

export function createResolveRuntimeActorContextCommand(deps: {
  validateSession: (args: {
    session: AuthSession;
    action?: RegistrationPolicyAction;
  }) => Promise<RuntimeSessionResolution>;
}) {
  return async function resolveRuntimeActorContext(args: {
    session: AuthSession;
    action?: RegistrationPolicyAction;
  }): Promise<RuntimeSessionResolution> {
    return deps.validateSession(args);
  };
}

export function assertActionAllowedByRegistrationPolicy(args: {
  action: RegistrationPolicyAction;
  actor: Actor;
  session: AuthSession;
  trust: IdentityTrust;
  now: Date;
}) {
  if (args.actor.status !== 'active') {
    throw new ProductActorAuthProfileError(
      'ACTOR_INACTIVE',
      `Actor is not active for ${args.action}.`,
    );
  }

  assertSessionUsable(args.session, args.now);

  const policy = REGISTRATION_POLICY_RULES[args.action];
  if (SESSION_RANK[args.session.sessionType] < SESSION_RANK[policy.requiredSessionType]) {
    throw new ProductActorAuthProfileError(
      'SESSION_TYPE_INSUFFICIENT',
      `Session type is insufficient for ${args.action}.`,
    );
  }

  if (TRUST_RANK[args.trust.level] < TRUST_RANK[policy.requiredTrustLevel]) {
    throw new ProductActorAuthProfileError(
      'IDENTITY_TRUST_INSUFFICIENT',
      `Identity trust is insufficient for ${args.action}.`,
    );
  }
}

export function assertOwnershipPreserved(bundle: OwnershipBundle) {
  for (const order of bundle.orders) {
    if (order.actorId !== bundle.actor.id) {
      throw new ProductActorAuthProfileError(
        'ORDER_OWNER_MISMATCH',
        'Order owner does not match actor.',
      );
    }
  }

  for (const payment of bundle.payments) {
    if (payment.actorId !== bundle.actor.id) {
      throw new ProductActorAuthProfileError(
        'PAYMENT_OWNER_MISMATCH',
        'Payment owner does not match actor.',
      );
    }
  }

  for (const entitlement of bundle.entitlements) {
    if (entitlement.actorId !== bundle.actor.id) {
      throw new ProductActorAuthProfileError(
        'ENTITLEMENT_OWNER_MISMATCH',
        'Entitlement owner does not match actor.',
      );
    }
  }

  for (const accessGrant of bundle.accessGrants) {
    if (accessGrant.actorId !== bundle.actor.id) {
      throw new ProductActorAuthProfileError(
        'ACCESS_GRANT_OWNER_MISMATCH',
        'Access grant owner does not match actor.',
      );
    }
  }
}
