import { hashRequest } from './test_stubs/idempotency';
import {
  eventAdminStore,
  resetEventAdminStoreForTests,
  type EventRecord,
} from './event_admin_store';
import { createRuntimeOrder } from './payment_runtime_store';
import {
  registrationTicketCoreStore,
  resetRegistrationTicketCoreStoreForTests,
} from './registration_ticket_core_store';
import type {
  EventCategory,
  EventCharacteristic,
  Registration,
  Ticket,
} from './domain_foundation';

export type EventPricingMode = 'free' | 'paid';

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

const categories = new Map<string, EventCategory>();
const characteristics = new Map<string, EventCharacteristic>();

for (const category of defaultCategories) {
  categories.set(category.id, category);
}
for (const characteristic of defaultCharacteristics) {
  characteristics.set(characteristic.id, characteristic);
}

export function resetEventRegistrationTicketStore() {
  resetRegistrationTicketCoreStoreForTests();
  resetEventAdminStoreForTests();
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

export function buildTicketAccessCode(args: {
  actorId: string;
  eventId: string;
  registrationId: string;
  occupiedCodes?: ReadonlySet<string>;
}) {
  const occupiedCodes = args.occupiedCodes ?? new Set<string>();

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

async function createIssuedTicket(args: {
  ticketId: string;
  actorId: string;
  eventId: string;
  registrationId: string;
  orderId: string | null;
}) {
  const occupiedCodes = await registrationTicketCoreStore.listTicketAccessCodesByEvent(args.eventId);
  const event = await eventAdminStore.getEventById(args.eventId);

  return {
    id: args.ticketId,
    eventId: args.eventId,
    actorId: args.actorId,
    registrationId: args.registrationId,
    orderId: args.orderId,
    status: 'issued' as const,
    accessClass: 'general' as const,
    validFrom: event?.startsAt ?? null,
    validTo: event?.endsAt ?? null,
    accessCode: buildTicketAccessCode({
      actorId: args.actorId,
      eventId: args.eventId,
      registrationId: args.registrationId,
      occupiedCodes,
    }),
    barcodeRef: buildTicketBarcodeRef(args.ticketId),
    qrPayload: buildTicketQrPayload(args.ticketId),
  };
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
  if (event.archivedAt) {
    throw new EventRegistrationTicketError(
      'EVENT_NOT_FOUND',
      'Event not found.',
      404,
    );
  }

  if (event.status !== 'published') {
    throw new EventRegistrationTicketError(
      'EVENT_NOT_REGISTRABLE',
      'Event is not available for registration.',
      409,
    );
  }

  if (!event.salesOpen) {
    throw new EventRegistrationTicketError(
      'EVENT_SALES_CLOSED',
      'Event sales are closed.',
      409,
    );
  }
}

export async function listPublicEvents() {
  const events = await eventAdminStore.listPublicEvents();

  return events
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
    sales: {
      open: event.salesOpen,
    },
  }));
}

export async function getPublicEventDetail(slug: string) {
  const event = await eventAdminStore.getPublicEventBySlug(slug);
  if (!event) {
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
      salesOpen: event.salesOpen,
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
  const event = await eventAdminStore.getEventBySlug(args.eventSlug);

  if (!event) {
    throw new EventRegistrationTicketError(
      'EVENT_NOT_FOUND',
      'Event not found.',
      404,
    );
  }

  ensureEventRegistrable(event);

  const registrationId = buildRegistrationId(args.actorId, event.id);
  const existing = await registrationTicketCoreStore.loadRegistrationById(registrationId);
  if (existing) {
    const existingTicket = existing.ticketId
      ? await registrationTicketCoreStore.loadTicketById(existing.ticketId)
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
    const createdAt = now.toISOString();
    const registration = await registrationTicketCoreStore.persistRegistration({
      id: registrationId,
      actorId: args.actorId,
      eventId: event.id,
      sourceType: 'manual',
      status: 'approved',
      requestedAt: createdAt,
      approvedAt: createdAt,
      checkoutOrderId: null,
      ticketId,
      createdAt,
      updatedAt: createdAt,
    });
    const ticket = await createIssuedTicket({
      ticketId,
      actorId: args.actorId,
      eventId: event.id,
      registrationId: registration.id,
      orderId: null,
    });
    await registrationTicketCoreStore.persistTicket({
      ...ticket,
      createdAt,
      issuedAt: createdAt,
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
    throw error;
  }

  const createdAt = now.toISOString();
  const registration = await registrationTicketCoreStore.persistRegistration({
    id: registrationId,
    actorId: args.actorId,
    eventId: event.id,
    sourceType: 'checkout',
    status: 'requested',
    requestedAt: createdAt,
    approvedAt: null,
    checkoutOrderId: orderId,
    ticketId: null,
    createdAt,
    updatedAt: createdAt,
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
  const registration = await registrationTicketCoreStore.loadRegistrationById(args.registrationId);
  if (!registration) {
    throw new EventRegistrationTicketError(
      'REGISTRATION_NOT_FOUND',
      'Registration not found for paid ticket issuance.',
      404,
    );
  }

  const event = await eventAdminStore.getEventById(args.eventId);
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

  const existingTicket = await registrationTicketCoreStore.loadTicketByRegistrationId(
    registration.id,
  );
  if (existingTicket) {
    return {
      registration,
      ticket: existingTicket,
      replayed: true,
    };
  }

  const ticketId = buildTicketId(registration.id);
  const ticket = await createIssuedTicket({
    ticketId,
    actorId: args.actorId,
    eventId: args.eventId,
    registrationId: registration.id,
    orderId: args.orderId,
  });
  const approvedAt = registration.approvedAt ?? args.paidAt ?? new Date().toISOString();
  const createdAt = args.paidAt ?? new Date().toISOString();
  await registrationTicketCoreStore.persistTicket({
    ...ticket,
    createdAt,
    issuedAt: approvedAt,
  });
  const approvedRegistration = await registrationTicketCoreStore.updateRegistrationApproval({
    registrationId: registration.id,
    approvedAt,
    ticketId: ticket.id,
  });
  if (!approvedRegistration) {
    throw new EventRegistrationTicketError(
      'DURABLE_TICKET_ISSUANCE_MISSING',
      'Registration approval projection failed after ticket issuance.',
      500,
    );
  }

  return {
    registration: approvedRegistration,
    ticket,
    replayed: false,
  };
}

export async function getOwnedTicket(args: {
  actorId: string;
  ticketId: string;
}) {
  const ticket = await registrationTicketCoreStore.loadTicketById(args.ticketId);
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

  const event = await eventAdminStore.getEventById(ticket.eventId);
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

export async function listOwnedTickets(args: { actorId: string }) {
  const tickets = await registrationTicketCoreStore.listTicketsByActor(args.actorId);
  return (
    await Promise.all(
      tickets.map(async (ticket) => {
        const event = await eventAdminStore.getEventById(ticket.eventId);
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
      }),
    )
  ).sort((left, right) => left.event.startsAt.localeCompare(right.event.startsAt));
}
