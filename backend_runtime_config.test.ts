import {
  BackendRuntimeConfigError,
  DEFAULT_ALLOWED_DEV_WEB_ORIGINS,
  DEFAULT_TICKET_QR_NAMESPACE,
  parseAllowedWebOrigins,
  parseAppEnv,
  resolveAllowedWebOriginsByEnv,
  resolveBackendRuntimeConfig,
} from './backend_runtime_config';

describe('backend runtime config', () => {
  it('uses strict production defaults without dev-origin leakage', () => {
    const config = resolveBackendRuntimeConfig({
      appEnv: undefined,
      allowedWebOrigins: undefined,
      allowedDevWebOrigins: undefined,
      ticketQrNamespace: undefined,
    });

    expect(config.appEnv).toBe('production');
    expect(config.allowedWebOrigins).toEqual([
      'https://mix7.ru',
      'https://www.mix7.ru',
      'https://mix7-frontend.vercel.app',
    ]);
    expect(config.allowedDevWebOrigins).toEqual(
      Array.from(DEFAULT_ALLOWED_DEV_WEB_ORIGINS),
    );
    expect(config.effectiveAllowedWebOrigins).toEqual([
      'https://mix7.ru',
      'https://www.mix7.ru',
      'https://mix7-frontend.vercel.app',
    ]);
    expect(config.ticketQrNamespace).toBe(DEFAULT_TICKET_QR_NAMESPACE);
  });

  it('adds explicit dev origins only in development mode', () => {
    const config = resolveAllowedWebOriginsByEnv({
      appEnv: 'development',
      allowedWebOrigins:
        'https://mix7.ru, https://www.mix7.ru, https://mix7-frontend.vercel.app',
      allowedDevWebOrigins: 'http://127.0.0.1:3001, http://localhost:3001',
    });

    expect(config.effectiveAllowedWebOrigins).toEqual([
      'https://mix7.ru',
      'https://www.mix7.ru',
      'https://mix7-frontend.vercel.app',
      'http://127.0.0.1:3001',
      'http://localhost:3001',
    ]);
  });

  it('adds explicit dev origins only in smoke mode', () => {
    const config = resolveAllowedWebOriginsByEnv({
      appEnv: 'smoke',
      allowedWebOrigins: 'https://mix7.ru, https://mix7-frontend.vercel.app',
      allowedDevWebOrigins: 'http://127.0.0.1:3001',
    });

    expect(config.effectiveAllowedWebOrigins).toEqual([
      'https://mix7.ru',
      'https://mix7-frontend.vercel.app',
      'http://127.0.0.1:3001',
    ]);
  });

  it('parses comma-separated allowlists deterministically', () => {
    expect(
      parseAllowedWebOrigins(
        'https://mix7.ru, https://www.mix7.ru, https://mix7-frontend.vercel.app, https://mix7.ru',
      ),
    ).toEqual([
      'https://mix7.ru',
      'https://www.mix7.ru',
      'https://mix7-frontend.vercel.app',
    ]);
  });

  it('rejects wildcard origins', () => {
    expect(() => parseAllowedWebOrigins('*')).toThrow(BackendRuntimeConfigError);
    expect(() => parseAllowedWebOrigins('*')).toThrow(
      'Wildcard origin is not allowed.',
    );
  });

  it('rejects non-origin values with paths', () => {
    expect(() => parseAllowedWebOrigins('https://mix7.ru/path')).toThrow(
      BackendRuntimeConfigError,
    );
  });

  it('rejects origins with query strings', () => {
    expect(() => parseAllowedWebOrigins('https://mix7.ru?x=1')).toThrow(
      BackendRuntimeConfigError,
    );
  });

  it('rejects origins with fragments', () => {
    expect(() => parseAllowedWebOrigins('https://mix7.ru#hash')).toThrow(
      BackendRuntimeConfigError,
    );
  });

  it('rejects invalid origin strings', () => {
    expect(() => parseAllowedWebOrigins('not-a-url')).toThrow(
      BackendRuntimeConfigError,
    );
  });

  it('rejects invalid APP_ENV values', () => {
    expect(() => parseAppEnv('staging')).toThrow(BackendRuntimeConfigError);
    expect(() => parseAppEnv('staging')).toThrow('Invalid APP_ENV: staging');
  });
});
