import Link from 'next/link';

import { getEventDetail } from '@/features/events/api/events.api';
import { routes } from '@/shared/constants/routes';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { ErrorState } from '@/shared/ui/ErrorState';

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
                  ? 'Free event'
                  : `${event.pricing.priceMinor} ${event.pricing.currency}`}
              </Badge>
              <span className="subtle">{event.category?.title ?? 'Event'}</span>
            </div>
            <div>
              <h2>{event.title}</h2>
              <p>{event.description}</p>
            </div>
            <div className="meta-list">
              <span>Starts: {new Date(event.startsAt).toLocaleString()}</span>
              <span>Ends: {new Date(event.endsAt).toLocaleString()}</span>
              <span>Visibility: {event.visibility}</span>
            </div>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
              {event.characteristics.map((characteristic) => (
                <Badge key={characteristic.id}>{characteristic.key}</Badge>
              ))}
            </div>
            <Link className="button button-primary" href={routes.eventRegister(event.slug)}>
              Register
            </Link>
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
