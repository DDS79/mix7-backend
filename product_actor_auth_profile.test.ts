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
  ACTOR_AUTH_PROFILE_BOUNDARY,
  CANONICAL_ACCOUNT_DOMAIN_MODEL,
  FUTURE_SPECIALIZATION_ATTACH_POINTS,
  assertActorCanPerformAction,
  assertActorOwnsBundle,
  createResolveActorAuthProfileCommand,
  type ActorProfile,
  type AuthAccount,
} from './product_actor_auth_profile';

function buildOrder(
  overrides: Partial<CommercialOrderRecord> = {},
): CommercialOrderRecord {
  return {
    id: 'ord_123',
    buyerId: '33333333-3333-4333-8333-333333333333',
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
    buyerId: '33333333-3333-4333-8333-333333333333',
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

  return {
    actors,
    authAccounts,
    profiles,
    entitlements,
    accessPolicies,
    accessGrants,
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
  };
}

describe('actor/auth/profile boundary', () => {
  it('actor remains authoritative owner for order/payment/entitlement linkage', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const syncAnchors = createSyncProductAnchorsFromPaymentCommand(store.anchorDeps);

    const identity = await resolve({
      buyerRef: '33333333-3333-4333-8333-333333333333',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-checkout-1',
    });
    const anchored = await syncAnchors({
      order: buildOrder(),
      payment: buildPayment(),
    });

    expect(anchored.actor.id).toBe(identity.actor.id);
    expect(() =>
      assertActorOwnsBundle({
        actor: identity.actor,
        orders: [{ actorId: identity.actor.id, orderId: 'ord_123' }],
        payments: [{ actorId: identity.actor.id, paymentId: 'pay_123' }],
        entitlements: [anchored.entitlement],
        accessGrants: [anchored.accessGrant],
      }),
    ).not.toThrow();
  });

  it('auth account can be provisional or active without breaking ownership', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);

    const provisional = await resolve({
      buyerRef: 'buyer-1',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-1',
    });
    const active = await resolve({
      buyerRef: 'buyer-1',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'user@example.com',
      email: 'user@example.com',
    });

    expect(provisional.actor.id).toBe(active.actor.id);
    expect(provisional.authAccount.status).toBe('provisional');
    expect(active.authAccount.status).toBe('active');
  });

  it('profile growth does not affect payment correctness ownership', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);

    const first = await resolve({
      buyerRef: 'buyer-2',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'buyer2@example.com',
    });
    const second = await resolve({
      buyerRef: 'buyer-2',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'buyer2@example.com',
      displayName: 'Buyer Two',
      phone: '+123456789',
      metadata: { locale: 'en' },
    });

    expect(first.actor.id).toBe(second.actor.id);
    expect(second.profile.displayName).toBe('Buyer Two');
    expect(second.profile.metadata).toEqual({ locale: 'en' });
  });

  it('anonymous provisional flow works deterministically', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);

    const first = await resolve({
      buyerRef: 'buyer-3',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-3',
    });
    const second = await resolve({
      buyerRef: 'buyer-3',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-3',
    });

    expect(first.actor.id).toBe(second.actor.id);
    expect(first.authAccount.id).toBe(second.authAccount.id);
  });

  it('mandatory registration flow can be enforced deterministically', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const provisional = await resolve({
      buyerRef: 'buyer-4',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-4',
    });

    let thrown: unknown;
    try {
      assertActorCanPerformAction({
        mode: 'registered_required',
        actor: provisional.actor,
        authAccount: provisional.authAccount,
        action: 'access_use',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      code: 'REGISTRATION_REQUIRED',
    });

    expect(() =>
      assertActorCanPerformAction({
        mode: 'anonymous_allowed',
        actor: provisional.actor,
        authAccount: provisional.authAccount,
        action: 'checkout_payment_intent',
      }),
    ).not.toThrow();
  });

  it('guest-to-registered upgrade does not duplicate or reassign ownership', async () => {
    const store = createMemoryStore();
    const resolve = createResolveActorAuthProfileCommand(store.actorDeps);
    const syncAnchors = createSyncProductAnchorsFromPaymentCommand(store.anchorDeps);

    const guest = await resolve({
      buyerRef: 'buyer-5',
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: 'guest-5',
    });
    const anchoredBefore = await syncAnchors({
      order: buildOrder({ buyerId: 'buyer-5' }),
      payment: buildPayment({ buyerId: 'buyer-5' }),
    });
    const registered = await resolve({
      buyerRef: 'buyer-5',
      authType: 'email',
      authStatus: 'active',
      loginRef: 'buyer5@example.com',
      email: 'buyer5@example.com',
      displayName: 'Buyer Five',
    });
    const anchoredAfter = await syncAnchors({
      order: buildOrder({ buyerId: 'buyer-5' }),
      payment: buildPayment({ buyerId: 'buyer-5' }),
    });

    expect(guest.actor.id).toBe(registered.actor.id);
    expect(anchoredBefore.actor.id).toBe(anchoredAfter.actor.id);
    expect(anchoredBefore.entitlement.id).toBe(anchoredAfter.entitlement.id);
  });

  it('future specialization attach points are explicit and stable', () => {
    expect(ACTOR_AUTH_PROFILE_BOUNDARY.actor).toBe(
      'product_subject_and_owner_truth',
    );
    expect(CANONICAL_ACCOUNT_DOMAIN_MODEL.canonicalAccountRoot).toBe('Actor');
    expect(CANONICAL_ACCOUNT_DOMAIN_MODEL.linkedIdentityLayer).toBe('AuthAccount');
    expect(CANONICAL_ACCOUNT_DOMAIN_MODEL.telegramRole).toBe(
      'external_provider_auth_account_only',
    );
    expect(CANONICAL_ACCOUNT_DOMAIN_MODEL.actorOwnedSurfaces).toEqual(
      expect.arrayContaining(['registrations', 'tickets', 'payments']),
    );
    expect(FUTURE_SPECIALIZATION_ATTACH_POINTS.Client).toContain('Actor');
    expect(FUTURE_SPECIALIZATION_ATTACH_POINTS.Resident).toContain('Actor');
    expect(FUTURE_SPECIALIZATION_ATTACH_POINTS.Guard).toContain('Actor');
    expect(FUTURE_SPECIALIZATION_ATTACH_POINTS.richer_customer_profile_fields).toContain(
      'ActorProfile',
    );
  });
});
