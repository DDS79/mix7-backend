import { getEventDetail } from '@/features/events/api/events.api';
import {
  getEventSalesLabel,
  getRemainingCapacityLabel,
  getEventVisibilityLabel,
} from '@/shared/lib/eventLabels';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { ErrorState } from '@/shared/ui/ErrorState';
import { EventDetailPrimaryAction } from '@/widgets/EventDetailPrimaryAction';

export default async function EventDetailPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;

  try {
    const event = await getEventDetail(params.slug);

    return (
      <div className="stack">
        <Card>
          <div className="stack">
            <div className="row">
              <Badge tone={event.pricing.mode === 'free' ? 'success' : 'warning'}>
                {event.pricing.mode === 'free'
                  ? 'Бесплатное событие'
                  : `${event.pricing.priceMinor} ${event.pricing.currency}`}
              </Badge>
              <span className="subtle">{event.category?.title ?? 'Событие'}</span>
            </div>
            <div>
              <h2>{event.title}</h2>
              <p>{event.description}</p>
            </div>
            <div className="meta-list">
              <span>Начало: {new Date(event.startsAt).toLocaleString('ru-RU')}</span>
              <span>Конец: {new Date(event.endsAt).toLocaleString('ru-RU')}</span>
              <span>Формат доступа: {getEventVisibilityLabel(event.visibility)}</span>
              <span>{getEventSalesLabel(event.registration.salesOpen)}</span>
              {getRemainingCapacityLabel(event.remainingCapacity, event.soldOut) ? (
                <span>{getRemainingCapacityLabel(event.remainingCapacity, event.soldOut)}</span>
              ) : null}
            </div>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {event.characteristics.map((characteristic) => (
                <Badge key={characteristic.id}>{characteristic.key}</Badge>
              ))}
            </div>
            {!event.registration.salesOpen ? (
              <p className="subtle">Продажа билетов приостановлена. Уже купленные билеты остаются действительными.</p>
            ) : null}
            {event.soldOut ? (
              <p className="subtle">Мест нет. Уже купленные билеты остаются действительными.</p>
            ) : null}
            <EventDetailPrimaryAction event={event} />
          </div>
        </Card>
      </div>
    );
  } catch (error) {
    return (
      <ErrorState
        title="Event unavailable"
        message={error instanceof Error ? error.message : 'Failed to load event detail.'}
      />
    );
  }
}
