import 'dotenv/config';

const env = (k: string, d = '') => (process.env[k] ?? d).trim();

export const config = {
  port: Number(env('PORT', '8787')),
  publicUrl: (env('PUBLIC_URL') || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:5173')).replace(/\/$/, ''),
  shopName: env('SHOP_NAME', 'Ada Styles'),
  sellerEmail: env('SELLER_EMAIL'),
  ngnPerUsd: Number(env('NGN_PER_USD', '1550')) || 1550,
  paypal: {
    clientId: env('PAYPAL_CLIENT_ID'),
    clientSecret: env('PAYPAL_CLIENT_SECRET'),
    env: env('PAYPAL_ENV', 'sandbox') === 'live' ? 'live' : 'sandbox',
    payeeEmail: env('PAYPAL_PAYEE_EMAIL'),
    forceMock: env('PAYPAL_MODE') === 'mock',
  },
  ai: {
    provider: env('AI_PROVIDER', 'auto'),
    openaiKey: env('OPENAI_API_KEY'),
    openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
    openaiModel: env('OPENAI_MODEL', 'gpt-4o-mini'),
    geminiKey: env('GEMINI_API_KEY'),
    geminiModel: env('GEMINI_MODEL', 'gemini-2.0-flash'),
  },
};

export const paypalMode = (): 'sandbox' | 'live' | 'mock' =>
  config.paypal.forceMock || !config.paypal.clientId || !config.paypal.clientSecret ? 'mock' : (config.paypal.env as 'sandbox' | 'live');

export const paypalApiBase = () =>
  config.paypal.env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
