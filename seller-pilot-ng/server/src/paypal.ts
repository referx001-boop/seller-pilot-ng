/**
 * PayPal integration.
 *  - Orders v2 (create / get / capture) via direct REST calls, so we can set a payee,
 *    brand name and return URLs for the buyer storefront + agent-generated pay links.
 *  - Invoicing via the official PayPal Agent Toolkit (@paypal/agent-toolkit) tool calls
 *    (create_invoice -> send_invoice -> generate_invoice_qr_code -> get_invoice).
 *  - A clearly labelled "mock" mode when no credentials are configured so the UI still runs offline.
 */
import crypto from 'node:crypto';
import type { PayPalAgentToolkit } from '@paypal/agent-toolkit/openai';
import { config, paypalApiBase, paypalMode } from './config.js';

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString('base64');
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new PayPalError(`OAuth failed: ${data.error_description || res.status}`, res.status, data);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

export class PayPalError extends Error {
  constructor(message: string, public status: number, public details?: unknown) { super(message); }
}

async function pp<T = any>(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue = data?.details?.[0]?.issue || data?.name || res.status;
    throw new PayPalError(`PayPal ${method} ${path} failed: ${issue}`, res.status, data);
  }
  return data as T;
}

export interface CreateOrderInput {
  referenceId: string;
  items: { name: string; qty: number; unitUsd: number; description?: string; sku?: string }[];
  returnUrl: string;
  cancelUrl: string;
  description?: string;
  /** true: hosted redirect flow (pay link). false: JS SDK Smart Buttons popup flow. */
  redirect?: boolean;
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export async function createOrder(input: CreateOrderInput): Promise<{ id: string; status: string; approveUrl?: string; mock?: boolean }> {
  const total = input.items.reduce((s, i) => s + i.unitUsd * i.qty, 0);
  if (paypalMode() === 'mock') {
    const id = 'MOCK' + crypto.randomBytes(7).toString('hex').toUpperCase();
    return { id, status: 'PAYER_ACTION_REQUIRED', approveUrl: `${input.returnUrl}${input.returnUrl.includes('?') ? '&' : '?'}token=${id}&mock=1`, mock: true };
  }
  const purchaseUnit: any = {
    reference_id: input.referenceId,
    description: (input.description || input.items[0]?.name || 'SellerPilot order').slice(0, 127),
    custom_id: input.referenceId,
    amount: {
      currency_code: 'USD',
      value: money(total),
      breakdown: { item_total: { currency_code: 'USD', value: money(total) } },
    },
    items: input.items.map((i) => ({
      name: i.name.slice(0, 127),
      quantity: String(i.qty),
      description: i.description?.slice(0, 127),
      sku: i.sku,
      unit_amount: { currency_code: 'USD', value: money(i.unitUsd) },
      category: 'PHYSICAL_GOODS',
    })),
  };
  if (config.paypal.payeeEmail) purchaseUnit.payee = { email_address: config.paypal.payeeEmail };
  const order = await pp('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [purchaseUnit],
    ...(input.redirect === false ? {} : { payment_source: {
      paypal: {
        experience_context: {
          brand_name: config.shopName.slice(0, 127),
          user_action: 'PAY_NOW',
          shipping_preference: 'NO_SHIPPING',
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    } }),
  }, { 'PayPal-Request-Id': `sp-${input.referenceId}` });
  const approveUrl = order.links?.find((l: any) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  return { id: order.id, status: order.status, approveUrl };
}

export async function getOrder(id: string) {
  if (id.startsWith('MOCK')) return { id, status: 'APPROVED', mock: true };
  return pp('GET', `/v2/checkout/orders/${id}`);
}

export async function captureOrder(id: string): Promise<{ status: string; captureId?: string; payerName?: string; payerEmail?: string; amount?: string; raw?: any }> {
  if (id.startsWith('MOCK')) {
    return { status: 'COMPLETED', captureId: 'MOCKCAP' + crypto.randomBytes(5).toString('hex').toUpperCase(), payerName: 'Demo Buyer', payerEmail: 'buyer@example.com' };
  }
  const data = await pp('POST', `/v2/checkout/orders/${id}/capture`, undefined, { 'PayPal-Request-Id': `cap-${id}` });
  const cap = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: data.status,
    captureId: cap?.id,
    amount: cap?.amount?.value,
    payerName: [data.payer?.name?.given_name, data.payer?.name?.surname].filter(Boolean).join(' ') || undefined,
    payerEmail: data.payer?.email_address,
    raw: { id: data.id, status: data.status, capture_status: cap?.status },
  };
}

/* ------------------------------------------------------------------ */
/* PayPal Agent Toolkit (official) — used for invoicing tool calls      */
/* ------------------------------------------------------------------ */
let toolkit: PayPalAgentToolkit | null = null;

let toolkitLoading: Promise<typeof import('@paypal/agent-toolkit/openai')> | null = null;
/** The toolkit pulls in large deps (langchain, mathjs…), so it is loaded lazily and warmed up after boot. */
export function warmToolkit() {
  toolkitLoading ??= import('@paypal/agent-toolkit/openai');
  return toolkitLoading;
}

async function getToolkit(): Promise<PayPalAgentToolkit> {
  if (!toolkit) {
    const { PayPalAgentToolkit } = await warmToolkit();
    toolkit = new PayPalAgentToolkit({
      clientId: config.paypal.clientId,
      clientSecret: config.paypal.clientSecret,
      configuration: {
        actions: {
          invoices: { create: true, send: true, get: true, list: true, generateQRC: true, sendReminder: true },
          orders: { get: true },
        },
        context: { sandbox: config.paypal.env !== 'live' },
      },
    });
    // Share our cached OAuth token with the toolkit instead of letting it fetch its own each process.
    const client: any = toolkit.client;
    client.getAccessToken = () => getAccessToken();
  }
  // tokens expire; let the toolkit re-read ours on every call
  (toolkit.client as any)._accessToken = undefined;
  return toolkit;
}

/** Execute one PayPal Agent Toolkit tool call (same shape an LLM would emit). */
export async function toolkitCall(name: string, args: Record<string, unknown>): Promise<any> {
  const tk = await getToolkit();
  const result: any = await tk.handleToolCall({
    id: `call_${crypto.randomBytes(4).toString('hex')}`,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  } as any);
  const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
  let parsed: any;
  try { parsed = JSON.parse(content); } catch { parsed = content; }
  if (parsed && typeof parsed === 'object' && parsed.error) throw new PayPalError(`Agent Toolkit ${name}: ${parsed.error.message || 'error'}`, 400, parsed.error);
  return parsed;
}

/** Names of the Agent Toolkit tools this app enables (shown on the About screen). */
export async function toolkitToolNames(): Promise<string[]> {
  if (!toolkit) return [];
  try { return (await getToolkit()).getTools().map((t: any) => t.function.name); } catch { return []; }
}

export interface InvoiceInput {
  recipientName: string;
  recipientEmail: string;
  items: { name: string; qty: number; unitUsd: number }[];
  note?: string;
}

export async function createAndSendInvoice(input: InvoiceInput): Promise<{ id: string; number?: string; status: string; payerViewUrl?: string; qrPngBase64?: string; mock?: boolean }> {
  if (paypalMode() === 'mock') {
    const id = 'INV2-MOCK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    return { id, status: 'SENT', payerViewUrl: undefined, mock: true };
  }
  const [given, ...rest] = input.recipientName.trim().split(/\s+/);
  const created = await toolkitCall('create_invoice', {
    currency_code: 'USD',
    invoicer_business_name: config.shopName,
    ...(config.sellerEmail ? { invoicer_email_address: config.sellerEmail } : {}),
    primary_recipients: [{ billing_info: { name: { given_name: given || 'Customer', surname: rest.join(' ') || undefined }, email_address: input.recipientEmail } }],
    items: input.items.map((i) => ({ name: i.name.slice(0, 200), quantity: String(i.qty), unit_amount: { currency_code: 'USD', value: money(i.unitUsd) } })),
    note: input.note || `Thank you for shopping with ${config.shopName}!`,
  });
  const href: string = created?.href || '';
  const id = href.split('/').pop() || created?.id;
  if (!id) throw new PayPalError('Agent Toolkit create_invoice returned no id', 500, created);
  const sent = await toolkitCall('send_invoice', { invoice_id: id, send_to_recipient: true });
  let qrPngBase64: string | undefined;
  try {
    const qr = await toolkitCall('generate_invoice_qr_code', { invoice_id: id, width: 300, height: 300 });
    const m = String(qr).match(/\r?\n\r?\n([A-Za-z0-9+/=]{100,})/);
    if (m) qrPngBase64 = m[1];
  } catch { /* QR is a nice-to-have */ }
  const detail = await toolkitCall('get_invoice', { invoice_id: id }).catch(() => null);
  return {
    id,
    number: detail?.detail?.invoice_number,
    status: detail?.status || 'SENT',
    payerViewUrl: detail?.detail?.metadata?.recipient_view_url || sent?.href,
    qrPngBase64,
  };
}

export async function getInvoiceStatus(id: string): Promise<string> {
  if (id.includes('MOCK')) return 'SENT';
  const d = await toolkitCall('get_invoice', { invoice_id: id });
  return d?.status || 'UNKNOWN';
}
