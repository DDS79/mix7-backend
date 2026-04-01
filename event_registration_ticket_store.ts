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

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACCESS_CODE_LENGTH = 8;

function buildTicketAccessCode(args: {
  actorId: string;
  eventId: string;
  registrationId: string;
}) {
  const seed = hashRequest({
    actorId: args.actorId,
    eventId: args.eventId,
    registrationId: args.registrationId,
    kind: 'event_access_code',
  });

  let code = '';
  for (let index = 0; index < ACCESS_CODE_LENGTH; index += 1) {
    const chunk = seed.slice(index * 2, index * 2 + 2);
    const value = Number.parseInt(chunk, 16);
    code += ACCESS_CODE_ALPHABET[value % ACCESS_CODE_ALPHABET.length];
  }

  return code;
}

function buildTicketBarcodeRef(ticketId: string) {
  return `barcode_${ticketId.slice(4)}`;
}

function buildTicketQrPayload(ticketId: string) {
  return `mix7:ticket:${ticketId}`;
}

function findEventBySlug(slug: string) {
  return eventsBySlug.get(slug) ?? null;
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

export function createEventRegistration(args: {
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
    const ticket: TicketRecord = {
      id: ticketId,
      eventId: event.id,
      actorId: args.actorId,
      registrationId: registration.id,
      orderId: null,
      status: 'issued',
      accessClass: 'general',
      validFrom: event.startsAt,
      validTo: event.endsAt,
      accessCode: buildTicketAccessCode({
        actorId: args.actorId,
        eventId: event.id,
        registrationId: registration.id,
      }),
      barcodeRef: buildTicketBarcodeRef(ticketId),
      qrPayload: buildTicketQrPayload(ticketId),
    };
    registrations.set(registration.id, registration);
    tickets.set(ticket.id, ticket);

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
  createRuntimeOrder({
    id: orderId,
    buyerId: args.buyerId,
    eventId: event.id,
    totalMinor: event.priceMinor,
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

  return {
    registration,
    event,
    nextAction: 'checkout' as const,
    orderId,
    ticket: null,
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
