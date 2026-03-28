import { hashRequest } from './test_stubs/idempotency';

import type {
  AccessGrant,
  Actor,
  Entitlement,
} from './product_domain_anchors';

export type AuthType = 'anonymous' | 'phone' | 'email' | 'external_provider';
export type AuthStatus = 'provisional' | 'active' | 'blocked';

export type AuthAccount = {
  id: string;
  actorId: string;
  authType: AuthType;
  status: AuthStatus;
  loginRef: string;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ActorProfile = {
  id: string;
  actorId: string;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationMode = 'anonymous_allowed' | 'registered_required';
export type ActorAction =
  | 'checkout_payment_intent'
  | 'checkout_payment_confirm'
  | 'entitlement_activation'
  | 'access_use';

export type ActorOwnershipBundle = {
  actor: Actor;
  orders: Array<{ actorId: string; orderId: string }>;
  payments: Array<{ actorId: string; paymentId: string }>;
  entitlements: Entitlement[];
  accessGrants: AccessGrant[];
};

export class ProductActorAuthProfileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProductActorAuthProfileError';
    this.code = code;
  }
}

type ResolveDeps = {
  loadActorByBuyerRef: (buyerRef: string) => Promise<Actor | null>;
  persistActor: (actor: Actor) => Promise<Actor>;
  loadAuthAccount: (
    actorId: string,
    authType: AuthType,
    loginRef: string,
  ) => Promise<AuthAccount | null>;
  persistAuthAccount: (account: AuthAccount) => Promise<AuthAccount>;
  loadActorProfile: (actorId: string) => Promise<ActorProfile | null>;
  persistActorProfile: (profile: ActorProfile) => Promise<ActorProfile>;
  now: () => Date;
};

export const ACTOR_AUTH_PROFILE_BOUNDARY = {
  actor: 'product_subject_and_owner_truth',
  authAccount: 'authentication_and_registration_boundary',
  actorProfile: 'descriptive_profile_boundary',
} as const;

export const REGISTRATION_MODE_MODEL = {
  anonymous_allowed: {
    actorRequired: true,
    activeAuthRequired: false,
  },
  registered_required: {
    actorRequired: true,
    activeAuthRequired: true,
  },
} as const;

export const FUTURE_SPECIALIZATION_ATTACH_POINTS = {
  anonymous_user: 'Actor + AuthAccount(authType=anonymous,status=provisional)',
  mandatory_registration_user: 'Actor + AuthAccount(status=active)',
  Client: 'Actor + ActorProfile or future ClientProfile',
  Resident: 'Actor + future ResidentProfile',
  Operator: 'Actor(kind=operator) + future OperatorProfile',
  Guard: 'Actor(kind=guard) + future GuardProfile',
  richer_customer_profile_fields: 'ActorProfile.metadata or future specialization profiles',
} as const;

function isoNow(now: Date) {
  return now.toISOString();
}

function buildAuthAccountId(actorId: string, authType: AuthType, loginRef: string) {
  return `auth_${hashRequest({ actorId, authType, loginRef }).slice(0, 24)}`;
}

function buildActorProfileId(actorId: string) {
  return `prof_${hashRequest({ actorId }).slice(0, 24)}`;
}

function normalizeLoginRef(authType: AuthType, loginRef?: string | null) {
  if (authType === 'anonymous') {
    return loginRef?.trim() || `anon:${hashRequest({ authType }).slice(0, 12)}`;
  }

  const normalized = loginRef?.trim();
  if (!normalized) {
    throw new ProductActorAuthProfileError(
      'LOGIN_REF_REQUIRED',
      'Auth account loginRef is required for non-anonymous auth.',
    );
  }

  return normalized.toLowerCase();
}

function buildAuthAccount(args: {
  actorId: string;
  authType: AuthType;
  status: AuthStatus;
  loginRef?: string | null;
  existing: AuthAccount | null;
  verifiedAt?: string | null;
  now: Date;
}): AuthAccount {
  const normalizedLoginRef = normalizeLoginRef(args.authType, args.loginRef);
  const createdAt = args.existing?.createdAt ?? isoNow(args.now);

  return {
    id:
      args.existing?.id ??
      buildAuthAccountId(args.actorId, args.authType, normalizedLoginRef),
    actorId: args.actorId,
    authType: args.authType,
    status: args.status,
    loginRef: normalizedLoginRef,
    verifiedAt:
      args.status === 'active'
        ? args.verifiedAt ?? args.existing?.verifiedAt ?? isoNow(args.now)
        : args.existing?.verifiedAt ?? null,
    createdAt,
    updatedAt: isoNow(args.now),
  };
}

function buildActorProfile(args: {
  actorId: string;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
  metadata?: Record<string, unknown>;
  existing: ActorProfile | null;
  now: Date;
}): ActorProfile {
  const createdAt = args.existing?.createdAt ?? isoNow(args.now);

  return {
    id: args.existing?.id ?? buildActorProfileId(args.actorId),
    actorId: args.actorId,
    displayName: args.displayName ?? args.existing?.displayName ?? null,
    phone: args.phone ?? args.existing?.phone ?? null,
    email: args.email ?? args.existing?.email ?? null,
    metadata: {
      ...(args.existing?.metadata ?? {}),
      ...(args.metadata ?? {}),
    },
    createdAt,
    updatedAt: isoNow(args.now),
  };
}

export function createResolveActorAuthProfileCommand(deps: ResolveDeps) {
  return async function resolveActorAuthProfile(args: {
    buyerRef: string;
    actorKind?: Actor['kind'];
    authType: AuthType;
    authStatus: AuthStatus;
    loginRef?: string | null;
    displayName?: string | null;
    phone?: string | null;
    email?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{
    actor: Actor;
    authAccount: AuthAccount;
    profile: ActorProfile;
  }> {
    const now = deps.now();
    const existingActor = await deps.loadActorByBuyerRef(args.buyerRef);
    const actor: Actor = existingActor
      ? {
          ...existingActor,
          kind: args.actorKind ?? existingActor.kind,
          updatedAt: isoNow(now),
        }
      : {
          id: `act_${hashRequest({ buyerRef: args.buyerRef }).slice(0, 24)}`,
          kind: args.actorKind ?? 'customer',
          status: 'active',
          buyerRef: args.buyerRef,
          createdAt: isoNow(now),
          updatedAt: isoNow(now),
        };

    const persistedActor = await deps.persistActor(actor);
    const loginRef = normalizeLoginRef(args.authType, args.loginRef);
    const existingAuth = await deps.loadAuthAccount(
      persistedActor.id,
      args.authType,
      loginRef,
    );
    const authAccount = await deps.persistAuthAccount(
      buildAuthAccount({
        actorId: persistedActor.id,
        authType: args.authType,
        status: args.authStatus,
        loginRef,
        existing: existingAuth,
        now,
      }),
    );
    const existingProfile = await deps.loadActorProfile(persistedActor.id);
    const profile = await deps.persistActorProfile(
      buildActorProfile({
        actorId: persistedActor.id,
        displayName: args.displayName,
        phone: args.phone,
        email: args.email,
        metadata: args.metadata,
        existing: existingProfile,
        now,
      }),
    );

    return {
      actor: persistedActor,
      authAccount,
      profile,
    };
  };
}

export function assertActorCanPerformAction(args: {
  mode: RegistrationMode;
  actor: Actor;
  authAccount: AuthAccount | null;
  action: ActorAction;
}) {
  if (args.actor.status !== 'active') {
    throw new ProductActorAuthProfileError(
      'ACTOR_INACTIVE',
      `Actor is not active for ${args.action}.`,
    );
  }

  if (
    REGISTRATION_MODE_MODEL[args.mode].activeAuthRequired &&
    (!args.authAccount || args.authAccount.status !== 'active')
  ) {
    throw new ProductActorAuthProfileError(
      'REGISTRATION_REQUIRED',
      `Active registration is required for ${args.action}.`,
    );
  }

  if (args.authAccount?.status === 'blocked') {
    throw new ProductActorAuthProfileError(
      'AUTH_ACCOUNT_BLOCKED',
      `Blocked auth account cannot perform ${args.action}.`,
    );
  }
}

export function assertActorOwnsBundle(bundle: ActorOwnershipBundle) {
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
