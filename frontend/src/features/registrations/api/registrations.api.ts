import { apiRequest } from '@/shared/api/client';

export type RegistrationResponse = {
  registrationId: string;
  eventId: string;
  eventSlug: string;
  status: string;
  nextAction: 'checkout' | 'ticket_ready';
  replayed: boolean;
  checkout?: {
    orderId: string;
    totalMinor: number;
    currency: string;
  };
  ticket?: {
    ticketId: string;
  };
};

export async function createRegistration(args: {
  sessionId: string;
  eventSlug: string;
}) {
  const response = await apiRequest<{
    ok: true;
    data: RegistrationResponse;
  }>({
    path: '/registrations',
    method: 'POST',
    sessionId: args.sessionId,
    body: {
      eventSlug: args.eventSlug,
    },
  });

  return response.data;
}
