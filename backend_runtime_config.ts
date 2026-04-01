const DEFAULT_ALLOWED_WEB_ORIGINS = [
  'https://mix7.ru',
  'https://www.mix7.ru',
  'https://mix7-frontend.vercel.app',
] as const;

export const DEFAULT_TICKET_QR_NAMESPACE = 'clubos:ticket';
export const DEFAULT_APP_ENV = 'production';
export const DEFAULT_ALLOWED_DEV_WEB_ORIGINS = [
  'http://127.0.0.1:3001',
  'http://localhost:3001',
] as const;

export type AppEnv = 'production' | 'development' | 'smoke';

export class BackendRuntimeConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackendRuntimeConfigError';
    this.code = code;
  }
}

export function parseAllowedWebOrigins(
  rawValue: string | undefined,
  fallbackOrigins: readonly string[] = DEFAULT_ALLOWED_WEB_ORIGINS,
): string[] {
  const values = rawValue
    ? rawValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : Array.from(fallbackOrigins);

  if (values.length === 0) {
    throw new BackendRuntimeConfigError(
      'ALLOWED_WEB_ORIGINS_EMPTY',
      'Allowed web origins must not be empty.',
    );
  }

  const normalized = values.map((value) => {
    if (value === '*') {
      throw new BackendRuntimeConfigError(
        'ALLOWED_WEB_ORIGINS_WILDCARD_FORBIDDEN',
        'Wildcard origin is not allowed.',
      );
    }

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BackendRuntimeConfigError(
        'ALLOWED_WEB_ORIGINS_INVALID',
        `Invalid allowed origin: ${value}`,
      );
    }

    if (url.pathname !== '/' || url.search || url.hash) {
      throw new BackendRuntimeConfigError(
        'ALLOWED_WEB_ORIGINS_INVALID',
        `Allowed origin must be origin-only: ${value}`,
      );
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BackendRuntimeConfigError(
        'ALLOWED_WEB_ORIGINS_INVALID',
        `Allowed origin must use http or https: ${value}`,
      );
    }

    return url.origin;
  });

  return Array.from(new Set(normalized));
}

export function parseAppEnv(rawValue: string | undefined): AppEnv {
  const value = rawValue?.trim() || DEFAULT_APP_ENV;

  if (
    value !== 'production' &&
    value !== 'development' &&
    value !== 'smoke'
  ) {
    throw new BackendRuntimeConfigError(
      'APP_ENV_INVALID',
      `Invalid APP_ENV: ${value}`,
    );
  }

  return value;
}

export function resolveAllowedWebOriginsByEnv(args?: {
  appEnv?: string | undefined;
  allowedWebOrigins?: string | undefined;
  allowedDevWebOrigins?: string | undefined;
}) {
  const appEnv = parseAppEnv(args?.appEnv ?? process.env.APP_ENV);
  const allowedWebOrigins = parseAllowedWebOrigins(
    args?.allowedWebOrigins ?? process.env.ALLOWED_WEB_ORIGINS,
    DEFAULT_ALLOWED_WEB_ORIGINS,
  );
  const allowedDevWebOrigins = parseAllowedWebOrigins(
    args?.allowedDevWebOrigins ?? process.env.ALLOWED_DEV_WEB_ORIGINS,
    DEFAULT_ALLOWED_DEV_WEB_ORIGINS,
  );

  return {
    appEnv,
    allowedWebOrigins,
    allowedDevWebOrigins,
    effectiveAllowedWebOrigins:
      appEnv === 'production'
        ? allowedWebOrigins
        : Array.from(new Set([...allowedWebOrigins, ...allowedDevWebOrigins])),
  } as const;
}

export function resolveBackendRuntimeConfig(args?: {
  appEnv?: string | undefined;
  allowedWebOrigins?: string | undefined;
  allowedDevWebOrigins?: string | undefined;
  ticketQrNamespace?: string | undefined;
}) {
  const originPolicy = resolveAllowedWebOriginsByEnv({
    appEnv: args?.appEnv,
    allowedWebOrigins: args?.allowedWebOrigins,
    allowedDevWebOrigins: args?.allowedDevWebOrigins,
  });

  const ticketQrNamespace =
    args?.ticketQrNamespace?.trim() ||
    process.env.TICKET_QR_NAMESPACE?.trim() ||
    DEFAULT_TICKET_QR_NAMESPACE;

  return {
    appEnv: originPolicy.appEnv,
    allowedWebOrigins: originPolicy.allowedWebOrigins,
    allowedDevWebOrigins: originPolicy.allowedDevWebOrigins,
    effectiveAllowedWebOrigins: originPolicy.effectiveAllowedWebOrigins,
    ticketQrNamespace,
  } as const;
}

export const BACKEND_RUNTIME_CONFIG = resolveBackendRuntimeConfig();
