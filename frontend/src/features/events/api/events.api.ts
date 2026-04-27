import { apiRequest } from '@/shared/api/client';

export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  visibility: 'public' | 'private' | 'members_only' | 'invite_only';
  category: {
    id: string;
    key: string;
    title: string;
    status: string;
  } | null;
  characteristicRefs: string[];
  pricing: {
    mode: 'free' | 'paid';
    priceMinor: number;
    currency: string;
  };
  sales: {
    open: boolean;
  };
};

type EventListItemWire = Omit<EventListItem, 'sales'> & {
  sales?: {
    open?: boolean;
  };
};

export type EventDetail = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string;
  visibility: EventListItem['visibility'];
  venueId: string | null;
  category: EventListItem['category'];
  characteristics: Array<{
    id: string;
    key: string;
    valueType: string;
    value: string | number | boolean | null;
    allowedValues: string[] | null;
  }>;
  pricing: EventListItem['pricing'];
  registration: {
    required: boolean;
    freeEvent: boolean;
    salesOpen: boolean;
  };
  metadata: Record<string, unknown>;
};

type EventDetailWire = Omit<EventDetail, 'registration'> & {
  registration: {
    required: boolean;
    freeEvent: boolean;
    salesOpen?: boolean;
  };
};

function normalizeEventListItem(event: EventListItemWire): EventListItem {
  return {
    ...event,
    sales: {
      open: event.sales?.open ?? true,
    },
  };
}

function normalizeEventDetail(event: EventDetailWire): EventDetail {
  return {
    ...event,
    registration: {
      ...event.registration,
      salesOpen: event.registration.salesOpen ?? true,
    },
  };
}

export async function getEvents() {
  const response = await apiRequest<{
    ok: true;
    data: {
      events: EventListItemWire[];
    };
  }>({
    path: '/events',
  });

  return response.data.events.map(normalizeEventListItem);
}

export async function getEventDetail(slug: string) {
  const response = await apiRequest<{
    ok: true;
    data: EventDetailWire;
  }>({
    path: `/events/${slug}`,
  });

  return normalizeEventDetail(response.data);
}
