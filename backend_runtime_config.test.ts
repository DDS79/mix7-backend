import {
  BackendRuntimeConfigError,
  parseAllowedWebOrigins,
  resolveBackendRuntimeConfig,
} from './backend_runtime_config';

describe('backend runtime config', () => {
  it('uses explicit default allowed origins without wildcard fallback', () => {
    const config = resolveBackendRuntimeConfig({
      allowedWebOrigins: undefined,
    });

    expect(config.allowedWebOrigins).toEqual([
      'https://mix7.ru',
      'https://www.mix7.ru',
      'http://127.0.0.1:3001',
      'http://localhost:3001',
    ]);
  });

  it('parses comma-separated allowlist deterministically', () => {
    expect(
      parseAllowedWebOrigins(
        'https://mix7.ru, https://www.mix7.ru, http://127.0.0.1:3001, https://mix7.ru',
      ),
    ).toEqual([
      'https://mix7.ru',
      'https://www.mix7.ru',
      'http://127.0.0.1:3001',
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
});
