import { dbQuery, withDbTransaction } from './db/client';
import type {
  RegistrationSourceType,
  RegistrationStatus,
  TicketAccessClass,
  TicketStatus,
} from './domain_foundation';

export type RuntimeRegistrationRecord = {
  id: string;
  actorId: string;
  eventId: string;
  sourceType: RegistrationSourceType;
  status: RegistrationStatus;
  requestedAt: string;
  approvedAt: string | null;
  checkoutOrderId: string | null;
  ticketId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RuntimeTicketRecord = {
  id: string;
  actorId: string;
  registrationId: string;
  eventId: string;
  orderId: string | null;
  status: TicketStatus;
  accessClass: TicketAccessClass;
  validFrom: string | null;
  validTo: string | null;
  accessCode: string;
  barcodeRef: string | null;
  qrPayload: string | null;
  createdAt: string;
  issuedAt: string;
};

type PersistRegistrationInput = {
  id: string;
  actorId: string;
  eventId: string;
  sourceType: RegistrationSourceType;
  status: RegistrationStatus;
  requestedAt: string;
  approvedAt: string | null;
  checkoutOrderId: string | null;
  ticketId: string | null;
  createdAt: string;
  updatedAt: string;
};

type PersistTicketInput = {
  id: string;
  actorId: string;
  registrationId: string;
  eventId: string;
  orderId: string | null;
  status: TicketStatus;
  accessClass: TicketAccessClass;
  validFrom: string | null;
  validTo: string | null;
  accessCode: string;
  barcodeRef: string | null;
  qrPayload: string | null;
  createdAt: string;
  issuedAt: string;
};

type RegistrationRow = {
  id: string;
  actor_id: string;
  event_id: string;
  source_type: RegistrationSourceType;
  status: RegistrationStatus;
  requested_at: Date | string;
  approved_at: Date | string | null;
  checkout_order_id: string | null;
  ticket_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type TicketRow = {
  id: string;
  actor_id: string;
  registration_id: string;
  event_id: string;
  order_id: string | null;
  status: TicketStatus;
  access_class: TicketAccessClass;
  valid_from: Date | string | null;
  valid_to: Date | string | null;
  access_code: string;
  barcode_ref: string | null;
  qr_payload: string | null;
  created_at: Date | string;
  issued_at: Date | string;
};

type RegistrationTicketCoreStore = {
  persistRegistration: (registration: PersistRegistrationInput) => Promise<RuntimeRegistrationRecord>;
  loadRegistrationById: (registrationId: string) => Promise<RuntimeRegistrationRecord | null>;
  loadRegistrationByOrderId: (orderId: string) => Promise<RuntimeRegistrationRecord | null>;
  updateRegistrationApproval: (args: {
    registrationId: string;
    approvedAt: string;
    ticketId: string;
  }) => Promise<RuntimeRegistrationRecord | null>;
  persistTicket: (ticket: PersistTicketInput) => Promise<RuntimeTicketRecord>;
  loadTicketById: (ticketId: string) => Promise<RuntimeTicketRecord | null>;
  loadTicketByRegistrationId: (registrationId: string) => Promise<RuntimeTicketRecord | null>;
  listTicketsByActor: (actorId: string) => Promise<RuntimeTicketRecord[]>;
  listTicketAccessCodesByEvent: (eventId: string) => Promise<Set<string>>;
  countOccupiedTicketsByEvent: (eventId: string) => Promise<number>;
};

function toIso(value: Date | string | null) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapRegistrationRow(row: RegistrationRow): RuntimeRegistrationRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    eventId: row.event_id,
    sourceType: row.source_type,
    status: row.status,
    requestedAt: toIso(row.requested_at)!,
    approvedAt: toIso(row.approved_at),
    checkoutOrderId: row.checkout_order_id,
    ticketId: row.ticket_id,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!,
  };
}

function mapTicketRow(row: TicketRow): RuntimeTicketRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    registrationId: row.registration_id,
    eventId: row.event_id,
    orderId: row.order_id,
    status: row.status,
    accessClass: row.access_class,
    validFrom: toIso(row.valid_from),
    validTo: toIso(row.valid_to),
    accessCode: row.access_code,
    barcodeRef: row.barcode_ref,
    qrPayload: row.qr_payload,
    createdAt: toIso(row.created_at)!,
    issuedAt: toIso(row.issued_at)!,
  };
}

function createMemoryRegistrationTicketCoreStore(): RegistrationTicketCoreStore & {
  resetForTests: () => void;
} {
  const registrations = new Map<string, RuntimeRegistrationRecord>();
  const tickets = new Map<string, RuntimeTicketRecord>();

  return {
    persistRegistration: async (registration) => {
      const record: RuntimeRegistrationRecord = { ...registration };
      registrations.set(record.id, record);
      return record;
    },
    loadRegistrationById: async (registrationId) => registrations.get(registrationId) ?? null,
    loadRegistrationByOrderId: async (orderId) => {
      for (const registration of registrations.values()) {
        if (registration.checkoutOrderId === orderId) {
          return registration;
        }
      }
      return null;
    },
    updateRegistrationApproval: async ({ registrationId, approvedAt, ticketId }) => {
      const registration = registrations.get(registrationId);
      if (!registration) {
        return null;
      }
      const next: RuntimeRegistrationRecord = {
        ...registration,
        status: 'approved',
        approvedAt,
        ticketId,
        updatedAt: new Date().toISOString(),
      };
      registrations.set(registrationId, next);
      return next;
    },
    persistTicket: async (ticket) => {
      const record: RuntimeTicketRecord = { ...ticket };
      tickets.set(record.id, record);
      return record;
    },
    loadTicketById: async (ticketId) => tickets.get(ticketId) ?? null,
    loadTicketByRegistrationId: async (registrationId) => {
      for (const ticket of tickets.values()) {
        if (ticket.registrationId === registrationId) {
          return ticket;
        }
      }
      return null;
    },
    listTicketsByActor: async (actorId) =>
      Array.from(tickets.values()).filter((ticket) => ticket.actorId === actorId),
    listTicketAccessCodesByEvent: async (eventId) =>
      new Set(
        Array.from(tickets.values())
          .filter((ticket) => ticket.eventId === eventId)
          .map((ticket) => ticket.accessCode),
      ),
    countOccupiedTicketsByEvent: async (eventId) =>
      Array.from(tickets.values()).filter(
        (ticket) => ticket.eventId === eventId && ticket.status !== 'revoked',
      ).length,
    resetForTests: () => {
      registrations.clear();
      tickets.clear();
    },
  };
}

function selectRegistrationSql(whereClause: string) {
  return `SELECT
    id,
    actor_id,
    event_id,
    source_type,
    status,
    requested_at,
    approved_at,
    checkout_order_id,
    ticket_id,
    created_at,
    updated_at
  FROM registrations
  ${whereClause}`;
}

function selectTicketSql(whereClause: string) {
  return `SELECT
    id,
    actor_id,
    registration_id,
    event_id,
    order_id,
    status,
    access_class,
    valid_from,
    valid_to,
    access_code,
    barcode_ref,
    qr_payload,
    created_at,
    issued_at
  FROM tickets
  ${whereClause}`;
}

function createPostgresRegistrationTicketCoreStore(): RegistrationTicketCoreStore {
  return {
    persistRegistration: async (registration) =>
      withDbTransaction(async (client) => {
        await client.query(
          `INSERT INTO registrations (
             id, actor_id, event_id, source_type, status, requested_at, approved_at, checkout_order_id, ticket_id, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9, $10::timestamptz, $11::timestamptz)`,
          [
            registration.id,
            registration.actorId,
            registration.eventId,
            registration.sourceType,
            registration.status,
            registration.requestedAt,
            registration.approvedAt,
            registration.checkoutOrderId,
            registration.ticketId,
            registration.createdAt,
            registration.updatedAt,
          ],
        );
        const result = await client.query<RegistrationRow>(
          selectRegistrationSql('WHERE id = $1'),
          [registration.id],
        );
        return mapRegistrationRow(result.rows[0]);
      }),
    loadRegistrationById: async (registrationId) => {
      const result = await dbQuery<RegistrationRow>(
        selectRegistrationSql('WHERE id = $1'),
        [registrationId],
      );
      return result.rows[0] ? mapRegistrationRow(result.rows[0]) : null;
    },
    loadRegistrationByOrderId: async (orderId) => {
      const result = await dbQuery<RegistrationRow>(
        selectRegistrationSql('WHERE checkout_order_id = $1'),
        [orderId],
      );
      return result.rows[0] ? mapRegistrationRow(result.rows[0]) : null;
    },
    updateRegistrationApproval: async ({ registrationId, approvedAt, ticketId }) =>
      withDbTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE registrations
           SET status = 'approved',
               approved_at = $2::timestamptz,
               ticket_id = $3,
               updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [registrationId, approvedAt, ticketId],
        );
        if (updated.rowCount === 0) {
          return null;
        }
        const fresh = await client.query<RegistrationRow>(
          selectRegistrationSql('WHERE id = $1'),
          [registrationId],
        );
        return fresh.rows[0] ? mapRegistrationRow(fresh.rows[0]) : null;
      }),
    persistTicket: async (ticket) =>
      withDbTransaction(async (client) => {
        await client.query(
          `INSERT INTO tickets (
             id, actor_id, registration_id, event_id, order_id, status, access_class, valid_from, valid_to, access_code, barcode_ref, qr_payload, created_at, issued_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10, $11, $12, $13::timestamptz, $14::timestamptz)`,
          [
            ticket.id,
            ticket.actorId,
            ticket.registrationId,
            ticket.eventId,
            ticket.orderId,
            ticket.status,
            ticket.accessClass,
            ticket.validFrom,
            ticket.validTo,
            ticket.accessCode,
            ticket.barcodeRef,
            ticket.qrPayload,
            ticket.createdAt,
            ticket.issuedAt,
          ],
        );
        const result = await client.query<TicketRow>(
          selectTicketSql('WHERE id = $1'),
          [ticket.id],
        );
        return mapTicketRow(result.rows[0]);
      }),
    loadTicketById: async (ticketId) => {
      const result = await dbQuery<TicketRow>(
        selectTicketSql('WHERE id = $1'),
        [ticketId],
      );
      return result.rows[0] ? mapTicketRow(result.rows[0]) : null;
    },
    loadTicketByRegistrationId: async (registrationId) => {
      const result = await dbQuery<TicketRow>(
        selectTicketSql('WHERE registration_id = $1'),
        [registrationId],
      );
      return result.rows[0] ? mapTicketRow(result.rows[0]) : null;
    },
    listTicketsByActor: async (actorId) => {
      const result = await dbQuery<TicketRow>(
        `${selectTicketSql('WHERE actor_id = $1')}
         ORDER BY issued_at ASC`,
        [actorId],
      );
      return result.rows.map(mapTicketRow);
    },
    listTicketAccessCodesByEvent: async (eventId) => {
      const result = await dbQuery<Pick<TicketRow, 'access_code'>>(
        `SELECT access_code
         FROM tickets
         WHERE event_id = $1`,
        [eventId],
      );
      return new Set(result.rows.map((row) => row.access_code));
    },
    countOccupiedTicketsByEvent: async (eventId) => {
      const result = await dbQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM tickets
         WHERE event_id = $1
           AND status <> 'revoked'`,
        [eventId],
      );
      return Number(result.rows[0]?.count ?? '0');
    },
  };
}

const memoryRegistrationTicketCoreStore =
  process.env.NODE_ENV === 'test' ? createMemoryRegistrationTicketCoreStore() : null;

export const registrationTicketCoreStore: RegistrationTicketCoreStore =
  memoryRegistrationTicketCoreStore ?? createPostgresRegistrationTicketCoreStore();

export function resetRegistrationTicketCoreStoreForTests() {
  memoryRegistrationTicketCoreStore?.resetForTests();
}
