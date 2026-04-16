import { NextResponse } from './next_server_compat';
import { z } from 'zod';

import { runtimeHandleProviderPaymentSucceeded } from './payment_runtime_store';

const webhookSchema = z.object({
  type: z.literal('notification'),
  event: z.enum(['payment.succeeded', 'payment.waiting_for_capture', 'payment.canceled']),
  object: z.object({
    id: z.string().min(1),
    status: z.enum(['pending', 'waiting_for_capture', 'succeeded', 'canceled']),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
});

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },
    },
    { status },
  );
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = webhookSchema.safeParse(rawBody);

    if (!parsed.success) {
      return errorResponse(400, 'VALIDATION_ERROR', 'Webhook validation failed.');
    }

    if (parsed.data.event !== 'payment.succeeded') {
      return NextResponse.json({
        ok: true,
        data: {
          ignored: true,
        },
      });
    }

    const result = await runtimeHandleProviderPaymentSucceeded({
      provider: 'yookassa',
      providerPaymentId: parsed.data.object.id,
    });

    return NextResponse.json({
      ok: true,
      data: {
        paymentId: result?.payment.id ?? null,
        orderId: result?.order.id ?? null,
        ticketId: result?.ticket.id ?? null,
        replayed: result?.replayed ?? false,
      },
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && 'status' in error) {
      return errorResponse(
        Number((error as { status: number }).status) || 500,
        String((error as { code: string }).code),
        error.message,
      );
    }

    return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'Unexpected YooKassa webhook error.');
  }
}
