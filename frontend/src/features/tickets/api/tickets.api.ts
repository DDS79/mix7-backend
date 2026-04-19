import { apiRequest } from '@/shared/api/client';

export type TicketDetail = {
  id: string;
  status: string;
  accessClass: string;
  validFrom: string | null;
  validTo: string | null;
  accessCode: string;
  barcodeRef: string | null;
  qrPayload: string | null;
  event: {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    endsAt: string;
  };
  registrationId: string | null;
  orderId: string | null;
};

export async function getTicket(args: {
  sessionId: string;
  ticketId: string;
}) {
  const response = await apiRequest<{
    ok: true;
    data: TicketDetail;
  }>({
    path: `/tickets/${args.ticketId}`,
    sessionId: args.sessionId,
  });

  return response.data;
}

export async function listTickets(args: {
  sessionId: string;
}) {
  const response = await apiRequest<{
    ok: true;
    data: {
      tickets: TicketDetail[];
    };
  }>({
    path: '/tickets',
    sessionId: args.sessionId,
  });

  return response.data.tickets;
}
