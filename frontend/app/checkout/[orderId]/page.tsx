'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

import {
  confirmCheckoutPayment,
  initiateCheckoutPayment,
  type PaymentConfirmResponse,
  type PaymentIntentResponse,
} from '@/features/checkout/api/checkout.api';
import {
  clearPendingCheckout,
  readPendingCheckout,
  readSessionState,
  writePendingCheckout,
  writeSessionState,
} from '@/entities/session/lib/sessionStorage';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Card';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorState } from '@/shared/ui/ErrorState';

export default function CheckoutPage() {
  const params = useParams<{ orderId: string }>();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<ReturnType<typeof readPendingCheckout>>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [intent, setIntent] = useState<PaymentIntentResponse | null>(null);
  const [confirmation, setConfirmation] = useState<PaymentConfirmResponse | null>(null);
  const [loading, setLoading] = useState<'idle' | 'intent' | 'confirm'>('idle');
  const [error, setError] = useState<string | null>(null);

  const orderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;

  useEffect(() => {
    if (!orderId) {
      setBootstrapped(true);
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const handoffSessionId = hashParams.get('sessionId');
    const handoffBuyerRef = hashParams.get('buyerRef');
    const handoffActorId = hashParams.get('actorId');
    const handoffAuthAccountId = hashParams.get('authAccountId');
    const handoffTrustLevel = hashParams.get('trustLevel');
    const handoffEventSlug = hashParams.get('eventSlug');
    const handoffTotalMinor = hashParams.get('totalMinor');
    const handoffCurrency = hashParams.get('currency');

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

    if (
      handoffEventSlug &&
      handoffTotalMinor &&
      handoffCurrency
    ) {
      const totalMinor = Number.parseInt(handoffTotalMinor, 10);
      if (Number.isFinite(totalMinor) && totalMinor > 0) {
        writePendingCheckout({
          orderId,
          eventSlug: handoffEventSlug,
          totalMinor,
          currency: handoffCurrency,
        });
      }
    }

    if (window.location.hash) {
      window.history.replaceState(null, '', `/checkout/${orderId}`);
    }

    const session = readSessionState();
    setSessionId(session?.sessionId ?? null);
    setCheckout(readPendingCheckout(orderId));
    setBootstrapped(true);
  }, [orderId]);

  if (!bootstrapped) {
    return null;
  }

  if (!orderId) {
    return (
      <ErrorState
        title="Checkout unavailable"
        message="Checkout route parameter is missing."
      />
    );
  }

  if (!checkout) {
    return (
      <EmptyState
        title="Checkout context unavailable"
        message="This phase-1 frontend needs the backend registration handoff to open checkout."
      />
    );
  }

  if (!sessionId) {
    return <ErrorState title="Session unavailable" message="Session bootstrap is not ready." />;
  }

  async function startPayment() {
    const activeSessionId = sessionId;
    const activeCheckout = checkout;
    if (!activeSessionId) {
      setError('Session bootstrap is not ready.');
      return;
    }
    if (!activeCheckout) {
      setError('Checkout context is unavailable.');
      return;
    }

    try {
      setLoading('intent');
      setError(null);
      const result = await initiateCheckoutPayment({
        sessionId: activeSessionId,
        orderId: activeCheckout.orderId,
        amount: activeCheckout.totalMinor,
        currency: activeCheckout.currency,
      });
      if (result.payment_intent.confirmation_url) {
        window.location.href = result.payment_intent.confirmation_url;
        return;
      }
      setIntent(result);
      setLoading('idle');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Payment initiation failed.');
      setLoading('idle');
    }
  }

  async function confirmPayment() {
    if (!intent) {
      return;
    }
    const activeSessionId = sessionId;
    const activeCheckout = checkout;
    if (!activeSessionId) {
      setError('Session bootstrap is not ready.');
      return;
    }
    if (!activeCheckout) {
      setError('Checkout context is unavailable.');
      return;
    }

    try {
      setLoading('confirm');
      setError(null);
      const result = await confirmCheckoutPayment({
        sessionId: activeSessionId,
        orderId: activeCheckout.orderId,
        paymentIntentId: intent.payment_intent.intent_id,
      });
      setConfirmation(result);
      clearPendingCheckout(activeCheckout.orderId);
      setLoading('idle');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Payment confirmation failed.');
      setLoading('idle');
    }
  }

  return (
    <div className="stack">
      <Card>
        <div className="stack">
          <h2>Checkout</h2>
          <div className="meta-list">
            <span>Order: {checkout.orderId}</span>
            <span>Event: {checkout.eventSlug}</span>
            <span>
              Total: {checkout.totalMinor} {checkout.currency}
            </span>
          </div>
          {error ? <ErrorState title="Checkout error" message={error} /> : null}
          {!intent ? (
            <Button disabled={loading !== 'idle'} onClick={startPayment}>
              {loading === 'intent' ? 'Starting payment…' : 'Start payment'}
            </Button>
          ) : null}
          {intent ? (
            <Card>
              <div className="stack">
                <h3>Payment intent ready</h3>
                <div className="meta-list">
                  <span>Intent: {intent.payment_intent.intent_id}</span>
                  <span>Status: {intent.payment_intent.status}</span>
                  <span>Next step: {intent.payment_intent.next_step}</span>
                </div>
                {!confirmation ? (
                  <Button disabled={loading !== 'idle'} onClick={confirmPayment}>
                    {loading === 'confirm' ? 'Confirming…' : 'Confirm payment'}
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}
          {confirmation ? (
            <Card>
              <div className="stack">
                <h3>Confirmation requested</h3>
                <div className="meta-list">
                  <span>Intent: {confirmation.payment_confirmation.intent_id}</span>
                  <span>Status: {confirmation.payment_confirmation.status}</span>
                  <span>Requested at: {confirmation.payment_confirmation.requested_at}</span>
                  <span>Next step: {confirmation.payment_confirmation.next_step}</span>
                </div>
                <p className="subtle">
                  This phase-1 UI keeps payment semantics honest. Ticket issuance for paid events is
                  not claimed here until the backend exposes final post-payment product issuance.
                </p>
              </div>
            </Card>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
