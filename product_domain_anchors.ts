import { hashRequest } from './test_stubs/idempotency';
import type { PaymentRecord } from './payment_confirm';

export type ActorKind =
  | 'customer'
  | 'operator'
  | 'guard'
  | 'resident_candidate';

export type ActorStatus = 'active' | 'disabled';

export type Actor = {
  id: string;
  kind: ActorKind;
  status: ActorStatus;
  buyerRef: string;
  createdAt: string;
  updatedAt: string;
};

export type CommercialOrderRecord = {
  id: string;
  buyerId: string;
  eventId: string;
  totalMinor: number;
  status: 'created' | 'pending_payment' | 'paid' | 'cancelled' | 'refunded' | 'failed';
};

export type EntitlementType = 'order_access';

export type EntitlementStatus = 'pending' | 'active' | 'expired' | 'revoked';

export type Entitlement = {
  id: string;
  actorId: string;
  orderId: string;
  paymentId: string;
  type: EntitlementType;
  status: EntitlementStatus;
  subjectRef: string | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccessPolicyKind = 'entitlement_access';

export type AccessPolicyStatus = 'active' | 'inactive';

export type AccessPolicy = {
  id: string;
  kind: AccessPolicyKind;
  status: AccessPolicyStatus;
  scopeRef: string;
  createdAt: string;
  updatedAt: string;
};

export type AccessGrantStatus = 'pending' | 'active' | 'expired' | 'revoked';

export type AccessGrant = {
  id: string;
  entitlementId: string;
  actorId: string;
  policyId: string;
  status: AccessGrantStatus;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductAnchorSyncResult = {
  actor: Actor;
  entitlement: Entitlement;
  accessPolicy: AccessPolicy;
  accessGrant: AccessGrant;
};

export class ProductDomainAnchorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProductDomainAnchorError';
    this.code = code;
  }
}

type SyncDeps = {
  loadActorByBuyerRef: (buyerRef: string) => Promise<Actor | null>;
  persistActor: (actor: Actor) => Promise<Actor>;
  loadEntitlementByPaymentId: (paymentId: string) => Promise<Entitlement | null>;
  persistEntitlement: (entitlement: Entitlement) => Promise<Entitlement>;
  loadAccessPolicy: (
    kind: AccessPolicyKind,
    scopeRef: string,
  ) => Promise<AccessPolicy | null>;
  persistAccessPolicy: (policy: AccessPolicy) => Promise<AccessPolicy>;
  loadAccessGrantByEntitlementId: (
    entitlementId: string,
  ) => Promise<AccessGrant | null>;
  persistAccessGrant: (grant: AccessGrant) => Promise<AccessGrant>;
  now: () => Date;
};

export const DOMAIN_TRUTH_HIERARCHY = {
  actor: 'identity_and_ownership_truth',
  order: 'commercial_truth',
  payment: 'financial_truth',
  entitlement: 'product_truth',
  accessGrant: 'operational_access_truth',
} as const;

export const FUTURE_ENTITY_ATTACH_POINTS = {
  Resident: 'Actor',
  Client: 'Actor',
  Ticket: 'Entitlement',
  Pass: 'Entitlement',
  Guard: 'Actor',
  Zone: 'AccessPolicy.scopeRef',
  Visit: 'AccessGrant',
  Session: 'AccessGrant',
  AccessDecision: 'AccessGrant',
} as const;

function isoNow(now: Date) {
  return now.toISOString();
}

function buildActorId(buyerRef: string) {
  return `act_${hashRequest({ buyerRef }).slice(0, 24)}`;
}

function buildEntitlementId(paymentId: string) {
  return `ent_${hashRequest({ paymentId }).slice(0, 24)}`;
}

function buildAccessPolicyId(kind: AccessPolicyKind, scopeRef: string) {
  return `apol_${hashRequest({ kind, scopeRef }).slice(0, 24)}`;
}

function buildAccessGrantId(entitlementId: string) {
  return `agr_${hashRequest({ entitlementId }).slice(0, 24)}`;
}

function deriveAccessScopeRef(order: CommercialOrderRecord) {
  return `event:${order.eventId}`;
}

export function deriveEntitlementStatus(args: {
  payment: PaymentRecord;
  order: CommercialOrderRecord;
  now?: Date;
  current?: Entitlement | null;
}): EntitlementStatus {
  const { payment, order, now, current } = args;

  if (current?.validTo && now && current.validTo <= now.toISOString()) {
    return 'expired';
  }

  if (
    order.status === 'cancelled' ||
    order.status === 'refunded' ||
    order.status === 'failed' ||
    payment.status === 'failed' ||
    payment.status === 'reconciliation_failed'
  ) {
    return 'revoked';
  }

  if (payment.status === 'succeeded') {
    return 'active';
  }

  return 'pending';
}

export function deriveAccessGrantStatus(
  entitlement: Pick<Entitlement, 'status' | 'validTo'>,
  now?: Date,
): AccessGrantStatus {
  if (entitlement.status === 'revoked') {
    return 'revoked';
  }

  if (entitlement.validTo && now && entitlement.validTo <= now.toISOString()) {
    return 'expired';
  }

  if (entitlement.status === 'active') {
    return 'active';
  }

  if (entitlement.status === 'pending') {
    return 'pending';
  }

  return 'expired';
}

function ensureOwnershipAlignment(
  actor: Pick<Actor, 'buyerRef'>,
  order: CommercialOrderRecord,
  payment: PaymentRecord,
) {
  if (order.buyerId !== payment.buyerId) {
    throw new ProductDomainAnchorError(
      'ORDER_PAYMENT_OWNER_MISMATCH',
      'Order and payment do not share the same owner reference.',
    );
  }

  if (actor.buyerRef !== order.buyerId) {
    throw new ProductDomainAnchorError(
      'ACTOR_OWNERSHIP_MISMATCH',
      'Actor does not own the order and payment records.',
    );
  }
}

function buildActor(
  buyerRef: string,
  now: Date,
  existing: Actor | null,
): Actor {
  if (existing) {
    return {
      ...existing,
      buyerRef,
      updatedAt: isoNow(now),
    };
  }

  const createdAt = isoNow(now);
  return {
    id: buildActorId(buyerRef),
    kind: 'customer',
    status: 'active',
    buyerRef,
    createdAt,
    updatedAt: createdAt,
  };
}

function buildEntitlement(args: {
  actor: Actor;
  order: CommercialOrderRecord;
  payment: PaymentRecord;
  existing: Entitlement | null;
  now: Date;
}): Entitlement {
  const { actor, order, payment, existing, now } = args;
  const status = deriveEntitlementStatus({
    payment,
    order,
    now,
    current: existing,
  });
  const createdAt = existing?.createdAt ?? isoNow(now);
  const validFrom =
    status === 'active'
      ? existing?.validFrom ?? isoNow(now)
      : existing?.validFrom ?? null;
  const validTo =
    status === 'revoked' || status === 'expired'
      ? existing?.validTo ?? isoNow(now)
      : existing?.validTo ?? null;

  return {
    id: existing?.id ?? buildEntitlementId(payment.id),
    actorId: actor.id,
    orderId: order.id,
    paymentId: payment.id,
    type: 'order_access',
    status,
    subjectRef: deriveAccessScopeRef(order),
    validFrom,
    validTo,
    createdAt,
    updatedAt: isoNow(now),
  };
}

function buildAccessPolicy(
  order: CommercialOrderRecord,
  now: Date,
  existing: AccessPolicy | null,
): AccessPolicy {
  const scopeRef = deriveAccessScopeRef(order);
  const createdAt = existing?.createdAt ?? isoNow(now);

  return {
    id: existing?.id ?? buildAccessPolicyId('entitlement_access', scopeRef),
    kind: 'entitlement_access',
    status: 'active',
    scopeRef,
    createdAt,
    updatedAt: isoNow(now),
  };
}

export function deriveAccessGrantFromEntitlement(args: {
  entitlement: Entitlement;
  actor: Actor;
  policy: AccessPolicy;
  existing: AccessGrant | null;
  now: Date;
}): AccessGrant {
  const { entitlement, actor, policy, existing, now } = args;
  const createdAt = existing?.createdAt ?? isoNow(now);

  return {
    id: existing?.id ?? buildAccessGrantId(entitlement.id),
    entitlementId: entitlement.id,
    actorId: actor.id,
    policyId: policy.id,
    status: deriveAccessGrantStatus(entitlement, now),
    validFrom: entitlement.validFrom,
    validTo: entitlement.validTo,
    createdAt,
    updatedAt: isoNow(now),
  };
}

export function createSyncProductAnchorsFromPaymentCommand(deps: SyncDeps) {
  return async function syncProductAnchorsFromPayment(args: {
    order: CommercialOrderRecord;
    payment: PaymentRecord;
  }): Promise<ProductAnchorSyncResult> {
    const now = deps.now();
    const existingActor = await deps.loadActorByBuyerRef(args.order.buyerId);
    const actor = buildActor(args.order.buyerId, now, existingActor);

    ensureOwnershipAlignment(actor, args.order, args.payment);

    const persistedActor = await deps.persistActor(actor);
    const existingEntitlement = await deps.loadEntitlementByPaymentId(args.payment.id);

    if (
      existingEntitlement &&
      (existingEntitlement.orderId !== args.order.id ||
        existingEntitlement.actorId !== persistedActor.id)
    ) {
      throw new ProductDomainAnchorError(
        'ENTITLEMENT_OWNERSHIP_MISMATCH',
        'Existing entitlement is bound to a different order or actor.',
      );
    }

    const entitlement = buildEntitlement({
      actor: persistedActor,
      order: args.order,
      payment: args.payment,
      existing: existingEntitlement,
      now,
    });
    const persistedEntitlement = await deps.persistEntitlement(entitlement);

    const existingPolicy = await deps.loadAccessPolicy(
      'entitlement_access',
      deriveAccessScopeRef(args.order),
    );
    const policy = buildAccessPolicy(args.order, now, existingPolicy);
    const persistedPolicy = await deps.persistAccessPolicy(policy);

    const existingGrant = await deps.loadAccessGrantByEntitlementId(
      persistedEntitlement.id,
    );
    const accessGrant = deriveAccessGrantFromEntitlement({
      entitlement: persistedEntitlement,
      actor: persistedActor,
      policy: persistedPolicy,
      existing: existingGrant,
      now,
    });
    const persistedGrant = await deps.persistAccessGrant(accessGrant);

    return {
      actor: persistedActor,
      entitlement: persistedEntitlement,
      accessPolicy: persistedPolicy,
      accessGrant: persistedGrant,
    };
  };
}
