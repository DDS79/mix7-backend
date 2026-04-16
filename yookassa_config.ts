export type YookassaConfig = {
  shopId: string;
  secretKey: string;
  returnUrl: string;
};

function readEnv(name: string) {
  return process.env[name]?.trim() ?? '';
}

export function readYookassaConfig(): YookassaConfig | null {
  const shopId = readEnv('YOOKASSA_SHOP_ID');
  const secretKey = readEnv('YOOKASSA_SECRET_KEY');
  const returnUrl = readEnv('YOOKASSA_RETURN_URL');

  if (!shopId || !secretKey || !returnUrl) {
    return null;
  }

  return {
    shopId,
    secretKey,
    returnUrl,
  };
}

export function resolveCheckoutProvider(): 'stub' | 'yookassa' {
  return readYookassaConfig() ? 'yookassa' : 'stub';
}
