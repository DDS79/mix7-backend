import type { PaymentRecord } from '@/modules/checkout/payment_confirm';
import {
  createSyncProductAnchorsFromPaymentCommand,
  deriveAccessGrantFromEntitlement,
  DOMAIN_TRUTH_HIERARCHY,
  FUTURE_ENTITY_ATTACH_POINTS,
  type AccessGrant,
  type AccessPolicy,
  type Actor,
  type CommercialOrderRecord,
  type Entitlement,
} from './product_domain_anchors';

function buildOrder(
  overrides: Partial<CommercialOrderRecord> = {},
): CommercialOrderRecord {
  return {
    id: 'ord_123',
    buyerId: '33333333-3333-4333-8333-333333333333',
    eventId: 'evt_123',
    totalMinor: 3000,
    status: 'pending_payment',
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
    status: 'pending',
    intentId: 'pi_123456789012345678901234',
    providerPaymentId: 'pp_123456789012345678901234',
    providerStatus: 'requires_action',
    lastProviderEventId: null,
    version: 0,
    lastAppliedEventId: null,
    lastAppliedEventSequence: null,
    reconciliationState: 'idle',
    ...overrides,
  };
}

function createMemoryStore() {
  const actors = new Map<string, Actor>();
  const entitlements = new Map<string, Entitlement>();
  const accessPolicies = new Map<string, AccessPolicy>();
  const accessGrants = new Map<string, AccessGrant>();

  return {
    actors,
    entitlements,
    accessPolicies,
    accessGrants,
    deps: {
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

describe('product domain anchors', () => {
  it('makes actor the authoritative owner for order and payment linkage', async () => {
    const store = createMemoryStore();
    const sync = createSyncProductAnchorsFromPaymentCommand(store.deps);

    const result = await sync({
      order: buildOrder(),
      payment: buildPayment(),
    });

    expect(result.actor.buyerRef).toBe('33333333-3333-4333-8333-333333333333');
    expect(result.entitlement.actorId).toBe(result.actor.id);
    expect(result.accessGrant.actorId).toBe(result.actor.id);
  });

  it('successful payment activates entitlement deterministically', async () => {
    const store = createMemoryStore();
    const sync = createSyncProductAnchorsFromPaymentCommand(store.deps);

    const result = await sync({
      order: buildOrder({ status: 'paid' }),
      payment: buildPayment({
        status: 'succeeded',
        providerStatus: 'succeeded',
        version: 2,
      }),
    });

    expect(result.entitlement.status).toBe('active');
    expect(result.accessGrant.status).toBe('active');
    expect(result.entitlement.validFrom).toBe('2026-01-01T00:00:00.000Z');
  });

  it('failed payment does not create an active entitlement', async () => {
    const store = createMemoryStore();
    const sync = createSyncProductAnchorsFromPaymentCommand(store.deps);

    const result = await sync({
      order: buildOrder({ status: 'failed' }),
      payment: buildPayment({
        status: 'failed',
        providerStatus: 'failed',
        version: 1,
      }),
    });

    expect(result.entitlement.status).toBe('revoked');
    expect(result.accessGrant.status).toBe('revoked');
  });

  it('access grant derives from entitlement instead of payment directly', () => {
    const grant = deriveAccessGrantFromEntitlement({
      entitlement: {
        id: 'ent_1',
        actorId: 'act_1',
        orderId: 'ord_1',
        paymentId: 'pay_1',
        type: 'order_access',
        status: 'active',
        subjectRef: 'event:evt_1',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      actor: {
        id: 'act_1',
        kind: 'customer',
        status: 'active',
        buyerRef: 'buyer_1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      policy: {
        id: 'pol_1',
        kind: 'entitlement_access',
        status: 'active',
        scopeRef: 'event:evt_1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      existing: null,
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    expect(grant.entitlementId).toBe('ent_1');
    expect(grant.policyId).toBe('pol_1');
    expect(grant.status).toBe('active');
  });

  it('replaying the same successful payment does not duplicate entitlement or grant', async () => {
    const store = createMemoryStore();
    const sync = createSyncProductAnchorsFromPaymentCommand(store.deps);
    const args = {
      order: buildOrder({ status: 'paid' }),
      payment: buildPayment({
        status: 'succeeded',
        providerStatus: 'succeeded',
        version: 2,
      }),
    };

    const first = await sync(args);
    const second = await sync(args);

    expect(first.entitlement.id).toBe(second.entitlement.id);
    expect(first.accessGrant.id).toBe(second.accessGrant.id);
    expect(store.entitlements.size).toBe(1);
    expect(store.accessGrants.size).toBe(1);
  });

  it('refund and cancel semantics revoke active entitlement and access', async () => {
    const store = createMemoryStore();
    const sync = createSyncProductAnchorsFromPaymentCommand(store.deps);

    await sync({
      order: buildOrder({ status: 'paid' }),
      payment: buildPayment({
        status: 'succeeded',
        providerStatus: 'succeeded',
        version: 2,
      }),
    });

    const result = await sync({
      order: buildOrder({ status: 'refunded' }),
      payment: buildPayment({
        status: 'succeeded',
        providerStatus: 'succeeded',
        version: 2,
      }),
    });

    expect(result.entitlement.status).toBe('revoked');
    expect(result.accessGrant.status).toBe('revoked');
  });

  it('future attach points are explicit and preserve separation of concerns', () => {
    expect(DOMAIN_TRUTH_HIERARCHY.payment).toBe('financial_truth');
    expect(DOMAIN_TRUTH_HIERARCHY.entitlement).toBe('product_truth');
    expect(FUTURE_ENTITY_ATTACH_POINTS.Resident).toBe('Actor');
    expect(FUTURE_ENTITY_ATTACH_POINTS.Ticket).toBe('Entitlement');
    expect(FUTURE_ENTITY_ATTACH_POINTS.Zone).toBe('AccessPolicy.scopeRef');
    expect(FUTURE_ENTITY_ATTACH_POINTS.AccessDecision).toBe('AccessGrant');
  });
});
