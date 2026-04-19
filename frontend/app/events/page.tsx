import Link from 'next/link';

import { getEvents } from '@/features/events/api/events.api';
import { routes } from '@/shared/constants/routes';
import { Badge } from '@/shared/ui/Badge';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';
import { EventListPrimaryAction } from '@/widgets/EventListPrimaryAction';

export default async function EventsPage() {
  try {
    const events = await getEvents();

    if (events.length === 0) {
      return <EmptyState title="No events yet" message="The catalog is currently empty." />;
    }

    return (
      <div className="stack">
        {events.map((event, index) => (
          <Card
            key={event.id}
            className={`event-card event-card-${['gray', 'brown', 'olive'][index % 3]}`}
          >
            <div className="stack">
              <div className="row">
                <Badge tone={event.pricing.mode === 'free' ? 'success' : 'warning'}>
                  {event.pricing.mode === 'free'
                    ? 'Free registration'
                    : `${event.pricing.priceMinor} ${event.pricing.currency}`}
                </Badge>
                <span className="subtle">{event.category?.title ?? 'Event'}</span>
              </div>
              <div>
                <h2>{event.title}</h2>
                <p className="subtle">{event.summary}</p>
              </div>
              <div className="meta-list">
                <span>{new Date(event.startsAt).toLocaleString()}</span>
                <span>{event.visibility}</span>
              </div>
              <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                <EventListPrimaryAction event={event} />
                <Link className="button button-secondary" href={routes.eventDetail(event.slug)}>
                  Open details
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  } catch (error) {
    return (
      <ErrorState
        title="Events unavailable"
        message={error instanceof Error ? error.message : 'Failed to load event catalog.'}
      />
    );
  }
}
