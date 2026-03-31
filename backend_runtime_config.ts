const DEFAULT_ALLOWED_WEB_ORIGINS = [
  'https://mix7.ru',
  'https://www.mix7.ru',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
] as const;

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
): string[] {
  const values = rawValue
    ? rawValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : Array.from(DEFAULT_ALLOWED_WEB_ORIGINS);

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

export function resolveBackendRuntimeConfig(args?: {
  allowedWebOrigins?: string | undefined;
}) {
  const allowedWebOrigins = parseAllowedWebOrigins(
    args?.allowedWebOrigins ?? process.env.ALLOWED_WEB_ORIGINS,
  );

  return {
    allowedWebOrigins,
  } as const;
}

export const BACKEND_RUNTIME_CONFIG = resolveBackendRuntimeConfig();
