import { apiRequest } from '@/shared/api/client';
import { createIdempotencyKey } from '@/shared/lib/idempotency';

export type PaymentIntentResponse = {
  order_id: string;
  buyer_id: string;
  event_id: string;
  total_minor: number;
  status: string;
  payment_intent: {
    provider: string;
    status: string;
    intent_id: string;
    provider_payment_id: string;
    next_step: string;
    expires_at: string;
    handoff: {
      kind: string;
      token: string;
      redirect_path: string;
    };
  };
};

export type PaymentConfirmResponse = {
  order_id: string;
  buyer_id: string;
  event_id: string;
  total_minor: number;
  status: string;
  payment_confirmation: {
    provider: string;
    intent_id: string;
    provider_payment_id: string;
    status: string;
    requested_at: string;
    next_step: string;
  };
};

export async function initiateCheckoutPayment(args: {
  sessionId: string;
  orderId: string;
  amount: number;
  currency: string;
}) {
  const response = await apiRequest<{
    ok: true;
    data: PaymentIntentResponse;
  }>({
    path: '/checkout/payment-intent',
    method: 'POST',
    sessionId: args.sessionId,
    idempotencyKey: createIdempotencyKey(`intent_${args.orderId}`),
    body: {
      orderId: args.orderId,
      amount: args.amount,
      currency: args.currency,
      paymentMethod: 'card',
    },
  });

  return response.data;
}

export async function confirmCheckoutPayment(args: {
  sessionId: string;
  orderId: string;
  paymentIntentId: string;
}) {
  const response = await apiRequest<{
    ok: true;
    data: PaymentConfirmResponse;
  }>({
    path: '/checkout/payment-confirm',
    method: 'POST',
    sessionId: args.sessionId,
    idempotencyKey: createIdempotencyKey(`confirm_${args.orderId}`),
    body: {
      orderId: args.orderId,
      paymentIntentId: args.paymentIntentId,
    },
  });

  return response.data;
}
