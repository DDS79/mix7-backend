import { hashRequest } from './test_stubs/idempotency';
import { createRuntimeOrder } from './payment_runtime_store';
import type {
  Event,
  EventCategory,
  EventCharacteristic,
  Registration,
  Ticket,
} from './domain_foundation';

export type EventPricingMode = 'free' | 'paid';

export type EventRecord = Event & {
  slug: string;
  summary: string;
  description: string;
  priceMinor: number;
  currency: string;
};

export type RegistrationRecord = Registration & {
  checkoutOrderId: string | null;
  ticketId: string | null;
};

export type TicketRecord = Ticket & {
  accessCode: string;
  barcodeRef: string | null;
  qrPayload: string | null;
};

export class EventRegistrationTicketError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'EventRegistrationTicketError';
    this.code = code;
    this.status = status;
  }
}

const defaultCategories: EventCategory[] = [
  {
    id: 'ecat_music',
    key: 'music',
    title: 'Music',
    status: 'active',
  },
  {
    id: 'ecat_workshop',
    key: 'workshop',
    title: 'Workshop',
    status: 'active',
  },
];

const defaultCharacteristics: EventCharacteristic[] = [
  {
    id: 'echar_evening',
    key: 'evening',
    valueType: 'boolean',
    value: true,
    allowedValues: null,
  },
  {
    id: 'echar_members_friendly',
    key: 'members_friendly',
    valueType: 'boolean',
    value: true,
    allowedValues: null,
  },
  {
    id: 'echar_daytime',
    key: 'daytime',
    valueType: 'boolean',
    value: true,
    allowedValues: null,
  },
];

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
    priceMinor: 0,
    currency: 'RUB',
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
    priceMinor: 2500,
    currency: 'RUB',
  },
];

const categories = new Map<string, EventCategory>();
const characteristics = new Map<string, EventCharacteristic>();
const eventsById = new Map<string, EventRecord>();
const eventsBySlug = new Map<string, EventRecord>();
const registrations = new Map<string, RegistrationRecord>();
const tickets = new Map<string, TicketRecord>();

function seedDefaults() {
  categories.clear();
  characteristics.clear();
  eventsById.clear();
  eventsBySlug.clear();

  for (const category of defaultCategories) {
    categories.set(category.id, category);
  }
  for (const characteristic of defaultCharacteristics) {
    characteristics.set(characteristic.id, characteristic);
  }
  for (const event of DEFAULT_EVENT_CATALOG) {
    eventsById.set(event.id, event);
    eventsBySlug.set(event.slug, event);
  }
}

export function resetEventRegistrationTicketStore() {
  registrations.clear();
  tickets.clear();
  seedDefaults();
}

resetEventRegistrationTicketStore();

function buildRegistrationId(actorId: string, eventId: string) {
  return `reg_${hashRequest({ actorId, eventId }).slice(0, 24)}`;
}

function buildOrderId(registrationId: string) {
  return `ord_${hashRequest({ registrationId, kind: 'event_checkout' }).slice(0, 24)}`;
}

function buildTicketId(registrationId: string) {
  return `tkt_${hashRequest({ registrationId, kind: 'event_ticket' }).slice(0, 24)}`;
}

const ACCESS_CODE_SPACE = 1_000_000;
const ACCESS_CODE_LENGTH = 6;

function buildTicketAccessCodeCandidate(args: {
  actorId: string;
  eventId: string;
  registrationId: string;
  attempt: number;
}) {
  const seed = hashRequest({
    actorId: args.actorId,
    eventId: args.eventId,
    registrationId: args.registrationId,
    kind: 'event_access_code',
    attempt: args.attempt,
  });

  const value = Number.parseInt(seed.slice(0, 12), 16) % ACCESS_CODE_SPACE;
  return String(value).padStart(ACCESS_CODE_LENGTH, '0');
}

function listOccupiedAccessCodesForEvent(eventId: string) {
  return new Set(
    Array.from(tickets.values())
      .filter((ticket) => ticket.eventId === eventId)
      .map((ticket) => ticket.accessCode),
  );
}

export function buildTicketAccessCode(args: {
  actorId: string;
  eventId: string;
  registrationId: string;
  occupiedCodes?: ReadonlySet<string>;
}) {
  const occupiedCodes = args.occupiedCodes ?? listOccupiedAccessCodesForEvent(args.eventId);

  for (let attempt = 0; attempt < ACCESS_CODE_SPACE; attempt += 1) {
    const candidate = buildTicketAccessCodeCandidate({
      actorId: args.actorId,
      eventId: args.eventId,
      registrationId: args.registrationId,
      attempt,
    });

    if (!occupiedCodes.has(candidate)) {
      return candidate;
    }
  }

  throw new EventRegistrationTicketError(
    'ACCESS_CODE_SPACE_EXHAUSTED',
    'Event access code space is exhausted.',
    409,
  );
}

function buildTicketBarcodeRef(ticketId: string) {
  return `barcode_${ticketId.slice(4)}`;
}

function buildTicketQrPayload(ticketId: string) {
  return `mix7:ticket:${ticketId}`;
}

function createIssuedTicket(args: {
  ticketId: string;
  actorId: string;
  eventId: string;
  registrationId: string;
  orderId: string | null;
}) {
  return {
    id: args.ticketId,
    eventId: args.eventId,
    actorId: args.actorId,
    registrationId: args.registrationId,
    orderId: args.orderId,
    status: 'issued' as const,
    accessClass: 'general' as const,
    validFrom: eventsById.get(args.eventId)?.startsAt ?? null,
    validTo: eventsById.get(args.eventId)?.endsAt ?? null,
    accessCode: buildTicketAccessCode({
      actorId: args.actorId,
      eventId: args.eventId,
      registrationId: args.registrationId,
      occupiedCodes: listOccupiedAccessCodesForEvent(args.eventId),
    }),
    barcodeRef: buildTicketBarcodeRef(args.ticketId),
    qrPayload: buildTicketQrPayload(args.ticketId),
  };
}

function findEventBySlug(slug: string) {
  return eventsBySlug.get(slug) ?? null;
}

function logRegistrationDiagnostic(payload: Record<string, unknown>) {
  // Temporary diagnostic instrumentation for production paid-registration debugging.
  console.info(
    JSON.stringify({
      scope: 'create_event_registration',
      ...payload,
    }),
  );
}

function findCategory(categoryId: string | null) {
  return categoryId ? categories.get(categoryId) ?? null : null;
}

function mapCharacteristics(characteristicRefs: string[]) {
  return characteristicRefs
    .map((id) => characteristics.get(id))
    .filter((value): value is EventCharacteristic => Boolean(value));
}

function eventPricingMode(event: EventRecord): EventPricingMode {
  return event.priceMinor > 0 ? 'paid' : 'free';
}

function ensureEventRegistrable(event: EventRecord) {
  if (event.status !== 'published') {
    throw new EventRegistrationTicketError(
      'EVENT_NOT_REGISTRABLE',
      'Event is not available for registration.',
      409,
    );
  }
}

export function listPublicEvents() {
  return Array.from(eventsBySlug.values())
    .filter((event) => event.status === 'published')
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      summary: event.summary,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      visibility: event.visibility,
      category: findCategory(event.categoryRef),
      characteristicRefs: event.characteristicRefs,
      pricing: {
        mode: eventPricingMode(event),
        priceMinor: event.priceMinor,
        currency: event.currency,
      },
    }));
}

export function getPublicEventDetail(slug: string) {
  const event = findEventBySlug(slug);
  if (!event || event.status !== 'published') {
    throw new EventRegistrationTicketError(
      'EVENT_NOT_FOUND',
      'Event not found.',
      404,
    );
  }

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    visibility: event.visibility,
    venueId: event.venueId,
    category: findCategory(event.categoryRef),
    characteristics: mapCharacteristics(event.characteristicRefs),
    pricing: {
      mode: eventPricingMode(event),
      priceMinor: event.priceMinor,
      currency: event.currency,
    },
    registration: {
      required: true,
      freeEvent: event.priceMinor === 0,
    },
    metadata: event.metadata,
  };
}

export async function createEventRegistration(args: {
  actorId: string;
  buyerId: string;
  eventSlug: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const event = findEventBySlug(args.eventSlug);

  if (!event) {
    throw new EventRegistrationTicketError(
      'EVENT_NOT_FOUND',
      'Event not found.',
      404,
    );
  }

  ensureEventRegistrable(event);

  logRegistrationDiagnostic({
    phase: 'entered',
    eventSlug: args.eventSlug,
    actorId: args.actorId,
    branch: event.priceMinor === 0 ? 'free' : 'paid',
    priceMinor: event.priceMinor,
    currency: event.currency,
  });

  const registrationId = buildRegistrationId(args.actorId, event.id);
  const existing = registrations.get(registrationId);
  if (existing) {
    const existingTicket = existing.ticketId
      ? (tickets.get(existing.ticketId) ?? null)
      : null;
    return {
      registration: existing,
      event,
      nextAction:
        existing.ticketId && existingTicket ? ('ticket_ready' as const) : ('checkout' as const),
      orderId: existing.checkoutOrderId,
      ticket: existingTicket,
      replayed: true,
    };
  }

  if (event.priceMinor === 0) {
    const ticketId = buildTicketId(registrationId);
    const registration: RegistrationRecord = {
      id: registrationId,
      actorId: args.actorId,
      eventId: event.id,
      sourceType: 'manual',
      status: 'approved',
      requestedAt: now.toISOString(),
      approvedAt: now.toISOString(),
      checkoutOrderId: null,
      ticketId,
    };
    const ticket: TicketRecord = createIssuedTicket({
      ticketId,
      actorId: args.actorId,
      eventId: event.id,
      registrationId: registration.id,
      orderId: null,
    });
    registrations.set(registration.id, registration);
    tickets.set(ticket.id, ticket);

    logRegistrationDiagnostic({
      phase: 'free_registration_issued',
      eventSlug: args.eventSlug,
      actorId: args.actorId,
      registrationId: registration.id,
      ticketId: ticket.id,
    });

    return {
      registration,
      event,
      nextAction: 'ticket_ready' as const,
      orderId: null,
      ticket,
      replayed: false,
    };
  }

  const orderId = buildOrderId(registrationId);
  logRegistrationDiagnostic({
    phase: 'paid_order_creation_start',
    eventSlug: args.eventSlug,
    actorId: args.actorId,
    registrationId,
    orderId,
  });

  try {
    await createRuntimeOrder({
      id: orderId,
      actorId: args.actorId,
      registrationId,
      buyerId: args.buyerId,
      eventId: event.id,
      totalMinor: event.priceMinor,
      currency: event.currency,
    });
  } catch (error) {
    logRegistrationDiagnostic({
      phase: 'paid_order_creation_failed',
      eventSlug: args.eventSlug,
      actorId: args.actorId,
      registrationId,
      orderId,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack ?? null : null,
    });
    throw error;
  }

  logRegistrationDiagnostic({
    phase: 'paid_order_creation_succeeded',
    eventSlug: args.eventSlug,
    actorId: args.actorId,
    registrationId,
    orderId,
  });

  const registration: RegistrationRecord = {
    id: registrationId,
    actorId: args.actorId,
    eventId: event.id,
    sourceType: 'checkout',
    status: 'requested',
    requestedAt: now.toISOString(),
    approvedAt: null,
    checkoutOrderId: orderId,
    ticketId: null,
  };
  registrations.set(registration.id, registration);

  logRegistrationDiagnostic({
    phase: 'paid_registration_created',
    eventSlug: args.eventSlug,
    actorId: args.actorId,
    registrationId: registration.id,
    orderId,
  });

  return {
    registration,
    event,
    nextAction: 'checkout' as const,
    orderId,
    ticket: null,
    replayed: false,
  };
}

export async function issuePaidTicketForSuccessfulOrder(args: {
  orderId: string;
  actorId: string;
  registrationId: string;
  eventId: string;
  paidAt?: string;
}) {
  const registration = registrations.get(args.registrationId);
  if (!registration) {
    throw new EventRegistrationTicketError(
      'REGISTRATION_NOT_FOUND',
      'Registration not found for paid ticket issuance.',
      404,
    );
  }

  const event = eventsById.get(args.eventId);
  if (!event) {
    throw new EventRegistrationTicketError(
      'EVENT_NOT_FOUND',
      'Event not found for paid ticket issuance.',
      404,
    );
  }

  if (event.priceMinor === 0) {
    throw new EventRegistrationTicketError(
      'PAID_TICKET_ISSUANCE_NOT_APPLICABLE',
      'Paid-ticket issuance is only valid for paid events.',
      409,
    );
  }

  if (registration.checkoutOrderId !== args.orderId) {
    throw new EventRegistrationTicketError(
      'ORDER_REGISTRATION_MISMATCH',
      'Order does not match registration checkout anchor.',
      409,
    );
  }

  if (registration.actorId !== args.actorId || registration.eventId !== args.eventId) {
    throw new EventRegistrationTicketError(
      'REGISTRATION_OWNERSHIP_MISMATCH',
      'Registration does not match the paid order ownership chain.',
      409,
    );
  }

  const existingTicket = registration.ticketId
    ? (tickets.get(registration.ticketId) ?? null)
    : null;
  if (registration.ticketId && existingTicket) {
    return {
      registration,
      ticket: existingTicket,
      replayed: true,
    };
  }

  const ticketId = buildTicketId(registration.id);
  const ticket = createIssuedTicket({
    ticketId,
    actorId: args.actorId,
    eventId: args.eventId,
    registrationId: registration.id,
    orderId: args.orderId,
  });
  const approvedAt = registration.approvedAt ?? args.paidAt ?? new Date().toISOString();
  const approvedRegistration: RegistrationRecord = {
    ...registration,
    status: 'approved',
    approvedAt,
    ticketId: ticket.id,
  };

  registrations.set(approvedRegistration.id, approvedRegistration);
  tickets.set(ticket.id, ticket);

  return {
    registration: approvedRegistration,
    ticket,
    replayed: false,
  };
}

export function getOwnedTicket(args: {
  actorId: string;
  ticketId: string;
}) {
  const ticket = tickets.get(args.ticketId);
  if (!ticket) {
    throw new EventRegistrationTicketError(
      'TICKET_NOT_FOUND',
      'Ticket not found.',
      404,
    );
  }

  if (ticket.actorId !== args.actorId) {
    throw new EventRegistrationTicketError(
      'TICKET_FORBIDDEN',
      'Ticket does not belong to the resolved actor.',
      403,
    );
  }

  const event = eventsById.get(ticket.eventId);
  if (!event) {
    throw new EventRegistrationTicketError(
      'TICKET_EVENT_NOT_FOUND',
      'Ticket event not found.',
      500,
    );
  }

  return {
    id: ticket.id,
    status: ticket.status,
    accessClass: ticket.accessClass,
    validFrom: ticket.validFrom,
    validTo: ticket.validTo,
    accessCode: ticket.accessCode,
    barcodeRef: ticket.barcodeRef,
    qrPayload: ticket.qrPayload,
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    },
    registrationId: ticket.registrationId,
    orderId: ticket.orderId,
  };
}

export function listOwnedTickets(args: { actorId: string }) {
  return Array.from(tickets.values())
    .filter((ticket) => ticket.actorId === args.actorId)
    .map((ticket) => {
      const event = eventsById.get(ticket.eventId);
      if (!event) {
        throw new EventRegistrationTicketError(
          'TICKET_EVENT_NOT_FOUND',
          'Ticket event not found.',
          500,
        );
      }

      return {
        id: ticket.id,
        status: ticket.status,
        accessClass: ticket.accessClass,
        validFrom: ticket.validFrom,
        validTo: ticket.validTo,
        accessCode: ticket.accessCode,
        barcodeRef: ticket.barcodeRef,
        qrPayload: ticket.qrPayload,
        event: {
          id: event.id,
          slug: event.slug,
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
        },
        registrationId: ticket.registrationId,
        orderId: ticket.orderId,
      };
    })
    .sort((left, right) => left.event.startsAt.localeCompare(right.event.startsAt));
}
