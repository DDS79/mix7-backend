import { apiRequest } from '@/shared/api/client';

export type EventListItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  visibility: string;
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
};

export type EventDetail = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string;
  visibility: string;
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
  };
  metadata: Record<string, unknown>;
};

export async function getEvents() {
  const response = await apiRequest<{
    ok: true;
    data: {
      events: EventListItem[];
    };
  }>({
    path: '/events',
  });

  return response.data.events;
}

export async function getEventDetail(slug: string) {
  const response = await apiRequest<{
    ok: true;
    data: EventDetail;
  }>({
    path: `/events/${slug}`,
  });

  return response.data;
}
