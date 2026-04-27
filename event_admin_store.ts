import { dbQuery, withDbTransaction } from './db/client';
import type { Event, EventVisibility } from './domain_foundation';
import { hashRequest } from './test_stubs/idempotency';

export type EventRecord = Event & {
  slug: string;
  summary: string;
  description: string;
  priceMinor: number;
  currency: string;
  salesOpen: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAuditAction =
  | 'EVENT_CREATED'
  | 'EVENT_UPDATED'
  | 'EVENT_SALES_OPENED'
  | 'EVENT_SALES_CLOSED'
  | 'EVENT_ARCHIVED'
  | 'EVENT_UNARCHIVED';

export type AdminAuditLogRecord = {
  id: string;
  actorId: string;
  action: AdminAuditAction;
  entityType: 'event';
  entityId: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
};

export class EventAdminError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'EventAdminError';
    this.code = code;
    this.status = status;
  }
}

export const DEFAULT_EVENT_CATALOG: EventRecord[] = [
  {
    id: 'evt_7f1ed0d65b3d7b6b18dc1001',
    slug: 'open-studio-day',
    venueId: 'ven_mix7_main',
    title: 'Open Studio Day',
    summary: 'Free daytime access to the space for community visitors.',
    description:
      'An open daytime format with community access, public program context, and immediate ticket issuance.',
    status: 'published',
    startsAt: '2026-04-20T10:00:00.000Z',
    endsAt: '2026-04-20T16:00:00.000Z',
    categoryRef: 'ecat_workshop',
    characteristicRefs: ['echar_daytime', 'echar_members_friendly'],
    visibility: 'public',
    metadata: {},
    capacity: null,
    priceMinor: 0,
    currency: 'RUB',
    salesOpen: true,
    archivedAt: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'evt_1f660cdf31de258568b11002',
    slug: 'night-listening-session',
    venueId: 'ven_mix7_main',
    title: 'Night Listening Session',
    summary: 'Paid evening event with explicit checkout handoff.',
    description:
      'A paid evening program that requires registration first and checkout as the commercial branch.',
    status: 'published',
    startsAt: '2026-04-25T20:00:00.000Z',
    endsAt: '2026-04-25T23:30:00.000Z',
    categoryRef: 'ecat_music',
    characteristicRefs: ['echar_evening'],
    visibility: 'public',
    metadata: {},
    capacity: null,
    priceMinor: 2500,
    currency: 'RUB',
    salesOpen: true,
    archivedAt: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  },
];

type CreateEventInput = {
  slug: string;
  venueId: string | null;
  title: string;
  summary: string;
  description: string;
  status: Event['status'];
  startsAt: string;
  endsAt: string;
  categoryRef: string | null;
  characteristicRefs: string[];
  visibility: EventVisibility;
  metadata: Record<string, unknown>;
  capacity?: number | null;
  priceMinor: number;
  currency: string;
  salesOpen?: boolean;
};

type UpdateEventInput = Partial<CreateEventInput>;

type EventRow = {
  id: string;
  slug: string;
  venue_id: string | null;
  title: string;
  summary: string;
  description: string;
  status: Event['status'];
  starts_at: Date | string;
  ends_at: Date | string;
  category_ref: string | null;
  characteristic_refs: string[] | null;
  visibility: EventVisibility;
  metadata: Record<string, unknown> | null;
  capacity: number | null;
  price_minor: number;
  currency: string;
  sales_open: boolean;
  archived_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AuditRow = {
  id: string;
  actor_id: string;
  action: AdminAuditAction;
  entity_type: 'event';
  entity_id: string;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: Date | string;
};

type EventAdminStore = {
  listPublicEvents: () => Promise<EventRecord[]>;
  getPublicEventBySlug: (slug: string) => Promise<EventRecord | null>;
  getEventBySlug: (slug: string) => Promise<EventRecord | null>;
  getEventById: (eventId: string) => Promise<EventRecord | null>;
  listAdminEvents: () => Promise<EventRecord[]>;
  createEvent: (args: { actorId: string; input: CreateEventInput }) => Promise<EventRecord>;
  updateEvent: (args: { actorId: string; eventId: string; input: UpdateEventInput }) => Promise<EventRecord>;
  setEventSalesOpen: (args: {
    actorId: string;
    eventId: string;
    salesOpen: boolean;
  }) => Promise<EventRecord>;
  archiveEvent: (args: { actorId: string; eventId: string }) => Promise<EventRecord>;
  unarchiveEvent: (args: { actorId: string; eventId: string }) => Promise<EventRecord>;
  listAuditLogs: (args?: { entityId?: string }) => Promise<AdminAuditLogRecord[]>;
};

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase();
}

function normalizeCurrency(currency: string) {
  return currency.trim().toUpperCase();
}

function mapEventRow(row: EventRow): EventRecord {
  return {
    id: row.id,
    slug: row.slug,
    venueId: row.venue_id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    status: row.status,
    startsAt: toIso(row.starts_at)!,
    endsAt: toIso(row.ends_at)!,
    categoryRef: row.category_ref,
    characteristicRefs: row.characteristic_refs ?? [],
    visibility: row.visibility,
    metadata: row.metadata ?? {},
    capacity: row.capacity,
    priceMinor: row.price_minor,
    currency: row.currency,
    salesOpen: row.sales_open,
    archivedAt: toIso(row.archived_at),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
}

function mapAuditRow(row: AuditRow): AdminAuditLogRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    createdAt: toIso(row.created_at)!,
  };
}

function cloneEvent(event: EventRecord) {
  return {
    ...event,
    characteristicRefs: [...event.characteristicRefs],
    metadata: { ...event.metadata },
  };
}

function eventSnapshot(event: EventRecord): Record<string, unknown> {
  return cloneEvent(event);
}

function ensureEventTiming(args: { startsAt: string; endsAt: string }) {
  if (args.endsAt <= args.startsAt) {
    throw new EventAdminError(
      'EVENT_TIME_RANGE_INVALID',
      'Event end time must be after start time.',
      400,
    );
  }
}

function ensureEventWritableState(event: EventRecord) {
  if (event.archivedAt) {
    throw new EventAdminError(
      'EVENT_ARCHIVED',
      'Archived event cannot be modified.',
      409,
    );
  }
}

function buildEventId(slug: string, nowIso: string) {
  return `evt_${hashRequest({ slug, nowIso }).slice(0, 24)}`;
}

function buildAuditId(args: {
  actorId: string;
  action: AdminAuditAction;
  entityId: string;
  createdAt: string;
}) {
  return `audit_${hashRequest(args).slice(0, 24)}`;
}

function buildAuditRecord(args: {
  actorId: string;
  action: AdminAuditAction;
  entityId: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
}): AdminAuditLogRecord {
  return {
    id: buildAuditId({
      actorId: args.actorId,
      action: args.action,
      entityId: args.entityId,
      createdAt: args.createdAt,
    }),
    actorId: args.actorId,
    action: args.action,
    entityType: 'event',
    entityId: args.entityId,
    beforeJson: args.beforeJson,
    afterJson: args.afterJson,
    createdAt: args.createdAt,
  };
}

function buildCreateEventRecord(input: CreateEventInput, nowIso: string): EventRecord {
  ensureEventTiming(input);

  return {
    id: buildEventId(input.slug, nowIso),
    slug: normalizeSlug(input.slug),
    venueId: input.venueId,
    title: input.title,
    summary: input.summary,
    description: input.description,
    status: input.status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    categoryRef: input.categoryRef,
    characteristicRefs: [...input.characteristicRefs],
    visibility: input.visibility,
    metadata: { ...input.metadata },
    capacity: input.capacity ?? null,
    priceMinor: input.priceMinor,
    currency: normalizeCurrency(input.currency),
    salesOpen: input.salesOpen ?? true,
    archivedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildUpdatedEventRecord(
  event: EventRecord,
  input: UpdateEventInput,
  nowIso: string,
): EventRecord {
  const next: EventRecord = {
    ...event,
    slug: input.slug ? normalizeSlug(input.slug) : event.slug,
    venueId: input.venueId === undefined ? event.venueId : input.venueId,
    title: input.title ?? event.title,
    summary: input.summary ?? event.summary,
    description: input.description ?? event.description,
    status: input.status ?? event.status,
    startsAt: input.startsAt ?? event.startsAt,
    endsAt: input.endsAt ?? event.endsAt,
    categoryRef: input.categoryRef === undefined ? event.categoryRef : input.categoryRef,
    characteristicRefs: input.characteristicRefs
      ? [...input.characteristicRefs]
      : [...event.characteristicRefs],
    visibility: input.visibility ?? event.visibility,
    metadata: input.metadata ? { ...input.metadata } : { ...event.metadata },
    capacity: input.capacity === undefined ? event.capacity : input.capacity,
    priceMinor: input.priceMinor ?? event.priceMinor,
    currency: input.currency ? normalizeCurrency(input.currency) : event.currency,
    salesOpen: input.salesOpen ?? event.salesOpen,
    updatedAt: nowIso,
  };

  ensureEventTiming(next);
  return next;
}

function sortEvents(events: EventRecord[]) {
  return events.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

function sortAudit(logs: AdminAuditLogRecord[]) {
  return logs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function createMemoryEventAdminStore(): EventAdminStore & { resetForTests: () => void } {
  const eventsById = new Map<string, EventRecord>();
  const eventsBySlug = new Map<string, EventRecord>();
  const auditLogs = new Map<string, AdminAuditLogRecord>();

  function setEvent(event: EventRecord) {
    eventsById.set(event.id, cloneEvent(event));
    eventsBySlug.set(event.slug, cloneEvent(event));
  }

  function deleteSlug(slug: string) {
    eventsBySlug.delete(slug);
  }

  function resetForTests() {
    eventsById.clear();
    eventsBySlug.clear();
    auditLogs.clear();

    for (const event of DEFAULT_EVENT_CATALOG) {
      setEvent(event);
    }
  }

  resetForTests();

  return {
    listPublicEvents: async () =>
      sortEvents(
        Array.from(eventsById.values())
          .filter(
            (event) =>
              event.status === 'published' &&
              event.visibility === 'public' &&
              !event.archivedAt,
          )
          .map(cloneEvent),
      ),
    getPublicEventBySlug: async (slug) => {
      const event = eventsBySlug.get(normalizeSlug(slug)) ?? null;
      if (
        !event ||
        event.archivedAt ||
        event.status !== 'published' ||
        event.visibility !== 'public'
      ) {
        return null;
      }
      return cloneEvent(event);
    },
    getEventBySlug: async (slug) => {
      const event = eventsBySlug.get(normalizeSlug(slug)) ?? null;
      return event ? cloneEvent(event) : null;
    },
    getEventById: async (eventId) => {
      const event = eventsById.get(eventId) ?? null;
      return event ? cloneEvent(event) : null;
    },
    listAdminEvents: async () => sortEvents(Array.from(eventsById.values()).map(cloneEvent)),
    createEvent: async ({ actorId, input }) => {
      const normalizedSlug = normalizeSlug(input.slug);
      if (eventsBySlug.has(normalizedSlug)) {
        throw new EventAdminError('EVENT_SLUG_CONFLICT', 'Event slug already exists.', 409);
      }

      const nowIso = new Date().toISOString();
      const created = buildCreateEventRecord({ ...input, slug: normalizedSlug }, nowIso);
      setEvent(created);

      const audit = buildAuditRecord({
        actorId,
        action: 'EVENT_CREATED',
        entityId: created.id,
        beforeJson: null,
        afterJson: eventSnapshot(created),
        createdAt: nowIso,
      });
      auditLogs.set(audit.id, audit);
      return cloneEvent(created);
    },
    updateEvent: async ({ actorId, eventId, input }) => {
      const existing = eventsById.get(eventId);
      if (!existing) {
        throw new EventAdminError('EVENT_NOT_FOUND', 'Event not found.', 404);
      }
      ensureEventWritableState(existing);

      const nextSlug = input.slug ? normalizeSlug(input.slug) : existing.slug;
      const sameSlugOwner = eventsBySlug.get(nextSlug);
      if (sameSlugOwner && sameSlugOwner.id !== existing.id) {
        throw new EventAdminError('EVENT_SLUG_CONFLICT', 'Event slug already exists.', 409);
      }

      const nowIso = new Date().toISOString();
      const updated = buildUpdatedEventRecord(existing, { ...input, slug: nextSlug }, nowIso);

      if (updated.slug !== existing.slug) {
        deleteSlug(existing.slug);
      }
      setEvent(updated);

      const audit = buildAuditRecord({
        actorId,
        action: 'EVENT_UPDATED',
        entityId: updated.id,
        beforeJson: eventSnapshot(existing),
        afterJson: eventSnapshot(updated),
        createdAt: nowIso,
      });
      auditLogs.set(audit.id, audit);
      return cloneEvent(updated);
    },
    setEventSalesOpen: async ({ actorId, eventId, salesOpen }) => {
      const existing = eventsById.get(eventId);
      if (!existing) {
        throw new EventAdminError('EVENT_NOT_FOUND', 'Event not found.', 404);
      }
      ensureEventWritableState(existing);

      const nowIso = new Date().toISOString();
      const updated: EventRecord = {
        ...existing,
        salesOpen,
        updatedAt: nowIso,
      };
      setEvent(updated);

      const audit = buildAuditRecord({
        actorId,
        action: salesOpen ? 'EVENT_SALES_OPENED' : 'EVENT_SALES_CLOSED',
        entityId: updated.id,
        beforeJson: eventSnapshot(existing),
        afterJson: eventSnapshot(updated),
        createdAt: nowIso,
      });
      auditLogs.set(audit.id, audit);
      return cloneEvent(updated);
    },
    archiveEvent: async ({ actorId, eventId }) => {
      const existing = eventsById.get(eventId);
      if (!existing) {
        throw new EventAdminError('EVENT_NOT_FOUND', 'Event not found.', 404);
      }
      if (existing.archivedAt) {
        return cloneEvent(existing);
      }

      const nowIso = new Date().toISOString();
      const updated: EventRecord = {
        ...existing,
        archivedAt: nowIso,
        updatedAt: nowIso,
      };
      setEvent(updated);

      const audit = buildAuditRecord({
        actorId,
        action: 'EVENT_ARCHIVED',
        entityId: updated.id,
        beforeJson: eventSnapshot(existing),
        afterJson: eventSnapshot(updated),
        createdAt: nowIso,
      });
      auditLogs.set(audit.id, audit);
      return cloneEvent(updated);
    },
    unarchiveEvent: async ({ actorId, eventId }) => {
      const existing = eventsById.get(eventId);
      if (!existing) {
        throw new EventAdminError('EVENT_NOT_FOUND', 'Event not found.', 404);
      }
      if (!existing.archivedAt) {
        return cloneEvent(existing);
      }

      const nowIso = new Date().toISOString();
      const updated: EventRecord = {
        ...existing,
        archivedAt: null,
        updatedAt: nowIso,
      };
      setEvent(updated);

      const audit = buildAuditRecord({
        actorId,
        action: 'EVENT_UNARCHIVED',
        entityId: updated.id,
        beforeJson: eventSnapshot(existing),
        afterJson: eventSnapshot(updated),
        createdAt: nowIso,
      });
      auditLogs.set(audit.id, audit);
      return cloneEvent(updated);
    },
    listAuditLogs: async (args) =>
      sortAudit(
        Array.from(auditLogs.values())
          .filter((log) => !args?.entityId || log.entityId === args.entityId)
          .map((log) => ({ ...log })),
      ),
    resetForTests,
  };
}

function selectEventSql(whereClause = '') {
  return `SELECT
    id,
    slug,
    venue_id,
    title,
    summary,
    description,
    status,
    starts_at,
    ends_at,
    category_ref,
    characteristic_refs,
    visibility,
    metadata,
    capacity,
    price_minor,
    currency,
    sales_open,
    archived_at,
    created_at,
    updated_at
  FROM events
  ${whereClause}`;
}

function selectAuditSql(whereClause = '') {
  return `SELECT
    id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    created_at
  FROM admin_audit_log
  ${whereClause}`;
}

function createPostgresEventAdminStore(): EventAdminStore {
  return {
    listPublicEvents: async () => {
      const result = await dbQuery<EventRow>(
        `${selectEventSql(`WHERE status = 'published' AND visibility = 'public' AND archived_at IS NULL`)}
         ORDER BY starts_at ASC`,
      );
      return result.rows.map(mapEventRow);
    },
    getPublicEventBySlug: async (slug) => {
      const result = await dbQuery<EventRow>(
        `${selectEventSql(`WHERE slug = $1 AND status = 'published' AND visibility = 'public' AND archived_at IS NULL`)}`,
        [normalizeSlug(slug)],
      );
      return result.rows[0] ? mapEventRow(result.rows[0]) : null;
    },
    getEventBySlug: async (slug) => {
      const result = await dbQuery<EventRow>(selectEventSql('WHERE slug = $1'), [
        normalizeSlug(slug),
      ]);
      return result.rows[0] ? mapEventRow(result.rows[0]) : null;
    },
    getEventById: async (eventId) => {
      const result = await dbQuery<EventRow>(selectEventSql('WHERE id = $1'), [eventId]);
      return result.rows[0] ? mapEventRow(result.rows[0]) : null;
    },
    listAdminEvents: async () => {
      const result = await dbQuery<EventRow>(
        `${selectEventSql()}
         ORDER BY starts_at ASC`,
      );
      return result.rows.map(mapEventRow);
    },
    createEvent: async ({ actorId, input }) =>
      withDbTransaction(async (client) => {
        const normalizedSlug = normalizeSlug(input.slug);
        const existing = await client.query<{ id: string }>(
          'SELECT id FROM events WHERE slug = $1',
          [normalizedSlug],
        );
        if ((existing.rowCount ?? 0) > 0) {
          throw new EventAdminError('EVENT_SLUG_CONFLICT', 'Event slug already exists.', 409);
        }

        const nowIso = new Date().toISOString();
        const created = buildCreateEventRecord({ ...input, slug: normalizedSlug }, nowIso);
        await client.query(
          `INSERT INTO events (
             id, slug, venue_id, title, summary, description, status, starts_at, ends_at, category_ref, characteristic_refs, visibility, metadata, capacity, price_minor, currency, sales_open, archived_at, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10, $11::jsonb, $12, $13::jsonb, $14, $15, $16, $17, $18::timestamptz, $19::timestamptz, $20::timestamptz)`,
          [
            created.id,
            created.slug,
            created.venueId,
            created.title,
            created.summary,
            created.description,
            created.status,
            created.startsAt,
            created.endsAt,
            created.categoryRef,
            JSON.stringify(created.characteristicRefs),
            created.visibility,
            JSON.stringify(created.metadata),
            created.capacity,
            created.priceMinor,
            created.currency,
            created.salesOpen,
            created.archivedAt,
            created.createdAt,
            created.updatedAt,
          ],
        );

        const audit = buildAuditRecord({
          actorId,
          action: 'EVENT_CREATED',
          entityId: created.id,
          beforeJson: null,
          afterJson: eventSnapshot(created),
          createdAt: nowIso,
        });
        await client.query(
          `INSERT INTO admin_audit_log (
             id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)`,
          [
            audit.id,
            audit.actorId,
            audit.action,
            audit.entityType,
            audit.entityId,
            audit.beforeJson ? JSON.stringify(audit.beforeJson) : null,
            audit.afterJson ? JSON.stringify(audit.afterJson) : null,
            audit.createdAt,
          ],
        );

        return created;
      }),
    updateEvent: async ({ actorId, eventId, input }) =>
      withDbTransaction(async (client) => {
        const existingResult = await client.query<EventRow>(selectEventSql('WHERE id = $1'), [
          eventId,
        ]);
        const existing = existingResult.rows[0] ? mapEventRow(existingResult.rows[0]) : null;
        if (!existing) {
          throw new EventAdminError('EVENT_NOT_FOUND', 'Event not found.', 404);
        }
        ensureEventWritableState(existing);

        const nextSlug = input.slug ? normalizeSlug(input.slug) : existing.slug;
        const slugOwner = await client.query<{ id: string }>(
          'SELECT id FROM events WHERE slug = $1 AND id <> $2',
          [nextSlug, eventId],
        );
        if ((slugOwner.rowCount ?? 0) > 0) {
          throw new EventAdminError('EVENT_SLUG_CONFLICT', 'Event slug already exists.', 409);
        }

        const nowIso = new Date().toISOString();
        const updated = buildUpdatedEventRecord(existing, { ...input, slug: nextSlug }, nowIso);
        await client.query(
          `UPDATE events
           SET slug = $2,
               venue_id = $3,
               title = $4,
               summary = $5,
               description = $6,
               status = $7,
               starts_at = $8::timestamptz,
               ends_at = $9::timestamptz,
               category_ref = $10,
               characteristic_refs = $11::jsonb,
               visibility = $12,
               metadata = $13::jsonb,
               capacity = $14,
               price_minor = $15,
               currency = $16,
               sales_open = $17,
               updated_at = $18::timestamptz
           WHERE id = $1`,
          [
            updated.id,
            updated.slug,
            updated.venueId,
            updated.title,
            updated.summary,
            updated.description,
            updated.status,
            updated.startsAt,
            updated.endsAt,
            updated.categoryRef,
            JSON.stringify(updated.characteristicRefs),
            updated.visibility,
            JSON.stringify(updated.metadata),
            updated.capacity,
            updated.priceMinor,
            updated.currency,
            updated.salesOpen,
            updated.updatedAt,
          ],
        );

        const audit = buildAuditRecord({
          actorId,
          action: 'EVENT_UPDATED',
          entityId: updated.id,
          beforeJson: eventSnapshot(existing),
          afterJson: eventSnapshot(updated),
          createdAt: nowIso,
        });
        await client.query(
          `INSERT INTO admin_audit_log (
             id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)`,
          [
            audit.id,
            audit.actorId,
            audit.action,
            audit.entityType,
            audit.entityId,
            JSON.stringify(audit.beforeJson),
            JSON.stringify(audit.afterJson),
            audit.createdAt,
          ],
        );

        return updated;
      }),
    setEventSalesOpen: async ({ actorId, eventId, salesOpen }) =>
      withDbTransaction(async (client) => {
        const existingResult = await client.query<EventRow>(selectEventSql('WHERE id = $1'), [
          eventId,
        ]);
        const existing = existingResult.rows[0] ? mapEventRow(existingResult.rows[0]) : null;
        if (!existing) {
          throw new EventAdminError('EVENT_NOT_FOUND', 'Event not found.', 404);
        }
        ensureEventWritableState(existing);

        const nowIso = new Date().toISOString();
        const updated: EventRecord = {
          ...existing,
          salesOpen,
          updatedAt: nowIso,
        };
        await client.query(
          `UPDATE events
           SET sales_open = $2,
               updated_at = $3::timestamptz
           WHERE id = $1`,
          [eventId, salesOpen, nowIso],
        );

        const audit = buildAuditRecord({
          actorId,
          action: salesOpen ? 'EVENT_SALES_OPENED' : 'EVENT_SALES_CLOSED',
          entityId: updated.id,
          beforeJson: eventSnapshot(existing),
          afterJson: eventSnapshot(updated),
          createdAt: nowIso,
        });
        await client.query(
          `INSERT INTO admin_audit_log (
             id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)`,
          [
            audit.id,
            audit.actorId,
            audit.action,
            audit.entityType,
            audit.entityId,
            JSON.stringify(audit.beforeJson),
            JSON.stringify(audit.afterJson),
            audit.createdAt,
          ],
        );

        return updated;
      }),
    archiveEvent: async ({ actorId, eventId }) =>
      withDbTransaction(async (client) => {
        const existingResult = await client.query<EventRow>(selectEventSql('WHERE id = $1'), [
          eventId,
        ]);
        const existing = existingResult.rows[0] ? mapEventRow(existingResult.rows[0]) : null;
        if (!existing) {
          throw new EventAdminError('EVENT_NOT_FOUND', 'Event not found.', 404);
        }
        if (existing.archivedAt) {
          return existing;
        }

        const nowIso = new Date().toISOString();
        const updated: EventRecord = {
          ...existing,
          archivedAt: nowIso,
          updatedAt: nowIso,
        };
        await client.query(
          `UPDATE events
           SET archived_at = $2::timestamptz,
               updated_at = $2::timestamptz
           WHERE id = $1`,
          [eventId, nowIso],
        );

        const audit = buildAuditRecord({
          actorId,
          action: 'EVENT_ARCHIVED',
          entityId: updated.id,
          beforeJson: eventSnapshot(existing),
          afterJson: eventSnapshot(updated),
          createdAt: nowIso,
        });
        await client.query(
          `INSERT INTO admin_audit_log (
             id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)`,
          [
            audit.id,
            audit.actorId,
            audit.action,
            audit.entityType,
            audit.entityId,
            JSON.stringify(audit.beforeJson),
            JSON.stringify(audit.afterJson),
            audit.createdAt,
          ],
        );

        return updated;
      }),
    unarchiveEvent: async ({ actorId, eventId }) =>
      withDbTransaction(async (client) => {
        const existingResult = await client.query<EventRow>(selectEventSql('WHERE id = $1'), [
          eventId,
        ]);
        const existing = existingResult.rows[0] ? mapEventRow(existingResult.rows[0]) : null;
        if (!existing) {
          throw new EventAdminError('EVENT_NOT_FOUND', 'Event not found.', 404);
        }
        if (!existing.archivedAt) {
          return existing;
        }

        const nowIso = new Date().toISOString();
        const updated: EventRecord = {
          ...existing,
          archivedAt: null,
          updatedAt: nowIso,
        };
        await client.query(
          `UPDATE events
           SET archived_at = NULL,
               updated_at = $2::timestamptz
           WHERE id = $1`,
          [eventId, nowIso],
        );

        const audit = buildAuditRecord({
          actorId,
          action: 'EVENT_UNARCHIVED',
          entityId: updated.id,
          beforeJson: eventSnapshot(existing),
          afterJson: eventSnapshot(updated),
          createdAt: nowIso,
        });
        await client.query(
          `INSERT INTO admin_audit_log (
             id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)`,
          [
            audit.id,
            audit.actorId,
            audit.action,
            audit.entityType,
            audit.entityId,
            JSON.stringify(audit.beforeJson),
            JSON.stringify(audit.afterJson),
            audit.createdAt,
          ],
        );

        return updated;
      }),
    listAuditLogs: async (args) => {
      const result = args?.entityId
        ? await dbQuery<AuditRow>(
            `${selectAuditSql('WHERE entity_type = $1 AND entity_id = $2')}
             ORDER BY created_at DESC`,
            ['event', args.entityId],
          )
        : await dbQuery<AuditRow>(
            `${selectAuditSql('WHERE entity_type = $1')}
             ORDER BY created_at DESC`,
            ['event'],
          );
      return result.rows.map(mapAuditRow);
    },
  };
}

const memoryEventAdminStore =
  process.env.NODE_ENV === 'test' ? createMemoryEventAdminStore() : null;

export const eventAdminStore: EventAdminStore =
  memoryEventAdminStore ?? createPostgresEventAdminStore();

export function resetEventAdminStoreForTests() {
  memoryEventAdminStore?.resetForTests();
}
