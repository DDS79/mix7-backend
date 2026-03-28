import type { PaymentRecord } from '@/modules/checkout/payment_confirm';
import {
  createSyncProductAnchorsFromPaymentCommand,
  type AccessGrant,
  type AccessPolicy,
  type Actor,
  type CommercialOrderRecord,
  type Entitlement,
} from './product_domain_anchors';
import {
  createResolveActorAuthProfileCommand,
  type ActorProfile,
  type AuthAccount,
} from './product_actor_auth_profile';
import {
  AUTH_SESSION_TRUST_FUTURE_MAPPING,
  REGISTRATION_POLICY_RULES,
  SESSION_OBSERVABILITY_FIELDS,
  SESSION_STRATEGY_DECISION,
  assertActionAllowedByRegistrationPolicy,
  assertOwnershipPreserved,
  assertSessionUsable,
  createExpireSessionIfNeededCommand,
  createEstablishIdentityTrustCommand,
  createIssueAuthSessionCommand,
  createResolveRuntimeActorContextCommand,
  createRevokeSessionCommand,
  createValidateSessionCommand,
  type AuthSession,
  type IdentityTrust,
} from './product_auth_session_identity_trust';

function buildOrder(
  overrides: Partial<CommercialOrderRecord> = {},
): CommercialOrderRecord {
  return {
    id: 'ord_123',
    buyerId: 'buyer-actor-1',
    eventId: 'evt_123',
    totalMinor: 3000,
    status: 'paid',
    ...overrides,
  };
}

function buildPayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay_123',
    orderId: 'ord_123',
    buyerId: 'buyer-actor-1',
    eventId: 'evt_123',
    amount: 3000,
    currency: 'USD',
    paymentMethod: 'card',
    provider: 'stub',
    status: 'succeeded',
    intentId: 'pi_123456789012345678901234',
    providerPaymentId: 'pp_123456789012345678901234',
    providerStatus: 'succeeded',
    lastProviderEventId: 'prov_evt_1',
    version: 2,
    lastAppliedEventId: 'prov_evt_1',
    lastAppliedEventSequence: 2,
    reconciliationState: 'idle',
    ...overrides,
  };
}

function createMemoryStore() {
  const actors = new Map<string, Actor>();
  const authAccounts = new Map<string, AuthAccount>();
  const profiles = new Map<string, ActorProfile>();
  const entitlements = new Map<string, Entitlement>();
  const accessPolicies = new Map<string, AccessPolicy>();
  const accessGrants = new Map<string, AccessGrant>();
  const sessions = new Map<string, AuthSession>();
  const trusts = new Map<string, IdentityTrust>();

  return {
    actors,
    authAccounts,
    profiles,
    entitlements,
    accessPolicies,
    accessGrants,
    sessions,
    trusts,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    actorDeps: {
      loadActorByBuyerRef: async (buyerRef: string) => {
        for (const actor of actors.values()) {
          if (actor.buyerRef === buyerRef) {
            return actor;
          }
        }
        return null;
      },
      persistActor: async (actor: Actor) => {
        actors.set(actor.id, actor);
        return actor;
      },
      loadAuthAccount: async (
        actorId: string,
        authType: AuthAccount['authType'],
        loginRef: string,
      ) => {
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
      persistAuthAccount: async (account: AuthAccount) => {
        authAccounts.set(account.id, account);
        return account;
      },
      loadActorProfile: async (actorId: string) => {
        for (const profile of profiles.values()) {
          if (profile.actorId === actorId) {
            return profile;
          }
        }
        return null;
      },
      persistActorProfile: async (profile: ActorProfile) => {
        profiles.set(profile.id, profile);
        return profile;
      },
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    },
    anchorDeps: {
      loadActorByBuyerRef: async (buyerRef: string) => {
        for (const actor of actors.values()) {
          if (actor.buyerRef === buyerRef) {
            return actor;
          }
        }
        return null;
      },
      persistActor: async (actor: Actor) => {
        actors.set(actor.id, actor);
        return actor;
      },
      loadEntitlementByPaymentId: async (paymentId: string) => {
        for (const entitlement of entitlements.values()) {
          if (entitlement.paymentId === paymentId) {
            return entitlement;
          }
        }
        return null;
      },
      persistEntitlement: async (entitlement: Entitlement) => {
        entitlements.set(entitlement.id, entitlement);
        return entitlement;
      },
      loadAccessPolicy: async (kind: AccessPolicy['kind'], scopeRef: string) => {
        for (const policy of accessPolicies.values()) {
          if (policy.kind === kind && policy.scopeRef === scopeRef) {
            return policy;
          }
        }
        return null;
      },
      persistAccessPolicy: async (policy: AccessPolicy) => {
        accessPolicies.set(policy.id, policy);
        return policy;
      },
      loadAccessGrantByEntitlementId: async (entitlementId: string) => {
        for (const grant of accessGrants.values()) {
          if (grant.entitlementId === entitlementId) {
            return grant;
          }
        }
        return null;
      },
      persistAccessGrant: async (grant: AccessGrant) => {
        accessGrants.set(grant.id, grant);
        return grant;
      },
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    },
    sessionDeps: {
      persistSession: async (session: AuthSession) => {
        sessions.set(session.id, session);
        return session;
      },
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    },
    trustDeps: {
      persistTrust: async (trust: IdentityTrust) => {
        trusts.set(`${trust.actorId}:${trust.authAccountId ?? 'anon'}`, trust);
        return trust;
      },
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    },
    validationDeps: {
      loadActor: async (actorId: string) => actors.get(actorId) ?? null,
      loadAuthAccount: async (authAccountId: string | null) =>
        authAccountId ? authAccounts.get(authAccountId) ?? null : null,
      loadTrust: async (actorId: string, authAccountId: string | null) =>
        trusts.get(`${actorId}:${authAccountId ?? 'anon'}`) ?? null,
      persistSession: async (session: AuthSession) => {
        sessions.set(session.id, session);
        return session;
      },
      now: () => new Date('2026-01-01T00:00:00.000Z'),
    },
  };
}

describe('auth/session/identity trust boundary', () => {
  it('actor ownership remains stable regardless of auth/session changes', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const sync = createSyncProductAnchorsFromPaymentCommand(store.anchorDeps);
    const issueSession = createIssueAuthSessionCommand(store.sessionDeps);
    const establishTrust = createEstablishIdentityTrustCommand(store.trustDeps);

    const guest = await resolve({
      buyerRef: 'buyer-actor-1',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-actor-1',
    });
    const guestSession = await issueSession({
      actor: guest.actor,
      authAccount: guest.authAccount,
    });
    const guestTrust = await establishTrust({
      actor: guest.actor,
      authAccount: guest.authAccount,
    });
    const anchored = await sync({
      order: buildOrder(),
      payment: buildPayment(),
    });

    const registered = await resolve({
      buyerRef: 'buyer-actor-1',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'actor1@example.com',
      email: 'actor1@example.com',
    });
    const registeredSession = await issueSession({
      actor: registered.actor,
      authAccount: registered.authAccount,
    });
    const registeredTrust = await establishTrust({
      actor: registered.actor,
      authAccount: registered.authAccount,
      currentTrust: guestTrust,
      requestedLevel: 'active',
      source: 'registration',
    });

    expect(guest.actor.id).toBe(registered.actor.id);
    expect(guestSession.actorId).toBe(registeredSession.actorId);
    expect(registeredTrust.actorId).toBe(anchored.actor.id);
    expect(() =>
      assertOwnershipPreserved({
        actor: registered.actor,
        orders: [{ actorId: registered.actor.id, orderId: 'ord_123' }],
        payments: [{ actorId: registered.actor.id, paymentId: 'pay_123' }],
        entitlements: [anchored.entitlement],
        accessGrants: [anchored.accessGrant],
      }),
    ).not.toThrow();
  });

  it('anonymous/provisional session can perform only allowed low-risk actions', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const issueSession = createIssueAuthSessionCommand(store.sessionDeps);
    const establishTrust = createEstablishIdentityTrustCommand(store.trustDeps);

    const guest = await resolve({
      buyerRef: 'buyer-guest-1',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-1',
    });
    const session = await issueSession({
      actor: guest.actor,
      authAccount: guest.authAccount,
    });
    const trust = await establishTrust({
      actor: guest.actor,
      authAccount: guest.authAccount,
    });

    expect(() =>
      assertActionAllowedByRegistrationPolicy({
        action: 'checkout_payment_intent',
        actor: guest.actor,
        session,
        trust,
        now: store.now(),
      }),
    ).not.toThrow();

    expect(() =>
      assertActionAllowedByRegistrationPolicy({
        action: 'guarded_access_use',
        actor: guest.actor,
        session,
        trust,
        now: store.now(),
      }),
    ).toThrow('Session type is insufficient for guarded_access_use.');
  });

  it('mandatory higher-trust action is blocked without proper auth or trust', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const issueSession = createIssueAuthSessionCommand(store.sessionDeps);
    const establishTrust = createEstablishIdentityTrustCommand(store.trustDeps);

    const active = await resolve({
      buyerRef: 'buyer-active-1',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'active@example.com',
      email: 'active@example.com',
    });
    const session = await issueSession({
      actor: active.actor,
      authAccount: active.authAccount,
    });
    const trust = await establishTrust({
      actor: active.actor,
      authAccount: active.authAccount,
      requestedLevel: 'active',
      source: 'registration',
    });

    expect(() =>
      assertActionAllowedByRegistrationPolicy({
        action: 'guarded_access_use',
        actor: active.actor,
        session,
        trust,
        now: store.now(),
      }),
    ).toThrow('Identity trust is insufficient for guarded_access_use.');
  });

  it('guest-to-registered upgrade preserves same actor and ownership', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const sync = createSyncProductAnchorsFromPaymentCommand(store.anchorDeps);

    const guest = await resolve({
      buyerRef: 'buyer-upgrade-1',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-upgrade-1',
    });
    const before = await sync({
      order: buildOrder({ buyerId: 'buyer-upgrade-1' }),
      payment: buildPayment({ buyerId: 'buyer-upgrade-1' }),
    });
    const registered = await resolve({
      buyerRef: 'buyer-upgrade-1',
      authType: 'phone',
      authStatus: 'active',
      loginRef: '+10000000001',
      phone: '+10000000001',
    });
    const after = await sync({
      order: buildOrder({ buyerId: 'buyer-upgrade-1' }),
      payment: buildPayment({ buyerId: 'buyer-upgrade-1' }),
    });

    expect(guest.actor.id).toBe(registered.actor.id);
    expect(before.entitlement.id).toBe(after.entitlement.id);
    expect(before.accessGrant.id).toBe(after.accessGrant.id);
  });

  it('auth session expiry and revocation semantics are explicit and deterministic', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const issueSession = createIssueAuthSessionCommand(store.sessionDeps);

    const registered = await resolve({
      buyerRef: 'buyer-session-1',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'session@example.com',
      email: 'session@example.com',
    });
    const expired = await issueSession({
      actor: registered.actor,
      authAccount: registered.authAccount,
      expiresInMs: 1,
    });

    expect(() =>
      assertSessionUsable(
        {
          ...expired,
          status: 'expired',
        },
        store.now(),
      ),
    ).toThrow('Session is expired.');

    expect(() =>
      assertSessionUsable(
        {
          ...expired,
          status: 'revoked',
          revokedAt: '2026-01-01T00:00:00.000Z',
        },
        store.now(),
      ),
    ).toThrow('Session is revoked.');
  });

  it('multiple sessions for the same actor do not break ownership semantics', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const sync = createSyncProductAnchorsFromPaymentCommand(store.anchorDeps);
    const issueSession = createIssueAuthSessionCommand(store.sessionDeps);

    const registered = await resolve({
      buyerRef: 'buyer-multi-session-1',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'multisession@example.com',
      email: 'multisession@example.com',
    });
    const firstSession = await issueSession({
      actor: registered.actor,
      authAccount: registered.authAccount,
      expiresInMs: 60_000,
    });
    const secondSession = await issueSession({
      actor: registered.actor,
      authAccount: registered.authAccount,
      sessionType: 'elevated',
      expiresInMs: 60_000,
    });
    const anchored = await sync({
      order: buildOrder({ buyerId: 'buyer-multi-session-1' }),
      payment: buildPayment({ buyerId: 'buyer-multi-session-1' }),
    });

    expect(firstSession.actorId).toBe(secondSession.actorId);
    expect(firstSession.sessionType).toBe('authenticated');
    expect(secondSession.sessionType).toBe('elevated');
    expect(() =>
      assertOwnershipPreserved({
        actor: registered.actor,
        orders: [{ actorId: registered.actor.id, orderId: anchored.entitlement.orderId }],
        payments: [{ actorId: registered.actor.id, paymentId: anchored.entitlement.paymentId }],
        entitlements: [anchored.entitlement],
        accessGrants: [anchored.accessGrant],
      }),
    ).not.toThrow();
  });

  it('stateful runtime validation resolves actor context deterministically', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const issueSession = createIssueAuthSessionCommand(store.sessionDeps);
    const establishTrust = createEstablishIdentityTrustCommand(store.trustDeps);
    const validateSession = createValidateSessionCommand(store.validationDeps);
    const resolveRuntimeActorContext = createResolveRuntimeActorContextCommand({
      validateSession,
    });

    const registered = await resolve({
      buyerRef: 'buyer-runtime-1',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'runtime@example.com',
      email: 'runtime@example.com',
    });
    const session = await issueSession({
      actor: registered.actor,
      authAccount: registered.authAccount,
      expiresInMs: 60_000,
    });
    await establishTrust({
      actor: registered.actor,
      authAccount: registered.authAccount,
      requestedLevel: 'active',
      source: 'registration',
    });

    const first = await resolveRuntimeActorContext({
      session,
      action: 'account_profile_update',
    });
    const second = await resolveRuntimeActorContext({
      session: store.sessions.get(session.id)!,
      action: 'account_profile_update',
    });

    expect(first.actor.id).toBe(second.actor.id);
    expect(first.session.id).toBe(second.session.id);
    expect(first.trust.level).toBe('active');
    expect(first.allowed).toBe(true);
  });

  it('revoked session is rejected deterministically by runtime validation', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const issueSession = createIssueAuthSessionCommand(store.sessionDeps);
    const revokeSession = createRevokeSessionCommand(store.sessionDeps);
    const validateSession = createValidateSessionCommand(store.validationDeps);

    const guest = await resolve({
      buyerRef: 'buyer-revoke-1',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-revoke-1',
    });
    const session = await issueSession({
      actor: guest.actor,
      authAccount: guest.authAccount,
      expiresInMs: 60_000,
    });
    const revoked = await revokeSession(session);

    await expect(
      validateSession({
        session: revoked,
        action: 'checkout_payment_intent',
      }),
    ).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
  });

  it('expired session is rejected deterministically by runtime validation', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const issueSession = createIssueAuthSessionCommand(store.sessionDeps);
    const expireSessionIfNeeded = createExpireSessionIfNeededCommand(store.sessionDeps);
    const validateSession = createValidateSessionCommand(store.validationDeps);

    const guest = await resolve({
      buyerRef: 'buyer-expire-1',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-expire-1',
    });
    const session = await issueSession({
      actor: guest.actor,
      authAccount: guest.authAccount,
      expiresInMs: 1,
    });
    const expired = await expireSessionIfNeeded({
      ...session,
      expiresAt: '2025-12-31T23:59:59.000Z',
    });

    await expect(
      validateSession({
        session: expired,
        action: 'checkout_payment_intent',
      }),
    ).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });

  it('trust progression is deterministic and monotonic', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const establishTrust = createEstablishIdentityTrustCommand(store.trustDeps);

    const registered = await resolve({
      buyerRef: 'buyer-trust-1',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'trust@example.com',
      email: 'trust@example.com',
    });

    const activeTrust = await establishTrust({
      actor: registered.actor,
      authAccount: registered.authAccount,
      requestedLevel: 'active',
      source: 'registration',
    });
    const verifiedTrust = await establishTrust({
      actor: registered.actor,
      authAccount: registered.authAccount,
      currentTrust: activeTrust,
      requestedLevel: 'verified',
      source: 'verification',
    });

    expect(activeTrust.level).toBe('active');
    expect(verifiedTrust.level).toBe('verified');

    await expect(
      establishTrust({
        actor: registered.actor,
        authAccount: registered.authAccount,
        currentTrust: verifiedTrust,
        requestedLevel: 'provisional',
        source: 'self_asserted',
      }),
    ).rejects.toMatchObject({
      code: 'TRUST_DOWNGRADE_NOT_ALLOWED',
    });
  });

  it('future multiple auth accounts can attach without breaking ownership', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);

    const emailIdentity = await resolve({
      buyerRef: 'buyer-multi-1',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'multi@example.com',
      email: 'multi@example.com',
    });
    const phoneIdentity = await resolve({
      buyerRef: 'buyer-multi-1',
      authType: 'phone',
      authStatus: 'active',
      loginRef: '+10000000002',
      phone: '+10000000002',
    });

    expect(emailIdentity.actor.id).toBe(phoneIdentity.actor.id);
    expect(emailIdentity.authAccount.id).not.toBe(phoneIdentity.authAccount.id);
  });

  it('future mapping and policy model stay explicit', () => {
    expect(REGISTRATION_POLICY_RULES.checkout_payment_intent.requiredTrustLevel).toBe(
      'anonymous',
    );
    expect(REGISTRATION_POLICY_RULES.guarded_access_use.requiredTrustLevel).toBe(
      'verified',
    );
    expect(AUTH_SESSION_TRUST_FUTURE_MAPPING.multiple_login_methods).toContain(
      'many AuthAccount rows per Actor',
    );
    expect(AUTH_SESSION_TRUST_FUTURE_MAPPING.verified_users).toContain(
      'IdentityTrust(level=verified)',
    );
    expect(SESSION_STRATEGY_DECISION.chosen).toBe('stateful');
    expect(SESSION_OBSERVABILITY_FIELDS).toEqual(
      expect.arrayContaining([
        'sessionId',
        'actorId',
        'authAccountId',
        'sessionType',
        'sessionStatus',
      ]),
    );
  });
});
