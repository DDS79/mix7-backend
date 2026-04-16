import { dbQuery, withDbTransaction } from './db/client';
import { hashRequest } from './test_stubs/idempotency';

export type RuntimeOrderStatus = 'pending_payment' | 'paid' | 'failed';
export type RuntimePaymentStatus = 'pending' | 'succeeded' | 'failed';

export type RuntimeOrderRecord = {
  id: string;
  actorId: string;
  registrationId: string;
  buyerId: string;
  eventId: string;
  totalMinor: number;
  currency: string;
  status: RuntimeOrderStatus;
  paymentProvider: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RuntimePaymentCoreRecord = {
  id: string;
  orderId: string;
  buyerId: string;
  eventId: string;
  amount: number;
  currency: string;
  provider: 'stub' | 'yookassa';
  providerPaymentId: string | null;
  intentId: string | null;
  confirmationUrl: string | null;
  status: RuntimePaymentStatus;
  createdAt: string;
  updatedAt: string;
};

export type PersistOrderInput = {
  id: string;
  actorId: string;
  registrationId: string;
  buyerId: string;
  eventId: string;
  totalMinor: number;
  currency: string;
  status: RuntimeOrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type PersistPaymentInput = {
  id: string;
  orderId: string;
  provider: 'stub' | 'yookassa';
  providerPaymentId: string | null;
  intentId: string | null;
  confirmationUrl: string | null;
  status: RuntimePaymentStatus;
  createdAt: string;
  updatedAt: string;
};

type PaymentCoreStore = {
  persistOrder: (order: PersistOrderInput) => Promise<RuntimeOrderRecord>;
  loadOrder: (
    orderId: string,
    buyerId: string,
  ) => Promise<RuntimeOrderRecord | null>;
  loadOrderById: (orderId: string) => Promise<RuntimeOrderRecord | null>;
  updateOrderStatus: (
    orderId: string,
    status: RuntimeOrderStatus,
  ) => Promise<RuntimeOrderRecord | null>;
  updateOrderCurrency: (
    orderId: string,
    currency: string,
  ) => Promise<RuntimeOrderRecord | null>;
  persistPayment: (
    payment: PersistPaymentInput,
  ) => Promise<RuntimePaymentCoreRecord>;
  loadPaymentByOrder: (
    orderId: string,
    buyerId: string,
  ) => Promise<RuntimePaymentCoreRecord | null>;
  loadPaymentByOrderAny: (
    orderId: string,
  ) => Promise<RuntimePaymentCoreRecord | null>;
  loadPaymentByProviderPaymentId: (
    provider: 'stub' | 'yookassa',
    providerPaymentId: string,
  ) => Promise<RuntimePaymentCoreRecord | null>;
  updatePaymentStatus: (
    paymentId: string,
    status: RuntimePaymentStatus,
  ) => Promise<RuntimePaymentCoreRecord | null>;
  updatePaymentProviderLink: (args: {
    paymentId: string;
    providerPaymentId: string;
    confirmationUrl: string | null;
  }) => Promise<RuntimePaymentCoreRecord | null>;
};

type OrderRow = {
  id: string;
  actor_id: string;
  registration_id: string;
  event_id: string;
  amount: number;
  currency: string;
  status: RuntimeOrderStatus;
  created_at: Date | string;
  updated_at: Date | string;
  buyer_ref: string;
  payment_provider: string | null;
};

type PaymentRow = {
  id: string;
  order_id: string;
  provider: 'stub' | 'yookassa';
  provider_payment_id: string | null;
  intent_id: string | null;
  confirmation_url: string | null;
  status: RuntimePaymentStatus;
  created_at: Date | string;
  updated_at: Date | string;
  buyer_ref: string;
  event_id: string;
  amount: number;
  currency: string;
};

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapOrderRow(row: OrderRow): RuntimeOrderRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    registrationId: row.registration_id,
    buyerId: row.buyer_ref,
    eventId: row.event_id,
    totalMinor: row.amount,
    currency: row.currency,
    status: row.status,
    paymentProvider: row.payment_provider,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapPaymentRow(row: PaymentRow): RuntimePaymentCoreRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    buyerId: row.buyer_ref,
    eventId: row.event_id,
    amount: row.amount,
    currency: row.currency,
    provider: row.provider,
    providerPaymentId: row.provider_payment_id,
    intentId: row.intent_id,
    confirmationUrl: row.confirmation_url,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function buildActorIdFromBuyerRef(buyerRef: string) {
  return `act_${hashRequest({ buyerRef }).slice(0, 24)}`;
}

function buildStandaloneRegistrationRef(args: {
  buyerId: string;
  eventId: string;
  orderId: string;
}) {
  return `reg_${hashRequest({
    buyerId: args.buyerId,
    eventId: args.eventId,
    orderId: args.orderId,
    kind: 'checkout_standalone_order',
  }).slice(0, 24)}`;
}

function createMemoryPaymentCoreStore(): PaymentCoreStore & {
  resetForTests: () => void;
} {
  const orders = new Map<string, RuntimeOrderRecord>();
  const payments = new Map<string, RuntimePaymentCoreRecord>();

  return {
    persistOrder: async (order) => {
      const record: RuntimeOrderRecord = {
        id: order.id,
        actorId: order.actorId,
        registrationId: order.registrationId,
        buyerId: order.buyerId,
        eventId: order.eventId,
        totalMinor: order.totalMinor,
        currency: order.currency,
        status: order.status,
        paymentProvider: null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      };
      orders.set(record.id, record);
      return record;
    },
    loadOrder: async (orderId, buyerId) => {
      const order = orders.get(orderId) ?? null;
      return order && order.buyerId === buyerId ? order : null;
    },
    loadOrderById: async (orderId) => orders.get(orderId) ?? null,
    updateOrderStatus: async (orderId, status) => {
      const order = orders.get(orderId);
      if (!order) {
        return null;
      }
      const next = {
        ...order,
        status,
        updatedAt: new Date().toISOString(),
      };
      orders.set(orderId, next);
      return next;
    },
    updateOrderCurrency: async (orderId, currency) => {
      const order = orders.get(orderId);
      if (!order) {
        return null;
      }
      const next = {
        ...order,
        currency,
        updatedAt: new Date().toISOString(),
      };
      orders.set(orderId, next);
      return next;
    },
    persistPayment: async (payment) => {
      const order = orders.get(payment.orderId);
      if (!order) {
        throw new Error(`Order not found for payment ${payment.orderId}`);
      }
      const record: RuntimePaymentCoreRecord = {
        id: payment.id,
        orderId: payment.orderId,
        buyerId: order.buyerId,
        eventId: order.eventId,
        amount: order.totalMinor,
        currency: order.currency,
        provider: payment.provider,
        providerPaymentId: payment.providerPaymentId,
        intentId: payment.intentId,
        confirmationUrl: payment.confirmationUrl,
        status: payment.status,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      };
      payments.set(record.id, record);
      orders.set(order.id, {
        ...order,
        paymentProvider: payment.provider,
      });
      return record;
    },
    loadPaymentByOrder: async (orderId, buyerId) => {
      for (const payment of payments.values()) {
        if (payment.orderId === orderId && payment.buyerId === buyerId) {
          return payment;
        }
      }
      return null;
    },
    loadPaymentByOrderAny: async (orderId) => {
      for (const payment of payments.values()) {
        if (payment.orderId === orderId) {
          return payment;
        }
      }
      return null;
    },
    loadPaymentByProviderPaymentId: async (provider, providerPaymentId) => {
      for (const payment of payments.values()) {
        if (
          payment.provider === provider &&
          payment.providerPaymentId === providerPaymentId
        ) {
          return payment;
        }
      }
      return null;
    },
    updatePaymentStatus: async (paymentId, status) => {
      const payment = payments.get(paymentId);
      if (!payment) {
        return null;
      }
      const next = {
        ...payment,
        status,
        updatedAt: new Date().toISOString(),
      };
      payments.set(paymentId, next);
      return next;
    },
    updatePaymentProviderLink: async ({
      paymentId,
      providerPaymentId,
      confirmationUrl,
    }) => {
      const payment = payments.get(paymentId);
      if (!payment) {
        return null;
      }
      const next = {
        ...payment,
        providerPaymentId,
        confirmationUrl,
        updatedAt: new Date().toISOString(),
      };
      payments.set(paymentId, next);
      return next;
    },
    resetForTests: () => {
      orders.clear();
      payments.clear();
    },
  };
}

function selectOrderSql(whereClause: string) {
  return `SELECT
    o.id,
    o.actor_id,
    o.registration_id,
    o.event_id,
    o.amount,
    o.currency,
    o.status,
    o.created_at,
    o.updated_at,
    a.buyer_ref,
    p.provider AS payment_provider
  FROM orders o
  JOIN actors a ON a.id = o.actor_id
  LEFT JOIN payments p ON p.order_id = o.id
  ${whereClause}`;
}

function selectPaymentSql(whereClause: string) {
  return `SELECT
    p.id,
    p.order_id,
    p.provider,
    p.provider_payment_id,
    p.intent_id,
    p.confirmation_url,
    p.status,
    p.created_at,
    p.updated_at,
    a.buyer_ref,
    o.event_id,
    o.amount,
    o.currency
  FROM payments p
  JOIN orders o ON o.id = p.order_id
  JOIN actors a ON a.id = o.actor_id
  ${whereClause}`;
}

function createPostgresPaymentCoreStore(): PaymentCoreStore {
  return {
    persistOrder: async (order) =>
      withDbTransaction(async (client) => {
        await client.query(
          `INSERT INTO orders (
             id, actor_id, registration_id, event_id, amount, currency, status, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)`,
          [
            order.id,
            order.actorId,
            order.registrationId,
            order.eventId,
            order.totalMinor,
            order.currency,
            order.status,
            order.createdAt,
            order.updatedAt,
          ],
        );
        const result = await client.query<OrderRow>(
          selectOrderSql('WHERE o.id = $1'),
          [order.id],
        );
        return mapOrderRow(result.rows[0]);
      }),
    loadOrder: async (orderId, buyerId) => {
      const result = await dbQuery<OrderRow>(
        selectOrderSql('WHERE o.id = $1 AND a.buyer_ref = $2'),
        [orderId, buyerId],
      );
      return result.rows[0] ? mapOrderRow(result.rows[0]) : null;
    },
    loadOrderById: async (orderId) => {
      const result = await dbQuery<OrderRow>(
        selectOrderSql('WHERE o.id = $1'),
        [orderId],
      );
      return result.rows[0] ? mapOrderRow(result.rows[0]) : null;
    },
    updateOrderStatus: async (orderId, status) =>
      withDbTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE orders
           SET status = $2, updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [orderId, status],
        );
        if (updated.rowCount === 0) {
          return null;
        }
        const fresh = await client.query<OrderRow>(
          selectOrderSql('WHERE o.id = $1'),
          [orderId],
        );
        return fresh.rows[0] ? mapOrderRow(fresh.rows[0]) : null;
      }),
    updateOrderCurrency: async (orderId, currency) =>
      withDbTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE orders
           SET currency = $2, updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [orderId, currency],
        );
        if (updated.rowCount === 0) {
          return null;
        }
        const fresh = await client.query<OrderRow>(
          selectOrderSql('WHERE o.id = $1'),
          [orderId],
        );
        return fresh.rows[0] ? mapOrderRow(fresh.rows[0]) : null;
      }),
    persistPayment: async (payment) =>
      withDbTransaction(async (client) => {
        await client.query(
          `INSERT INTO payments (
             id, order_id, provider, provider_payment_id, intent_id, confirmation_url, status, created_at, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz)`,
          [
            payment.id,
            payment.orderId,
            payment.provider,
            payment.providerPaymentId,
            payment.intentId,
            payment.confirmationUrl,
            payment.status,
            payment.createdAt,
            payment.updatedAt,
          ],
        );
        const result = await client.query<PaymentRow>(
          selectPaymentSql('WHERE p.id = $1'),
          [payment.id],
        );
        return mapPaymentRow(result.rows[0]);
      }),
    loadPaymentByOrder: async (orderId, buyerId) => {
      const result = await dbQuery<PaymentRow>(
        `${selectPaymentSql('WHERE p.order_id = $1 AND a.buyer_ref = $2')}
         ORDER BY p.created_at ASC
         LIMIT 1`,
        [orderId, buyerId],
      );
      return result.rows[0] ? mapPaymentRow(result.rows[0]) : null;
    },
    loadPaymentByOrderAny: async (orderId) => {
      const result = await dbQuery<PaymentRow>(
        `${selectPaymentSql('WHERE p.order_id = $1')}
         ORDER BY p.created_at ASC
         LIMIT 1`,
        [orderId],
      );
      return result.rows[0] ? mapPaymentRow(result.rows[0]) : null;
    },
    loadPaymentByProviderPaymentId: async (provider, providerPaymentId) => {
      const result = await dbQuery<PaymentRow>(
        `${selectPaymentSql('WHERE p.provider = $1 AND p.provider_payment_id = $2')}
         ORDER BY p.created_at ASC
         LIMIT 1`,
        [provider, providerPaymentId],
      );
      return result.rows[0] ? mapPaymentRow(result.rows[0]) : null;
    },
    updatePaymentStatus: async (paymentId, status) =>
      withDbTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE payments
           SET status = $2, updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [paymentId, status],
        );
        if (updated.rowCount === 0) {
          return null;
        }
        const fresh = await client.query<PaymentRow>(
          selectPaymentSql('WHERE p.id = $1'),
          [paymentId],
        );
        return fresh.rows[0] ? mapPaymentRow(fresh.rows[0]) : null;
      }),
    updatePaymentProviderLink: async ({
      paymentId,
      providerPaymentId,
      confirmationUrl,
    }) =>
      withDbTransaction(async (client) => {
        const updated = await client.query(
          `UPDATE payments
           SET provider_payment_id = $2,
               confirmation_url = $3,
               updated_at = now()
           WHERE id = $1
           RETURNING id`,
          [paymentId, providerPaymentId, confirmationUrl],
        );
        if (updated.rowCount === 0) {
          return null;
        }
        const fresh = await client.query<PaymentRow>(
          selectPaymentSql('WHERE p.id = $1'),
          [paymentId],
        );
        return fresh.rows[0] ? mapPaymentRow(fresh.rows[0]) : null;
      }),
  };
}

const memoryPaymentCoreStore =
  process.env.NODE_ENV === 'test' ? createMemoryPaymentCoreStore() : null;

export const paymentCoreStore: PaymentCoreStore =
  memoryPaymentCoreStore ?? createPostgresPaymentCoreStore();

export function resetPaymentCoreStoreForTests() {
  memoryPaymentCoreStore?.resetForTests();
}

export function normalizeRuntimeOrderInput(input: {
  id: string;
  buyerId: string;
  eventId: string;
  totalMinor: number;
  actorId?: string;
  registrationId?: string;
  currency?: string;
}) {
  return {
    id: input.id,
    actorId: input.actorId ?? buildActorIdFromBuyerRef(input.buyerId),
    registrationId:
      input.registrationId ??
      buildStandaloneRegistrationRef({
        buyerId: input.buyerId,
        eventId: input.eventId,
        orderId: input.id,
      }),
    buyerId: input.buyerId,
    eventId: input.eventId,
    totalMinor: input.totalMinor,
    currency: input.currency ?? 'RUB',
  } as const;
}
