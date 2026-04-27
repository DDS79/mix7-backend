'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  archiveAdminEvent,
  closeAdminEventSales,
  createAdminEvent,
  listAdminAuditLog,
  listAdminEvents,
  openAdminEventSales,
  unarchiveAdminEvent,
  updateAdminEvent,
  type AdminAuditLogRecord,
  type AdminEventRecord,
  type CreateAdminEventInput,
} from '@/features/admin/api/admin.api';
import { ApiError } from '@/entities/api-error/model/apiError.types';
import { useRuntimeSessionState } from '@/entities/session/hooks/useRuntimeSessionState';
import { readSessionState } from '@/entities/session/lib/sessionStorage';
import { routes } from '@/shared/constants/routes';
import {
  getArchivedLabel,
  getEventSalesLabel,
  getEventStatusLabel,
  getEventVisibilityLabel,
} from '@/shared/lib/eventLabels';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Input } from '@/shared/ui/Input';
import { Spinner } from '@/shared/ui/Spinner';

type AdminLoadState = 'loading' | 'ready' | 'forbidden' | 'error';

type CreateFormState = {
  title: string;
  slug: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string;
  priceMinor: string;
  currency: string;
  status: AdminEventRecord['status'];
  visibility: AdminEventRecord['visibility'];
};

type EditFormState = {
  title: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string;
  priceMinor: string;
  currency: string;
  status: AdminEventRecord['status'];
  visibility: AdminEventRecord['visibility'];
};

const DEFAULT_CREATE_FORM: CreateFormState = {
  title: '',
  slug: '',
  summary: '',
  description: '',
  startsAt: '',
  endsAt: '',
  priceMinor: '0',
  currency: 'RUB',
  status: 'published',
  visibility: 'public',
};

function formatDisplayDate(value: string | null) {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString('ru-RU');
  } catch {
    return value;
  }
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoFromDateTimeLocal(value: string) {
  return new Date(value).toISOString();
}

function formatPrice(event: AdminEventRecord) {
  return `${event.priceMinor} ${event.currency}`;
}

function formatAuditValue(value: unknown) {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return '—';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function summarizeAuditChanges(entry: AdminAuditLogRecord) {
  const before = entry.beforeJson ?? {};
  const after = entry.afterJson ?? {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  return keys
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      key,
      before: formatAuditValue(before[key]),
      after: formatAuditValue(after[key]),
    }));
}

function getAuditActionLabel(action: AdminAuditLogRecord['action']) {
  switch (action) {
    case 'EVENT_CREATED':
      return 'Событие создано';
    case 'EVENT_UPDATED':
      return 'Событие обновлено';
    case 'EVENT_SALES_OPENED':
      return 'Продажи открыты';
    case 'EVENT_SALES_CLOSED':
      return 'Продажи закрыты';
    case 'EVENT_ARCHIVED':
      return 'Событие отправлено в архив';
    case 'EVENT_UNARCHIVED':
      return 'Событие восстановлено';
  }
}

function buildEditState(event: AdminEventRecord): EditFormState {
  return {
    title: event.title,
    summary: event.summary,
    description: event.description,
    startsAt: toDateTimeLocalValue(event.startsAt),
    endsAt: toDateTimeLocalValue(event.endsAt),
    priceMinor: String(event.priceMinor),
    currency: event.currency,
    status: event.status,
    visibility: event.visibility,
  };
}

function mapCreateFormToPayload(form: CreateFormState): CreateAdminEventInput {
  return {
    title: form.title.trim(),
    slug: form.slug.trim(),
    summary: form.summary.trim(),
    description: form.description.trim(),
    startsAt: toIsoFromDateTimeLocal(form.startsAt),
    endsAt: toIsoFromDateTimeLocal(form.endsAt),
    priceMinor: Number(form.priceMinor),
    currency: form.currency.trim().toUpperCase(),
    status: form.status,
    visibility: form.visibility,
    venueId: null,
    categoryRef: null,
    characteristicRefs: [],
    metadata: {},
    salesOpen: true,
  };
}

function isAuthenticatedSession(session: ReturnType<typeof readSessionState>) {
  return Boolean(
    session?.sessionId && session.sessionType && session.sessionType !== 'anonymous',
  );
}

export default function AdminPage() {
  const runtimeSession = useRuntimeSessionState();
  const [loadState, setLoadState] = useState<AdminLoadState>('loading');
  const [events, setEvents] = useState<AdminEventRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AdminAuditLogRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<CreateFormState>(DEFAULT_CREATE_FORM);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [selectedAuditEventId, setSelectedAuditEventId] = useState<string>('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [mutatingEventId, setMutatingEventId] = useState<string | null>(null);

  useEffect(() => {
    const session = readSessionState() ?? runtimeSession;

    if (!isAuthenticatedSession(session)) {
      setLoadState('ready');
      setEvents([]);
      setAuditLog([]);
      setError(null);
      return;
    }

    const sessionId = session!.sessionId;
    setLoadState('loading');

    Promise.all([
      listAdminEvents({ sessionId }),
      listAdminAuditLog({
        sessionId,
        eventId: selectedAuditEventId || null,
      }),
    ])
      .then(([nextEvents, nextAuditLog]) => {
        setEvents(nextEvents);
        setAuditLog(nextAuditLog);
        setError(null);
        setLoadState('ready');
      })
      .catch((nextError) => {
        if (nextError instanceof ApiError && nextError.status === 403) {
          setLoadState('forbidden');
          setError(null);
          return;
        }

        if (nextError instanceof ApiError && nextError.status === 401) {
          setLoadState('ready');
          setError(null);
          return;
        }

        setError(nextError instanceof Error ? nextError.message : 'Не удалось загрузить админку.');
        setLoadState('error');
      });
  }, [runtimeSession, selectedAuditEventId]);

  async function refreshAdminData() {
    const session = readSessionState() ?? runtimeSession;
    if (!isAuthenticatedSession(session)) {
      return;
    }

    const sessionId = session!.sessionId;
    const [nextEvents, nextAuditLog] = await Promise.all([
      listAdminEvents({ sessionId }),
      listAdminAuditLog({
        sessionId,
        eventId: selectedAuditEventId || null,
      }),
    ]);

    setEvents(nextEvents);
    setAuditLog(nextAuditLog);
  }

  async function handleCreateEvent() {
    const session = readSessionState() ?? runtimeSession;
    if (!isAuthenticatedSession(session)) {
      return;
    }

    setSubmittingCreate(true);
    setError(null);

    try {
      await createAdminEvent({
        sessionId: session!.sessionId,
        input: mapCreateFormToPayload(createForm),
      });
      setCreateForm(DEFAULT_CREATE_FORM);
      await refreshAdminData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось создать событие.');
    } finally {
      setSubmittingCreate(false);
    }
  }

  async function handleEventMutation(
    eventId: string,
    action: 'open' | 'close' | 'archive' | 'unarchive',
  ) {
    const session = readSessionState() ?? runtimeSession;
    if (!isAuthenticatedSession(session)) {
      return;
    }

    setMutatingEventId(eventId);
    setError(null);

    try {
      if (action === 'open') {
        await openAdminEventSales({ sessionId: session!.sessionId, eventId });
      }
      if (action === 'close') {
        await closeAdminEventSales({ sessionId: session!.sessionId, eventId });
      }
      if (action === 'archive') {
        await archiveAdminEvent({ sessionId: session!.sessionId, eventId });
      }
      if (action === 'unarchive') {
        await unarchiveAdminEvent({ sessionId: session!.sessionId, eventId });
      }

      await refreshAdminData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось выполнить действие.');
    } finally {
      setMutatingEventId(null);
    }
  }

  async function handleSaveEdit() {
    const session = readSessionState() ?? runtimeSession;
    if (!isAuthenticatedSession(session) || !editingEventId || !editForm) {
      return;
    }

    setMutatingEventId(editingEventId);
    setError(null);

    try {
      await updateAdminEvent({
        sessionId: session!.sessionId,
        eventId: editingEventId,
        input: {
          title: editForm.title.trim(),
          summary: editForm.summary.trim(),
          description: editForm.description.trim(),
          startsAt: toIsoFromDateTimeLocal(editForm.startsAt),
          endsAt: toIsoFromDateTimeLocal(editForm.endsAt),
          priceMinor: Number(editForm.priceMinor),
          currency: editForm.currency.trim().toUpperCase(),
          status: editForm.status,
          visibility: editForm.visibility,
        },
      });
      setEditingEventId(null);
      setEditForm(null);
      await refreshAdminData();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Не удалось обновить событие.');
    } finally {
      setMutatingEventId(null);
    }
  }

  const currentSession = readSessionState() ?? runtimeSession;
  const isAuthenticated = isAuthenticatedSession(currentSession);

  if (loadState === 'loading') {
    return (
      <div className="screen-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card>
        <div className="stack">
          <h2>Админка</h2>
          <p className="subtle">
            Для доступа к админке нужен вход через Telegram под разрешённым аккаунтом.
          </p>
          <Link className="button button-primary" href={routes.telegramLogin(routes.admin())}>
            Войти через Telegram
          </Link>
        </div>
      </Card>
    );
  }

  if (loadState === 'forbidden') {
    return (
      <Card>
        <EmptyState
          title="Недостаточно прав"
          message="Ваш аккаунт вошёл в систему, но не включён в allowlist администраторов."
        />
      </Card>
    );
  }

  if (loadState === 'error' && error) {
    return <ErrorState title="Админка недоступна" message={error} />;
  }

  return (
    <div className="stack">
      <Card className="admin-hero">
        <div className="stack">
          <h2>Админка</h2>
          <p className="subtle">
            Управление событиями, продажами и аудитом без изменений публичного пользовательского потока.
          </p>
        </div>
      </Card>

      {error ? <ErrorState title="Действие не выполнено" message={error} /> : null}

      <Card>
        <div className="stack">
          <div>
            <h3>Создать событие</h3>
            <p className="subtle">Минимальная форма для нового события MVP.</p>
          </div>

          <div className="admin-form-grid">
            <label className="stack admin-field">
              <span>Название</span>
              <Input
                value={createForm.title}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Ночное событие"
              />
            </label>

            <label className="stack admin-field">
              <span>Slug</span>
              <Input
                value={createForm.slug}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, slug: event.target.value }))
                }
                placeholder="night-session"
              />
            </label>

            <label className="stack admin-field admin-field-wide">
              <span>Краткое описание</span>
              <Input
                value={createForm.summary}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, summary: event.target.value }))
                }
                placeholder="Короткое описание события"
              />
            </label>

            <label className="stack admin-field admin-field-wide">
              <span>Полное описание</span>
              <textarea
                className="input input-textarea"
                value={createForm.description}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Полное описание события"
              />
            </label>

            <label className="stack admin-field">
              <span>Начало</span>
              <Input
                type="datetime-local"
                value={createForm.startsAt}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, startsAt: event.target.value }))
                }
              />
            </label>

            <label className="stack admin-field">
              <span>Конец</span>
              <Input
                type="datetime-local"
                value={createForm.endsAt}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, endsAt: event.target.value }))
                }
              />
            </label>

            <label className="stack admin-field">
              <span>Цена (minor)</span>
              <Input
                type="number"
                min="0"
                value={createForm.priceMinor}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, priceMinor: event.target.value }))
                }
              />
            </label>

            <label className="stack admin-field">
              <span>Валюта</span>
              <Input
                value={createForm.currency}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, currency: event.target.value }))
                }
              />
            </label>

            <label className="stack admin-field">
              <span>Статус</span>
              <select
                className="input"
                value={createForm.status}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    status: event.target.value as CreateFormState['status'],
                  }))
                }
              >
                <option value="published">{getEventStatusLabel('published')}</option>
                <option value="draft">{getEventStatusLabel('draft')}</option>
                <option value="cancelled">{getEventStatusLabel('cancelled')}</option>
                <option value="completed">{getEventStatusLabel('completed')}</option>
              </select>
            </label>

            <label className="stack admin-field">
              <span>Видимость</span>
              <select
                className="input"
                value={createForm.visibility}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    visibility: event.target.value as CreateFormState['visibility'],
                  }))
                }
              >
                <option value="public">{getEventVisibilityLabel('public')}</option>
                <option value="private">{getEventVisibilityLabel('private')}</option>
              </select>
            </label>
          </div>

          <div className="row admin-actions-row">
            <Button disabled={submittingCreate} onClick={() => void handleCreateEvent()}>
              {submittingCreate ? 'Создание...' : 'Создать событие'}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="stack">
          <div>
            <h3>События</h3>
            <p className="subtle">Все события, включая закрытые продажи и архив.</p>
          </div>

          {events.length === 0 ? (
            <EmptyState title="Событий нет" message="Создайте первое событие через форму выше." />
          ) : (
            <div className="stack">
              {events.map((event) => {
                const isEditing = editingEventId === event.id && editForm;
                const isMutating = mutatingEventId === event.id;

                return (
                  <Card key={event.id} className="admin-event-card">
                    <div className="stack">
                      <div className="row admin-event-head">
                        <div className="stack" style={{ gap: '0.35rem' }}>
                          <h3 style={{ marginBottom: 0 }}>{event.title}</h3>
                          <span className="subtle">{event.slug}</span>
                        </div>
                        <div className="row admin-badge-row">
                          <Badge tone={event.salesOpen ? 'success' : 'warning'}>
                            {getEventSalesLabel(event.salesOpen)}
                          </Badge>
                          <Badge tone={event.archivedAt ? 'warning' : 'success'}>
                            {event.archivedAt ? getArchivedLabel() : getEventStatusLabel(event.status)}
                          </Badge>
                        </div>
                      </div>

                      <div className="meta-list">
                        <span>Статус: {getEventStatusLabel(event.status)}</span>
                        <span>Начало: {formatDisplayDate(event.startsAt)}</span>
                        <span>Конец: {formatDisplayDate(event.endsAt)}</span>
                        <span>Цена: {formatPrice(event)}</span>
                        <span>Продажи: {getEventSalesLabel(event.salesOpen)}</span>
                        <span>Видимость: {getEventVisibilityLabel(event.visibility)}</span>
                        {event.archivedAt ? (
                          <span>{getArchivedLabel()}: {formatDisplayDate(event.archivedAt)}</span>
                        ) : null}
                      </div>

                      <div className="row admin-actions-row">
                        <Button
                          variant="secondary"
                          disabled={isMutating || event.archivedAt !== null || event.salesOpen}
                          onClick={() => void handleEventMutation(event.id, 'open')}
                        >
                          Открыть продажи
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isMutating || event.archivedAt !== null || !event.salesOpen}
                          onClick={() => void handleEventMutation(event.id, 'close')}
                        >
                          Закрыть продажи
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isMutating || event.archivedAt !== null}
                          onClick={() => void handleEventMutation(event.id, 'archive')}
                        >
                          Архивировать
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isMutating || event.archivedAt === null}
                          onClick={() => void handleEventMutation(event.id, 'unarchive')}
                        >
                          Восстановить
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isMutating || event.archivedAt !== null}
                          onClick={() => {
                            if (editingEventId === event.id) {
                              setEditingEventId(null);
                              setEditForm(null);
                              return;
                            }

                            setEditingEventId(event.id);
                            setEditForm(buildEditState(event));
                          }}
                        >
                          {editingEventId === event.id ? 'Скрыть редактор' : 'Редактировать'}
                        </Button>
                      </div>

                      {isEditing ? (
                        <div className="stack admin-edit-panel">
                          <div className="admin-form-grid">
                            <label className="stack admin-field">
                              <span>Название</span>
                              <Input
                                value={editForm.title}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current ? { ...current, title: event.target.value } : current,
                                  )
                                }
                              />
                            </label>

                            <label className="stack admin-field admin-field-wide">
                              <span>Краткое описание</span>
                              <Input
                                value={editForm.summary}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current ? { ...current, summary: event.target.value } : current,
                                  )
                                }
                              />
                            </label>

                            <label className="stack admin-field admin-field-wide">
                              <span>Полное описание</span>
                              <textarea
                                className="input input-textarea"
                                value={editForm.description}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current
                                      ? { ...current, description: event.target.value }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label className="stack admin-field">
                              <span>Начало</span>
                              <Input
                                type="datetime-local"
                                value={editForm.startsAt}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current ? { ...current, startsAt: event.target.value } : current,
                                  )
                                }
                              />
                            </label>

                            <label className="stack admin-field">
                              <span>Конец</span>
                              <Input
                                type="datetime-local"
                                value={editForm.endsAt}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current ? { ...current, endsAt: event.target.value } : current,
                                  )
                                }
                              />
                            </label>

                            <label className="stack admin-field">
                              <span>Цена (minor)</span>
                              <Input
                                type="number"
                                min="0"
                                value={editForm.priceMinor}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current
                                      ? { ...current, priceMinor: event.target.value }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label className="stack admin-field">
                              <span>Валюта</span>
                              <Input
                                value={editForm.currency}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current ? { ...current, currency: event.target.value } : current,
                                  )
                                }
                              />
                            </label>

                            <label className="stack admin-field">
                              <span>Статус</span>
                              <select
                                className="input"
                                value={editForm.status}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current
                                      ? {
                                          ...current,
                                          status: event.target.value as EditFormState['status'],
                                        }
                                      : current,
                                  )
                                }
                              >
                                <option value="published">{getEventStatusLabel('published')}</option>
                                <option value="draft">{getEventStatusLabel('draft')}</option>
                                <option value="cancelled">{getEventStatusLabel('cancelled')}</option>
                                <option value="completed">{getEventStatusLabel('completed')}</option>
                              </select>
                            </label>

                            <label className="stack admin-field">
                              <span>Видимость</span>
                              <select
                                className="input"
                                value={editForm.visibility}
                                onChange={(event) =>
                                  setEditForm((current) =>
                                    current
                                      ? {
                                          ...current,
                                          visibility: event.target.value as EditFormState['visibility'],
                                        }
                                      : current,
                                  )
                                }
                              >
                                {editForm.visibility !== 'public' && editForm.visibility !== 'private' ? (
                                  <option value={editForm.visibility}>
                                    {getEventVisibilityLabel(editForm.visibility)}
                                  </option>
                                ) : null}
                                <option value="public">{getEventVisibilityLabel('public')}</option>
                                <option value="private">{getEventVisibilityLabel('private')}</option>
                              </select>
                            </label>
                          </div>

                          <div className="row admin-actions-row">
                            <Button disabled={isMutating} onClick={() => void handleSaveEdit()}>
                              {isMutating ? 'Сохранение...' : 'Сохранить'}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="stack">
          <div className="row admin-audit-toolbar">
            <div>
              <h3>Журнал действий</h3>
              <p className="subtle">Последние admin-действия по событиям.</p>
            </div>

            <label className="stack admin-field admin-filter-field">
              <span>Фильтр по событию</span>
              <select
                className="input"
                value={selectedAuditEventId}
                onChange={(event) => setSelectedAuditEventId(event.target.value)}
              >
                <option value="">Все события</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {auditLog.length === 0 ? (
            <EmptyState title="Аудит пуст" message="Пока нет записей аудита для выбранного фильтра." />
          ) : (
            <div className="stack">
              {auditLog.map((entry) => {
                const changes = summarizeAuditChanges(entry);

                return (
                  <Card key={entry.id} className="admin-audit-entry">
                    <div className="stack">
                      <div className="row admin-event-head">
                        <strong>{getAuditActionLabel(entry.action)}</strong>
                        <span className="subtle">{formatDisplayDate(entry.createdAt)}</span>
                      </div>
                      <div className="meta-list">
                        <span>Тип сущности: {entry.entityType}</span>
                        <span>Сущность: {entry.entityId}</span>
                        <span>Администратор: {entry.actorId}</span>
                      </div>
                      {changes.length > 0 ? (
                        <div className="stack admin-change-list">
                          <strong>Изменения</strong>
                          {changes.map((change) => (
                            <span key={change.key} className="subtle">
                              {change.key}: {change.before} → {change.after}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {(entry.beforeJson || entry.afterJson) ? (
                        <details className="admin-json-details">
                          <summary>Показать raw before / after JSON</summary>
                          <pre className="admin-json-block">
                            {JSON.stringify(
                              {
                                before: entry.beforeJson,
                                after: entry.afterJson,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
