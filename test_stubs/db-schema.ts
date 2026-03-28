export const idempotencyKeys = {
  key: 'key',
  scope: 'scope',
  requestHash: 'requestHash',
  responseCode: 'responseCode',
  responseBody: 'responseBody',
};

export const orders = {
  id: 'id',
  buyerId: 'buyerId',
  eventId: 'eventId',
  totalMinor: 'totalMinor',
  status: 'status',
  paymentProvider: 'paymentProvider',
};

export const payments = {
  id: 'id',
  orderId: 'orderId',
  buyerId: 'buyerId',
  eventId: 'eventId',
  amount: 'amount',
  currency: 'currency',
  paymentMethod: 'paymentMethod',
  provider: 'provider',
  status: 'status',
  intentId: 'intentId',
  providerPaymentId: 'providerPaymentId',
  providerStatus: 'providerStatus',
  lastProviderEventId: 'lastProviderEventId',
  version: 'version',
  lastAppliedEventId: 'lastAppliedEventId',
  lastAppliedEventSequence: 'lastAppliedEventSequence',
  reconciliationState: 'reconciliationState',
};

export const actors = {
  id: 'id',
  kind: 'kind',
  status: 'status',
  buyerRef: 'buyerRef',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export const authAccounts = {
  id: 'id',
  actorId: 'actorId',
  authType: 'authType',
  status: 'status',
  loginRef: 'loginRef',
  verifiedAt: 'verifiedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export const actorProfiles = {
  id: 'id',
  actorId: 'actorId',
  displayName: 'displayName',
  phone: 'phone',
  email: 'email',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export const authSessions = {
  id: 'id',
  actorId: 'actorId',
  authAccountId: 'authAccountId',
  sessionType: 'sessionType',
  status: 'status',
  issuedAt: 'issuedAt',
  expiresAt: 'expiresAt',
  revokedAt: 'revokedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export const identityTrust = {
  actorId: 'actorId',
  authAccountId: 'authAccountId',
  level: 'level',
  source: 'source',
  updatedAt: 'updatedAt',
};

export const entitlements = {
  id: 'id',
  actorId: 'actorId',
  orderId: 'orderId',
  paymentId: 'paymentId',
  type: 'type',
  status: 'status',
  subjectRef: 'subjectRef',
  validFrom: 'validFrom',
  validTo: 'validTo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export const accessPolicies = {
  id: 'id',
  kind: 'kind',
  status: 'status',
  scopeRef: 'scopeRef',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export const accessGrants = {
  id: 'id',
  entitlementId: 'entitlementId',
  actorId: 'actorId',
  policyId: 'policyId',
  status: 'status',
  validFrom: 'validFrom',
  validTo: 'validTo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};

export const paymentEvents = {
  id: 'id',
  paymentId: 'paymentId',
  type: 'type',
  payloadSnapshot: 'payloadSnapshot',
  providerEventId: 'providerEventId',
  providerSequence: 'providerSequence',
  processingStatus: 'processingStatus',
  providerStatus: 'providerStatus',
  createdAt: 'createdAt',
};

export const providerEventInbox = {
  id: 'id',
  providerEventId: 'providerEventId',
  providerPaymentId: 'providerPaymentId',
  providerSequence: 'providerSequence',
  payloadSnapshot: 'payloadSnapshot',
  processingStatus: 'processingStatus',
  retryCount: 'retryCount',
  nextRetryAt: 'nextRetryAt',
  lastError: 'lastError',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
};
