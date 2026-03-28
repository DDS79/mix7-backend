import {
  type PaymentRecord,
  type ProviderEvent,
  type ProviderEventResult,
  type ProviderSnapshot,
  type ReconcilePaymentResult,
} from './payment_confirm';

export type ProviderEventInboxStatus =
  | 'received'
  | 'processing'
  | 'applied'
  | 'failed'
  | 'dead_letter';

export type ProviderEventInboxRecord = {
  id: string;
  providerEventId: string;
  providerPaymentId: string;
  providerSequence: number;
  payloadSnapshot: Record<string, unknown>;
  processingStatus: ProviderEventInboxStatus;
  retryCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RetryDecision =
  | { kind: 'retryable'; nextRetryAt: string }
  | { kind: 'dead_letter'; reason: string };

export type ProviderAdapter = {
  verifyIncomingEvent(raw: unknown): ProviderEvent;
  normalizeProviderEvent(raw: unknown): ProviderEvent;
  fetchProviderPaymentSnapshot(
    payment: PaymentRecord,
  ): Promise<ProviderSnapshot>;
};

export type FeatureGateMode = 'ingest_only' | 'apply';

export type MetricsSink = {
  increment: (name: string, tags?: Record<string, string | number>) => void;
};

export type StructuredLogSink = {
  emit: (entry: Record<string, unknown>) => void;
};

type IngestDeps = {
  adapter: ProviderAdapter;
  persistInboxEvent: (
    event: ProviderEvent,
    payloadSnapshot: Record<string, unknown>,
  ) => Promise<{ record: ProviderEventInboxRecord; duplicate: boolean }>;
  metrics: MetricsSink;
  logs: StructuredLogSink;
  now: () => Date;
};

type ProcessDeps = {
  loadInboxEvent: (eventId: string) => Promise<ProviderEventInboxRecord | null>;
  markProcessing: (eventId: string) => Promise<ProviderEventInboxRecord>;
  markApplied: (
    eventId: string,
    details?: Partial<ProviderEventInboxRecord>,
  ) => Promise<ProviderEventInboxRecord>;
  markFailed: (
    eventId: string,
    details: Partial<ProviderEventInboxRecord>,
  ) => Promise<ProviderEventInboxRecord>;
  applyDomainEvent: (event: ProviderEvent) => Promise<ProviderEventResult>;
  classifyFailure: (error: unknown, record: ProviderEventInboxRecord) => RetryDecision;
  metrics: MetricsSink;
  logs: StructuredLogSink;
};

type RetrySweepDeps = {
  loadRetryableEvents: (asOfIso: string) => Promise<ProviderEventInboxRecord[]>;
  processProviderInboxEvent: (
    eventId: string,
  ) => Promise<ProviderEventInboxRecord>;
  metrics: MetricsSink;
  now: () => Date;
};

type ReprocessDeps = {
  loadInboxEvent: (eventId: string) => Promise<ProviderEventInboxRecord | null>;
  resetForReprocess: (eventId: string) => Promise<void>;
  processProviderInboxEvent: (
    eventId: string,
  ) => Promise<ProviderEventInboxRecord>;
};

type ReconciliationRunnerDeps = {
  reconcilePayments: () => Promise<ReconcilePaymentResult[]>;
  metrics: MetricsSink;
  logs: StructuredLogSink;
};

export const PROVIDER_EVENT_RETRY_POLICY = {
  maxRetryCount: 3,
  retryBackoffMs: [60_000, 300_000, 1_800_000],
} as const;

export const PAYMENT_OPERATIONAL_ALERT_THRESHOLDS = {
  deadLettersGreaterThan: 0,
  retryStormCount: 5,
  reconciliationMismatchBacklog: 1,
  projectionRepairSpike: 3,
  unresolvedPendingMinutes: 15,
} as const;

export const PAYMENT_OPERATIONAL_METRICS = [
  'provider_events_received',
  'provider_events_applied',
  'provider_events_duplicate',
  'provider_events_stale_or_pending',
  'provider_event_retries',
  'provider_event_dead_letters',
  'reconciliation_fixes',
  'projection_repairs',
] as const;

export const PROVIDER_ADAPTER_CONTRACT = {
  requiredFields: [
    'providerEventId',
    'providerPaymentId',
    'providerSequence',
    'providerStatus',
    'paymentIntentId',
  ],
  orderingAuthority: 'providerSequence',
  duplicateHandling: 'providerEventId_deduped',
  missingEventRecovery: 'fetchProviderPaymentSnapshot',
} as const;

export const PRODUCTION_DB_CONSTRAINT_PLAN = {
  providerEventInbox: [
    'unique(providerEventId)',
    'index(processingStatus, nextRetryAt)',
  ],
  payments: [
    'unique(providerPaymentId)',
    'index(lastAppliedEventSequence)',
    'version_update_guard(version)',
  ],
  paymentEvents: [
    'foreign_key(paymentId -> payments.id)',
    'index(providerEventId)',
  ],
} as const;

export const PRODUCTION_ROLLOUT_MODEL = {
  stages: ['ingest_only', 'ingest_observe', 'apply_and_reconcile', 'full'],
  rollbackConditions: [
    'dead_letter_count_above_threshold',
    'retry_storm_detected',
    'reconciliation_backlog_growth',
  ],
  rollbackMechanism: 'disable_apply_keep_durable_ingest',
} as const;

export function createStubProviderAdapter(): ProviderAdapter {
  return {
    verifyIncomingEvent(raw) {
      if (!raw || typeof raw !== 'object') {
        throw new Error('invalid provider event payload');
      }

      const candidate = raw as Record<string, unknown>;
      const providerEventId = candidate.providerEventId;
      const providerPaymentId = candidate.providerPaymentId;
      const paymentIntentId = candidate.paymentIntentId;
      const providerStatus = candidate.providerStatus;
      const providerSequence = candidate.providerSequence;
      const occurredAt = candidate.occurredAt;

      if (
        typeof providerEventId !== 'string' ||
        typeof providerPaymentId !== 'string' ||
        typeof paymentIntentId !== 'string' ||
        typeof occurredAt !== 'string' ||
        typeof providerSequence !== 'number'
      ) {
        throw new Error('invalid provider event payload');
      }

      if (
        providerStatus !== 'requires_action' &&
        providerStatus !== 'succeeded' &&
        providerStatus !== 'failed'
      ) {
        throw new Error('invalid provider status');
      }

      return {
        eventId: providerEventId,
        provider: 'stub',
        providerPaymentId,
        paymentIntentId,
        providerStatus,
        providerSequence,
        occurredAt,
      };
    },
    normalizeProviderEvent(raw) {
      return this.verifyIncomingEvent(raw);
    },
    async fetchProviderPaymentSnapshot(payment) {
      return {
        providerStatus: payment.providerStatus,
        providerSequence: payment.lastAppliedEventSequence,
        providerEventId: payment.lastAppliedEventId,
      };
    },
  };
}

export function buildRetryDecision(
  retryCount: number,
  now: Date,
): RetryDecision {
  if (retryCount >= PROVIDER_EVENT_RETRY_POLICY.maxRetryCount) {
    return {
      kind: 'dead_letter',
      reason: 'max_retries_exhausted',
    };
  }

  const backoffIndex = Math.min(
    retryCount,
    PROVIDER_EVENT_RETRY_POLICY.retryBackoffMs.length - 1,
  );
  const nextRetryAt = new Date(
    now.getTime() + PROVIDER_EVENT_RETRY_POLICY.retryBackoffMs[backoffIndex],
  ).toISOString();

  return {
    kind: 'retryable',
    nextRetryAt,
  };
}

export function createIngestProviderEventCommand(deps: IngestDeps) {
  return async function ingestProviderEvent(raw: unknown): Promise<{
    record: ProviderEventInboxRecord;
    duplicate: boolean;
  }> {
    const normalized = deps.adapter.normalizeProviderEvent(raw);
    const payloadSnapshot =
      raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

    const persisted = await deps.persistInboxEvent(normalized, payloadSnapshot);

    deps.metrics.increment('provider_events_received', {
      duplicate: persisted.duplicate ? 1 : 0,
    });
    deps.logs.emit({
      type: 'provider_event_ingested',
      providerEventId: normalized.eventId,
      providerPaymentId: normalized.providerPaymentId,
      duplicate: persisted.duplicate,
      at: deps.now().toISOString(),
    });

    return persisted;
  };
}

export function createProcessProviderInboxEventCommand(deps: ProcessDeps) {
  return async function processProviderInboxEvent(
    eventId: string,
  ): Promise<ProviderEventInboxRecord> {
    const current = await deps.loadInboxEvent(eventId);
    if (!current) {
      throw new Error(`provider inbox event not found: ${eventId}`);
    }

    if (current.processingStatus === 'applied') {
      deps.metrics.increment('provider_events_duplicate');
      return current;
    }

    const processing = await deps.markProcessing(eventId);
    const normalized = processing.payloadSnapshot as unknown as ProviderEvent;

    try {
      const result = await deps.applyDomainEvent(normalized);
      const applied = await deps.markApplied(eventId, {
        processingStatus: 'applied',
        lastError: null,
        nextRetryAt: null,
      });

      deps.metrics.increment('provider_events_applied', {
        processingStatus: result.processingStatus,
      });
      deps.logs.emit({
        type: 'provider_event_processed',
        providerEventId: processing.providerEventId,
        paymentId: result.paymentId,
        processingStatus: result.processingStatus,
      });

      return applied;
    } catch (error) {
      const decision = deps.classifyFailure(error, processing);

      if (decision.kind === 'retryable') {
        const failed = await deps.markFailed(eventId, {
          processingStatus: 'failed',
          retryCount: processing.retryCount + 1,
          nextRetryAt: decision.nextRetryAt,
          lastError: error instanceof Error ? error.message : 'unknown_error',
        });
        deps.metrics.increment('provider_event_retries');
        deps.logs.emit({
          type: 'provider_event_retry_scheduled',
          providerEventId: processing.providerEventId,
          retryCount: failed.retryCount,
          nextRetryAt: failed.nextRetryAt,
        });
        return failed;
      }

      const deadLetter = await deps.markFailed(eventId, {
        processingStatus: 'dead_letter',
        retryCount: processing.retryCount + 1,
        nextRetryAt: null,
        lastError:
          decision.reason ??
          (error instanceof Error ? error.message : 'terminal_error'),
      });
      deps.metrics.increment('provider_event_dead_letters');
      deps.logs.emit({
        type: 'provider_event_dead_letter',
        providerEventId: processing.providerEventId,
        reason: deadLetter.lastError,
      });
      return deadLetter;
    }
  };
}

export function createProcessRetryableInboxEventsCommand(deps: RetrySweepDeps) {
  return async function processRetryableInboxEvents() {
    const events = await deps.loadRetryableEvents(deps.now().toISOString());
    const processed: ProviderEventInboxRecord[] = [];

    for (const event of events) {
      processed.push(await deps.processProviderInboxEvent(event.id));
    }

    deps.metrics.increment('provider_event_retries', {
      batchSize: processed.length,
    });

    return processed;
  };
}

export function createReprocessDeadLetterEventCommand(deps: ReprocessDeps) {
  return async function reprocessDeadLetterEvent(eventId: string) {
    const event = await deps.loadInboxEvent(eventId);
    if (!event) {
      throw new Error(`provider inbox event not found: ${eventId}`);
    }
    if (event.processingStatus !== 'dead_letter') {
      throw new Error(`provider inbox event is not dead_letter: ${eventId}`);
    }

    await deps.resetForReprocess(eventId);
    return deps.processProviderInboxEvent(eventId);
  };
}

export function createRunOperationalReconciliationCommand(
  deps: ReconciliationRunnerDeps,
) {
  return async function runOperationalReconciliation() {
    const results = await deps.reconcilePayments();
    const updated = results.filter((result) => result.action === 'updated');
    deps.metrics.increment('reconciliation_fixes', {
      count: updated.length,
    });
    deps.logs.emit({
      type: 'payment_reconciliation_completed',
      updatedCount: updated.length,
      results,
    });
    return results;
  };
}
