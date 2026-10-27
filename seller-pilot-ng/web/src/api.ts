export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export interface AppConfig {
  shopName: string;
  paypalMode: 'sandbox' | 'live' | 'mock';
  paypalClientId: string | null;
  aiEngine: string;
  ngnPerUsd: number;
  agentTools: string[];
  paypalToolkitTools: string[];
  payeeOverride: boolean;
}

export interface Product {
  id: string; slug: string; title: string; description: string; category: string; emoji: string;
  priceUsd: number; priceNgn?: number; stock: number; colors: string[]; sizes: string[]; delivery?: string;
  hashtags: string[]; caption: string; faq: { q: string; a: string }[]; views: number; source: string; sample?: boolean; createdAt: string;
}
export interface Order {
  id: string; paypalOrderId: string; productId: string; title: string; qty: number; amountUsd: number; status: string;
  approveUrl?: string; captureId?: string; buyerName?: string; buyerEmail?: string; channel: string; mock?: boolean; sample?: boolean; createdAt: string; capturedAt?: string;
}
export interface Invoice {
  id: string; paypalInvoiceId: string; number?: string; recipientName: string; recipientEmail: string; totalUsd: number; status: string;
  payerViewUrl?: string; qrPngBase64?: string; via: string; createdAt: string; items: { title: string; qty: number; unitUsd: number }[];
}
export interface Stats {
  revenueUsd: number; revenueNgn: number; paidOrders: number; pendingOrders: number; conversionRate: number; avgOrderUsd: number;
  topProduct?: { title: string; units: number; revenueUsd: number }; daily: { date: string; revenueUsd: number; orders: number }[];
  lowStock: { title: string; stock: number }[]; invoices: { sent: number; paid: number; outstandingUsd: number }; insights: string[]; hasSample: boolean;
}
export interface AgentAction { tool: string; via: string; summary: string; ok: boolean; ms: number }
export type AgentCard =
  | { type: 'listing'; product: Product }
  | { type: 'checkout'; product: Product; storefrontUrl: string; order?: Order; qrDataUrl?: string }
  | { type: 'invoice'; invoice: Invoice }
  | { type: 'summary'; stats: Stats }
  | { type: 'reply'; question: string; answer: string; product?: Product }
  | { type: 'order'; order: Order };
export interface AgentResult { reply: string; actions: AgentAction[]; cards: AgentCard[]; engine: string }

export const usd = (n: number) => `$${n.toFixed(2)}`;
export const ngn = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
export const price = (p: { priceUsd: number; priceNgn?: number }) => (p.priceNgn ? `${ngn(p.priceNgn)} · ${usd(p.priceUsd)}` : usd(p.priceUsd));
export const copy = (t: string) => navigator.clipboard?.writeText(t).catch(() => undefined);
export const whatsappShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
