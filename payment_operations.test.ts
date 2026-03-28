import {
  buildRetryDecision,
  createIngestProviderEventCommand,
  createProcessProviderInboxEventCommand,
  createProcessRetryableInboxEventsCommand,
  createReprocessDeadLetterEventCommand,
  createRunOperationalReconciliationCommand,
  createStubProviderAdapter,
  PROVIDER_ADAPTER_CONTRACT,
  PROVIDER_EVENT_RETRY_POLICY,
  type ProviderEventInboxRecord,
} from './payment_operations';

function buildInboxEvent(
  overrides: Partial<ProviderEventInboxRecord> = {},
): ProviderEventInboxRecord {
  return {
    id: 'inbox_1',
    providerEventId: 'prov_evt_1',
    providerPaymentId: 'pp_1',
    providerSequence: 2,
    payloadSnapshot: {
      providerEventId: 'prov_evt_1',
      providerPaymentId: 'pp_1',
      paymentIntentId: 'pi_1',
      providerStatus: 'succeeded',
      providerSequence: 2,
      occurredAt: '2026-01-01T00:05:00.000Z',
    },
    processingStatus: 'received',
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
    createdAt: '2026-01-01T00:05:00.000Z',
    updatedAt: '2026-01-01T00:05:00.000Z',
    ...overrides,
  };
}

function createMetricsCollector() {
  const events: Array<{ name: string; tags?: Record<string, string | number> }> = [];
  return {
    sink: {
      increment(name: string, tags?: Record<string, string | number>) {
        events.push({ name, tags });
      },
    },
    events,
  };
}

function createLogCollector() {
  const entries: Array<Record<string, unknown>> = [];
  return {
    sink: {
      emit(entry: Record<string, unknown>) {
        entries.push(entry);
      },
    },
    entries,
  };
}

describe('provider adapter contract', () => {
  it('normalizes a valid provider event', async () => {
    const adapter = createStubProviderAdapter();

    const event = adapter.normalizeProviderEvent({
      providerEventId: 'prov_evt_1',
      providerPaymentId: 'pp_1',
      paymentIntentId: 'pi_1',
      providerStatus: 'succeeded',
      providerSequence: 2,
      occurredAt: '2026-01-01T00:05:00.000Z',
    });

    expect(event).toEqual({
      eventId: 'prov_evt_1',
      provider: 'stub',
      providerPaymentId: 'pp_1',
      paymentIntentId: 'pi_1',
      providerStatus: 'succeeded',
      providerSequence: 2,
      occurredAt: '2026-01-01T00:05:00.000Z',
    });
    expect(PROVIDER_ADAPTER_CONTRACT.orderingAuthority).toBe('providerSequence');
  });

  it('rejects malformed provider events', () => {
    const adapter = createStubProviderAdapter();

    expect(() =>
      adapter.verifyIncomingEvent({
        providerEventId: 'prov_evt_1',
      }),
    ).toThrow('invalid provider event payload');
  });
});

describe('provider inbox ingestion', () => {
  it('durably stores provider event before business application', async () => {
    const metrics = createMetricsCollector();
    const logs = createLogCollector();
    const persistInboxEvent = jest.fn(async () => ({
      record: buildInboxEvent(),
      duplicate: false,
    }));

    const ingestProviderEvent = createIngestProviderEventCommand({
      adapter: createStubProviderAdapter(),
      persistInboxEvent,
      metrics: metrics.sink,
      logs: logs.sink,
      now: () => new Date('2026-01-01T00:05:00.000Z'),
    });

    const result = await ingestProviderEvent({
      providerEventId: 'prov_evt_1',
      providerPaymentId: 'pp_1',
      paymentIntentId: 'pi_1',
      providerStatus: 'succeeded',
      providerSequence: 2,
      occurredAt: '2026-01-01T00:05:00.000Z',
    });

    expect(persistInboxEvent).toHaveBeenCalledTimes(1);
    expect(result.duplicate).toBe(false);
    expect(metrics.events).toEqual([
      {
        name: 'provider_events_received',
        tags: { duplicate: 0 },
      },
    ]);
  });

  it('ingest-only mode does not mutate business state', async () => {
    const applyDomainEvent = jest.fn(async () => {
      throw new Error('should not apply');
    });

    const ingestProviderEvent = createIngestProviderEventCommand({
      adapter: createStubProviderAdapter(),
      persistInboxEvent: async () => ({
        record: buildInboxEvent(),
        duplicate: false,
      }),
      metrics: createMetricsCollector().sink,
      logs: createLogCollector().sink,
      now: () => new Date('2026-01-01T00:05:00.000Z'),
    });

    await ingestProviderEvent({
      providerEventId: 'prov_evt_1',
      providerPaymentId: 'pp_1',
      paymentIntentId: 'pi_1',
      providerStatus: 'succeeded',
      providerSequence: 2,
      occurredAt: '2026-01-01T00:05:00.000Z',
    });

    expect(applyDomainEvent).not.toHaveBeenCalled();
  });
});

describe('provider inbox processing', () => {
  it('worker replay is safe after event is applied', async () => {
    const metrics = createMetricsCollector();
    const logs = createLogCollector();

    const processProviderInboxEvent = createProcessProviderInboxEventCommand({
      loadInboxEvent: async () =>
        buildInboxEvent({
          processingStatus: 'applied',
        }),
      markProcessing: async () => {
        throw new Error('should not mark processing');
      },
      markApplied: async () => {
        throw new Error('should not mark applied');
      },
      markFailed: async () => {
        throw new Error('should not mark failed');
      },
      applyDomainEvent: async () => {
        throw new Error('should not apply domain event');
      },
      classifyFailure: () => ({
        kind: 'dead_letter',
        reason: 'unexpected',
      }),
      metrics: metrics.sink,
      logs: logs.sink,
    });

    const result = await processProviderInboxEvent('inbox_1');

    expect(result.processingStatus).toBe('applied');
    expect(metrics.events).toEqual([
      {
        name: 'provider_events_duplicate',
        tags: undefined,
      },
    ]);
  });

  it('retryable failure is retried deterministically', async () => {
    const metrics = createMetricsCollector();
    let current = buildInboxEvent();

    const processProviderInboxEvent = createProcessProviderInboxEventCommand({
      loadInboxEvent: async () => current,
      markProcessing: async () => ({
        ...current,
        processingStatus: 'processing',
      }),
      markApplied: async (_eventId, details) => ({
        ...current,
        ...details,
        processingStatus: 'applied',
      }),
      markFailed: async (_eventId, details) => {
        current = {
          ...current,
          ...details,
        };
        return current;
      },
      applyDomainEvent: async () => {
        throw new Error('transient provider lag');
      },
      classifyFailure: (_error, record) =>
        buildRetryDecision(record.retryCount, new Date('2026-01-01T00:00:00.000Z')),
      metrics: metrics.sink,
      logs: createLogCollector().sink,
    });

    const result = await processProviderInboxEvent('inbox_1');

    expect(result.processingStatus).toBe('failed');
    expect(result.retryCount).toBe(1);
    expect(result.nextRetryAt).toBe('2026-01-01T00:01:00.000Z');
    expect(metrics.events).toEqual([
      {
        name: 'provider_event_retries',
        tags: undefined,
      },
    ]);
  });

  it('terminal failure moves event to dead_letter', async () => {
    let current = buildInboxEvent({
      retryCount: PROVIDER_EVENT_RETRY_POLICY.maxRetryCount,
    });

    const processProviderInboxEvent = createProcessProviderInboxEventCommand({
      loadInboxEvent: async () => current,
      markProcessing: async () => ({
        ...current,
        processingStatus: 'processing',
      }),
      markApplied: async () => current,
      markFailed: async (_eventId, details) => {
        current = {
          ...current,
          ...details,
        };
        return current;
      },
      applyDomainEvent: async () => {
        throw new Error('terminal projection mismatch');
      },
      classifyFailure: () => ({
        kind: 'dead_letter',
        reason: 'terminal_projection_mismatch',
      }),
      metrics: createMetricsCollector().sink,
      logs: createLogCollector().sink,
    });

    const result = await processProviderInboxEvent('inbox_1');

    expect(result.processingStatus).toBe('dead_letter');
    expect(result.lastError).toBe('terminal_projection_mismatch');
  });

  it('event apply fails once then succeeds on retry', async () => {
    let current = buildInboxEvent({
      processingStatus: 'failed',
      retryCount: 0,
      nextRetryAt: '2026-01-01T00:01:00.000Z',
    });
    let shouldFail = true;

    const processProviderInboxEvent = createProcessProviderInboxEventCommand({
      loadInboxEvent: async () => current,
      markProcessing: async () => ({
        ...current,
        processingStatus: 'processing',
      }),
      markApplied: async (_eventId, details) => {
        current = {
          ...current,
          ...details,
          processingStatus: 'applied',
        };
        return current;
      },
      markFailed: async (_eventId, details) => {
        current = {
          ...current,
          ...details,
        };
        return current;
      },
      applyDomainEvent: async () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('transient failure');
        }
        return {
          success: true,
          paymentId: 'pay_1',
          orderId: 'ord_1',
          processingStatus: 'applied',
          paymentStatus: 'succeeded',
          orderStatus: 'paid',
        };
      },
      classifyFailure: (_error, record) =>
        buildRetryDecision(record.retryCount, new Date('2026-01-01T00:00:00.000Z')),
      metrics: createMetricsCollector().sink,
      logs: createLogCollector().sink,
    });

    await processProviderInboxEvent('inbox_1');
    const result = await processProviderInboxEvent('inbox_1');

    expect(result.processingStatus).toBe('applied');
    expect(result.retryCount).toBe(1);
  });
});

describe('retry sweep and dead-letter reprocess', () => {
  it('retry sweep processes due failed events', async () => {
    const metrics = createMetricsCollector();

    const processRetryableInboxEvents = createProcessRetryableInboxEventsCommand({
      loadRetryableEvents: async () => [
        buildInboxEvent({
          id: 'inbox_1',
          processingStatus: 'failed',
          nextRetryAt: '2026-01-01T00:00:00.000Z',
        }),
      ],
      processProviderInboxEvent: async (eventId) =>
        buildInboxEvent({
          id: eventId,
          processingStatus: 'applied',
        }),
      metrics: metrics.sink,
      now: () => new Date('2026-01-01T00:02:00.000Z'),
    });

    const result = await processRetryableInboxEvents();

    expect(result).toHaveLength(1);
    expect(result[0].processingStatus).toBe('applied');
    expect(metrics.events).toContainEqual({
      name: 'provider_event_retries',
      tags: { batchSize: 1 },
    });
  });

  it('dead-letter event can be reprocessed deterministically', async () => {
    let resetCalled = false;

    const reprocessDeadLetterEvent = createReprocessDeadLetterEventCommand({
      loadInboxEvent: async () =>
        buildInboxEvent({
          processingStatus: 'dead_letter',
        }),
      resetForReprocess: async () => {
        resetCalled = true;
      },
      processProviderInboxEvent: async () =>
        buildInboxEvent({
          processingStatus: 'applied',
        }),
    });

    const result = await reprocessDeadLetterEvent('inbox_1');

    expect(resetCalled).toBe(true);
    expect(result.processingStatus).toBe('applied');
  });
});

describe('operational reconciliation', () => {
  it('reconciliation later repairs state after missed processing', async () => {
    const metrics = createMetricsCollector();

    const runOperationalReconciliation = createRunOperationalReconciliationCommand({
      reconcilePayments: async () => [
        {
          paymentId: 'pay_1',
          action: 'updated',
          processingStatus: 'applied',
          paymentStatus: 'succeeded',
          orderStatus: 'paid',
        },
      ],
      metrics: metrics.sink,
      logs: createLogCollector().sink,
    });

    const result = await runOperationalReconciliation();

    expect(result[0].paymentStatus).toBe('succeeded');
    expect(metrics.events).toEqual([
      {
        name: 'reconciliation_fixes',
        tags: { count: 1 },
      },
    ]);
  });

  it('metrics and alert-worthy states are tracked deterministically', async () => {
    const metrics = createMetricsCollector();

    const runOperationalReconciliation = createRunOperationalReconciliationCommand({
      reconcilePayments: async () => [
        {
          paymentId: 'pay_1',
          action: 'noop',
          processingStatus: 'noop',
          paymentStatus: 'pending',
          orderStatus: 'pending_payment',
        },
      ],
      metrics: metrics.sink,
      logs: createLogCollector().sink,
    });

    await runOperationalReconciliation();

    expect(metrics.events).toEqual([
      {
        name: 'reconciliation_fixes',
        tags: { count: 0 },
      },
    ]);
  });
});
