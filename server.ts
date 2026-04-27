declare const require: any;
declare const module: any;
declare const process: any;

const http = require('node:http');

import { BACKEND_RUNTIME_CONFIG } from './backend_runtime_config';
import { GET as getAdminAuditLog } from './admin_audit_route';
import {
  GET as getAdminEvents,
  PATCH_BY_ID as patchAdminEventById,
  POST as postAdminEvents,
  POST_ARCHIVE as postAdminEventArchive,
  POST_CLOSE_SALES as postAdminEventCloseSales,
  POST_OPEN_SALES as postAdminEventOpenSales,
} from './admin_events_route';
import { GET as getHealth } from './health_route';
import { GET as getDebugSessionContext } from './debug_session_context_route';
import { POST as postCheckoutOrder } from './checkout_order_route';
import { GET as getEvents, GET_BY_SLUG as getEventBySlug } from './events_route';
import { POST as postPaymentConfirm } from './payment_confirm_route';
import { POST as postPaymentIntent } from './payment_intent_route';
import { POST as postRegistrations } from './registrations_route';
import { POST as postSessionIssue } from './session_issue_route';
import {
  POST_COMPLETE as postTelegramLoginHandoffComplete,
  POST_CREATE as postTelegramLoginHandoffCreate,
  POST_EXCHANGE as postTelegramLoginHandoffExchange,
} from './telegram_login_handoff_route';
import { GET as getTickets, GET_BY_ID as getTicketById } from './tickets_route';
import { POST as postYookassaWebhook } from './yookassa_webhook_route';

export const ALLOWED_CORS_ORIGINS = new Set(
  BACKEND_RUNTIME_CONFIG.effectiveAllowedWebOrigins,
);

type RouteHandler = (request: Request) => Promise<Response>;

function buildCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_CORS_ORIGINS.has(origin)) {
    return {};
  }

  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
    'access-control-allow-headers': 'Content-Type,x-session-id,Idempotency-Key',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

async function readBody(req: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function routeRequest(method: string, pathname: string): RouteHandler | null {
  if (method === 'GET' && pathname === '/') {
    return getHealth;
  }
  if (method === 'GET' && pathname === '/health') {
    return getHealth;
  }
  if (method === 'POST' && pathname === '/session/issue') {
    return postSessionIssue;
  }
  if (method === 'GET' && pathname === '/admin/events') {
    return getAdminEvents;
  }
  if (method === 'POST' && pathname === '/admin/events') {
    return postAdminEvents;
  }
  if (method === 'GET' && pathname === '/admin/audit-log') {
    return getAdminAuditLog;
  }
  if (method === 'POST' && pathname === '/webhooks/yookassa') {
    return postYookassaWebhook;
  }
  if (method === 'POST' && pathname === '/login/telegram/challenges') {
    return postTelegramLoginHandoffCreate;
  }
  if (method === 'POST' && pathname === '/login/telegram/exchange') {
    return postTelegramLoginHandoffExchange;
  }
  if (method === 'GET' && pathname === '/events') {
    return getEvents;
  }
  if (method === 'GET' && pathname === '/tickets') {
    return getTickets;
  }
  if (method === 'POST' && pathname === '/registrations') {
    return postRegistrations;
  }
  if (method === 'POST' && pathname === '/checkout/orders') {
    return postCheckoutOrder;
  }
  if (method === 'GET' && pathname === '/debug/session-context') {
    return getDebugSessionContext;
  }
  if (
    method === 'POST' &&
    (pathname === '/checkout/payment-intent' ||
      pathname === '/api/v1/checkout/orders/payment-intent')
  ) {
    return postPaymentIntent;
  }
  if (
    method === 'POST' &&
    (pathname === '/checkout/payment-confirm' ||
      pathname === '/api/v1/checkout/orders/payment-confirm')
  ) {
    return postPaymentConfirm;
  }
  if (
    method === 'POST' &&
    pathname.startsWith('/login/telegram/challenges/') &&
    pathname.endsWith('/complete')
  ) {
    const challengeId = pathname
      .slice('/login/telegram/challenges/'.length, -'/complete'.length)
      .trim();
    if (challengeId) {
      return async (request) => postTelegramLoginHandoffComplete(request, challengeId);
    }
  }
  if (method === 'GET' && pathname.startsWith('/events/')) {
    const slug = pathname.slice('/events/'.length).trim();
    if (slug) {
      return async (request) => getEventBySlug(request, slug);
    }
  }
  if (method === 'GET' && pathname.startsWith('/tickets/')) {
    const ticketId = pathname.slice('/tickets/'.length).trim();
    if (ticketId) {
      return async (request) => getTicketById(request, ticketId);
    }
  }
  if (
    pathname.startsWith('/admin/events/') &&
    pathname.endsWith('/open-sales') &&
    method === 'POST'
  ) {
    const eventId = pathname
      .slice('/admin/events/'.length, -'/open-sales'.length)
      .trim();
    if (eventId) {
      return async (request) => postAdminEventOpenSales(request, eventId);
    }
  }
  if (
    pathname.startsWith('/admin/events/') &&
    pathname.endsWith('/close-sales') &&
    method === 'POST'
  ) {
    const eventId = pathname
      .slice('/admin/events/'.length, -'/close-sales'.length)
      .trim();
    if (eventId) {
      return async (request) => postAdminEventCloseSales(request, eventId);
    }
  }
  if (
    pathname.startsWith('/admin/events/') &&
    pathname.endsWith('/archive') &&
    method === 'POST'
  ) {
    const eventId = pathname
      .slice('/admin/events/'.length, -'/archive'.length)
      .trim();
    if (eventId) {
      return async (request) => postAdminEventArchive(request, eventId);
    }
  }
  if (method === 'PATCH' && pathname.startsWith('/admin/events/')) {
    const eventId = pathname.slice('/admin/events/'.length).trim();
    if (eventId && !eventId.includes('/')) {
      return async (request) => patchAdminEventById(request, eventId);
    }
  }

  return null;
}

function applyCors(response: Response, origin: string | null) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(buildCorsHeaders(origin))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function requestExecutionErrorResponse(origin: string | null, error: unknown) {
  return applyCors(
    Response.json(
      {
        error: {
          code: 'REQUEST_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unexpected request execution error.',
        },
      },
      { status: 500 },
    ),
    origin,
  );
}

export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(origin),
    });
  }

  const handler = routeRequest(request.method, url.pathname);
  if (!handler) {
    return applyCors(
      Response.json(
        {
          error: {
            code: 'ROUTE_NOT_FOUND',
            message: 'Route not found.',
          },
        },
        { status: 404 },
      ),
      origin,
    );
  }

  return applyCors(await handler(request), origin);
}

export function createHttpService() {
  return http.createServer(async (req: any, res: any) => {
    const method = req.method ?? 'GET';
    const host = req.headers.host ?? `127.0.0.1:${process.env.PORT ?? '3000'}`;
    const url = new URL(req.url ?? '/', `http://${host}`);
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null;

    if (method === 'OPTIONS') {
      const headers = buildCorsHeaders(origin);
      res.writeHead(204, headers);
      res.end();
      return;
    }

    try {
      const body = method === 'GET' ? undefined : await readBody(req);
      const request = new Request(url.toString(), {
        method,
        headers: req.headers as HeadersInit,
        body: body && body.length > 0 ? new Uint8Array(body) : undefined,
      });
      const response = await handleApiRequest(request);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      const responseBody = Buffer.from(await response.arrayBuffer());
      res.end(responseBody);
    } catch (error) {
      const response = requestExecutionErrorResponse(origin, error);
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      const responseBody = Buffer.from(await response.arrayBuffer());
      res.end(responseBody);
    }
  });
}

export async function startHttpService(port = Number(process.env.PORT ?? '3000')) {
  const server = createHttpService();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

if (require.main === module) {
  startHttpService()
    .then((server) => {
      const address = server.address();
      const port =
        address && typeof address === 'object' && 'port' in address
          ? address.port
          : process.env.PORT;
      console.log(`mix7-backend-api listening on ${port}`);
    })
    .catch((error) => {
      console.error(
        JSON.stringify({
          error: {
            code: 'APP_BOOT_FAILURE',
            message: error instanceof Error ? error.message : 'HTTP service failed to start.',
          },
        }),
      );
      process.exitCode = 1;
    });
}
