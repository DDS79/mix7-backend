'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import { getTicket, type TicketDetail } from '@/features/tickets/api/tickets.api';
import {
  readSessionState,
  writeSessionState,
} from '@/entities/session/lib/sessionStorage';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { ErrorState } from '@/shared/ui/ErrorState';
import { Spinner } from '@/shared/ui/Spinner';

export default function TicketPage() {
  const params = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ticketId = Array.isArray(params.ticketId) ? params.ticketId[0] : params.ticketId;

  useEffect(() => {
    if (!ticketId) {
      setError('Ticket route parameter is missing.');
      setLoading(false);
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const handoffSessionId = hashParams.get('sessionId');
    const handoffBuyerRef = hashParams.get('buyerRef');
    const handoffActorId = hashParams.get('actorId');
    const handoffAuthAccountId = hashParams.get('authAccountId');
    const handoffTrustLevel = hashParams.get('trustLevel');

    if (
      handoffSessionId &&
      handoffBuyerRef &&
      handoffActorId &&
      handoffAuthAccountId &&
      handoffTrustLevel
    ) {
      writeSessionState({
        buyerRef: handoffBuyerRef,
        sessionId: handoffSessionId,
        actorId: handoffActorId,
        authAccountId: handoffAuthAccountId,
        trustLevel: handoffTrustLevel,
      });
    }

    if (window.location.hash) {
      window.history.replaceState(null, '', `/tickets/${ticketId}`);
    }

    const session = readSessionState();
    if (!session?.sessionId) {
      setError('Session bootstrap is not ready.');
      setLoading(false);
      return;
    }

    void getTicket({
      sessionId: session.sessionId,
      ticketId,
    })
      .then((result) => {
        setTicket(result);
        setLoading(false);
      })
      .catch((nextError) => {
        setError(nextError instanceof Error ? nextError.message : 'Ticket load failed.');
        setLoading(false);
      });
  }, [ticketId]);

  if (loading) {
    return (
      <div className="screen-center">
        <Spinner />
      </div>
    );
  }

  if (error || !ticket) {
    return <ErrorState title="Ticket unavailable" message={error ?? 'Ticket not found.'} />;
  }

  async function copyAccessCode() {
    if (!ticket) {
      return;
    }
    await navigator.clipboard.writeText(ticket.accessCode);
    setCopied(true);
  }

  return (
    <Card>
      <div className="stack">
        <div className="row">
          <h2>{ticket.event.title}</h2>
          <Badge tone="success">{ticket.status}</Badge>
        </div>
        <Card>
          <div className="stack">
            <span className="subtle">Назовите этот код охране</span>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <code style={{ fontSize: '2rem', letterSpacing: '0.2em', fontWeight: 700 }}>{ticket.accessCode}</code>
              <Button onClick={copyAccessCode} variant="secondary">
                {copied ? 'Скопировано' : 'Скопировать код'}
              </Button>
            </div>
            <p className="subtle" style={{ margin: 0 }}>
              Это оперативный код входа. Идентификатор билета и QR payload остаются системными артефактами backend.
            </p>
          </div>
        </Card>
        <Card>
          <div className="stack">
            <h3 style={{ marginBottom: 0 }}>Событие</h3>
            <div className="meta-list">
              <span>{ticket.event.title}</span>
              <span>Начало: {ticket.event.startsAt}</span>
              <span>Окончание: {ticket.event.endsAt}</span>
            </div>
          </div>
        </Card>
        <div className="meta-list">
          <span>Ticket: {ticket.id}</span>
          <span>Access class: {ticket.accessClass}</span>
          <span>Valid from: {ticket.validFrom ?? 'n/a'}</span>
          <span>Valid to: {ticket.validTo ?? 'n/a'}</span>
          <span>Barcode ref: {ticket.barcodeRef ?? 'reserved'}</span>
          <span>QR payload: {ticket.qrPayload ?? 'reserved'}</span>
        </div>
      </div>
    </Card>
  );
}
