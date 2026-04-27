import { apiRequest } from '@/shared/api/client';

export type AdminEventRecord = {
  id: string;
  slug: string;
  venueId: string | null;
  title: string;
  summary: string;
  description: string;
  status: 'draft' | 'published' | 'cancelled' | 'completed';
  startsAt: string;
  endsAt: string;
  categoryRef: string | null;
  characteristicRefs: string[];
  visibility: 'public' | 'private' | 'members_only' | 'invite_only';
  metadata: Record<string, unknown>;
  priceMinor: number;
  currency: string;
  salesOpen: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminAuditLogRecord = {
  id: string;
  actorId: string;
  action:
    | 'EVENT_CREATED'
    | 'EVENT_UPDATED'
    | 'EVENT_SALES_OPENED'
    | 'EVENT_SALES_CLOSED'
    | 'EVENT_ARCHIVED'
    | 'EVENT_UNARCHIVED';
  entityType: string;
  entityId: string;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
};

export type CreateAdminEventInput = {
  slug: string;
  venueId: string | null;
  title: string;
  summary: string;
  description: string;
  status: AdminEventRecord['status'];
  startsAt: string;
  endsAt: string;
  categoryRef: string | null;
  characteristicRefs: string[];
  visibility: AdminEventRecord['visibility'];
  metadata: Record<string, unknown>;
  priceMinor: number;
  currency: string;
  salesOpen?: boolean;
};

export type UpdateAdminEventInput = Partial<CreateAdminEventInput>;

type AdminEventsResponse = {
  ok: true;
  data: {
    events: AdminEventRecord[];
  };
};

type AdminEventMutationResponse = {
  ok: true;
  data: {
    event: AdminEventRecord;
  };
};

type AdminAuditLogResponse = {
  ok: true;
  data: {
    auditLog: AdminAuditLogRecord[];
  };
};

export async function listAdminEvents(args: { sessionId: string }) {
  const response = await apiRequest<AdminEventsResponse>({
    path: '/admin/events',
    sessionId: args.sessionId,
  });

  return response.data.events;
}

export async function createAdminEvent(args: {
  sessionId: string;
  input: CreateAdminEventInput;
}) {
  const response = await apiRequest<AdminEventMutationResponse>({
    path: '/admin/events',
    method: 'POST',
    sessionId: args.sessionId,
    body: args.input,
  });

  return response.data.event;
}

export async function updateAdminEvent(args: {
  sessionId: string;
  eventId: string;
  input: UpdateAdminEventInput;
}) {
  const response = await apiRequest<AdminEventMutationResponse>({
    path: `/admin/events/${args.eventId}`,
    method: 'PATCH',
    sessionId: args.sessionId,
    body: args.input,
  });

  return response.data.event;
}

export async function openAdminEventSales(args: { sessionId: string; eventId: string }) {
  const response = await apiRequest<AdminEventMutationResponse>({
    path: `/admin/events/${args.eventId}/open-sales`,
    method: 'POST',
    sessionId: args.sessionId,
  });

  return response.data.event;
}

export async function closeAdminEventSales(args: { sessionId: string; eventId: string }) {
  const response = await apiRequest<AdminEventMutationResponse>({
    path: `/admin/events/${args.eventId}/close-sales`,
    method: 'POST',
    sessionId: args.sessionId,
  });

  return response.data.event;
}

export async function archiveAdminEvent(args: { sessionId: string; eventId: string }) {
  const response = await apiRequest<AdminEventMutationResponse>({
    path: `/admin/events/${args.eventId}/archive`,
    method: 'POST',
    sessionId: args.sessionId,
  });

  return response.data.event;
}

export async function unarchiveAdminEvent(args: { sessionId: string; eventId: string }) {
  const response = await apiRequest<AdminEventMutationResponse>({
    path: `/admin/events/${args.eventId}/unarchive`,
    method: 'POST',
    sessionId: args.sessionId,
  });

  return response.data.event;
}

export async function listAdminAuditLog(args: {
  sessionId: string;
  eventId?: string | null;
}) {
  const search = args.eventId ? `?eventId=${encodeURIComponent(args.eventId)}` : '';
  const response = await apiRequest<AdminAuditLogResponse>({
    path: `/admin/audit-log${search}`,
    sessionId: args.sessionId,
  });

  return response.data.auditLog;
}
