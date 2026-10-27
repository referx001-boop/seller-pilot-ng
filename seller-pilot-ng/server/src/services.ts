import QRCode from 'qrcode';
import { config } from './config.js';
import { store, uid } from './store.js';
import * as paypal from './paypal.js';
import { draftListing, replyToBuyer } from './ai/copilot.js';
import { round2 } from './ai/rules.js';
import type { DashboardStats, Invoice, Order, Product } from './types.js';

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export const storefrontUrl = (p: Product) => `${config.publicUrl}/p/${p.slug}`;

export async function createProductFromText(text: string): Promise<{ product: Product; warnings: string[] }> {
  const d = await draftListing(text);
  let slug = slugify(d.title) || 'item';
  if (store.findProduct(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const product: Product = {
    id: uid('prd'), slug, title: d.title, description: d.description, category: d.category, emoji: d.emoji,
    priceUsd: d.priceUsd, priceNgn: d.priceNgn, stock: d.stock, colors: d.colors, sizes: d.sizes, delivery: d.delivery,
    hashtags: d.hashtags, caption: d.caption, faq: d.faq, rawInput: text, source: d.source, views: 0, createdAt: new Date().toISOString(),
  };
  store.addProduct(product);
  return { product, warnings: d.warnings };
}

export async function qrDataUrl(text: string) {
  return QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: '#0b1f3a', light: '#ffffff' } });
}

/** Create a PayPal Orders v2 order for a product. Used by the storefront button and by the agent's pay links. */
export async function createCheckout(productIdOrSlug: string, qty = 1, channel: Order['channel'] = 'storefront', color?: string, size?: string, redirect = true): Promise<Order> {
  const p = store.findProduct(productIdOrSlug);
  if (!p) throw new Error('Product not found');
  if (p.priceUsd <= 0) throw new Error('This product has no price yet');
  qty = Math.max(1, Math.min(qty, Math.max(1, p.stock), 50));
  if (p.stock <= 0) throw new Error('Out of stock');
  const localId = uid('ord');
  const variant = [color, size].filter(Boolean).join(' / ');
  const pp = await paypal.createOrder({
    referenceId: localId,
    items: [{ name: p.title + (variant ? ` (${variant})` : ''), qty, unitUsd: p.priceUsd, sku: p.id, description: p.category }],
    description: `${config.shopName}: ${p.title}`,
    returnUrl: `${config.publicUrl}/paid?order=${localId}`,
    cancelUrl: `${config.publicUrl}/p/${p.slug}?cancelled=1`,
    redirect,
  });
  return store.addOrder({
    id: localId, paypalOrderId: pp.id, productId: p.id, title: p.title, qty, amountUsd: round2(p.priceUsd * qty),
    status: pp.status as Order['status'], approveUrl: pp.approveUrl, channel, mock: pp.mock, createdAt: new Date().toISOString(),
  });
}

export async function captureCheckout(idOrPaypalId: string): Promise<Order> {
  const o = store.findOrder(idOrPaypalId);
  if (!o) throw new Error('Order not found');
  if (o.status === 'COMPLETED') return o;
  const cap = await paypal.captureOrder(o.paypalOrderId);
  const patch: Partial<Order> = { status: cap.status as Order['status'], captureId: cap.captureId, buyerName: cap.payerName, buyerEmail: cap.payerEmail };
  if (cap.status === 'COMPLETED') {
    patch.capturedAt = new Date().toISOString();
    const p = store.findProduct(o.productId);
    if (p) store.updateProduct(p.id, { stock: Math.max(0, p.stock - o.qty) });
  }
  return store.updateOrder(o.id, patch)!;
}

export async function refreshOrder(idOrPaypalId: string): Promise<Order> {
  const o = store.findOrder(idOrPaypalId);
  if (!o) throw new Error('Order not found');
  if (o.status === 'COMPLETED' || o.sample) return o;
  const d: any = await paypal.getOrder(o.paypalOrderId);
  return store.updateOrder(o.id, { status: d.status })!;
}

export async function createInvoice(input: { recipientName: string; recipientEmail: string; items: { productId: string; qty: number }[]; note?: string }): Promise<Invoice> {
  const items = input.items.map((i) => {
    const p = store.findProduct(i.productId);
    if (!p) throw new Error(`Unknown product ${i.productId}`);
    return { productId: p.id, title: p.title, qty: Math.max(1, i.qty), unitUsd: p.priceUsd };
  });
  if (!items.length) throw new Error('Invoice needs at least one item');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.recipientEmail)) throw new Error('A valid buyer email is needed for a PayPal invoice');
  const r = await paypal.createAndSendInvoice({ recipientName: input.recipientName, recipientEmail: input.recipientEmail, items: items.map((i) => ({ name: i.title, qty: i.qty, unitUsd: i.unitUsd })), note: input.note });
  return store.addInvoice({
    id: uid('inv'), paypalInvoiceId: r.id, number: r.number, recipientName: input.recipientName, recipientEmail: input.recipientEmail,
    items, totalUsd: round2(items.reduce((s, i) => s + i.unitUsd * i.qty, 0)), status: r.status, payerViewUrl: r.payerViewUrl,
    qrPngBase64: r.qrPngBase64, via: r.mock ? 'mock' : 'paypal-agent-toolkit', createdAt: new Date().toISOString(),
  });
}

export async function buyerAnswer(productIdOrSlug: string, question: string) {
  const p = store.findProduct(productIdOrSlug);
  if (!p) throw new Error('Product not found');
  const r = await replyToBuyer(question, p, storefrontUrl(p));
  return { ...r, product: p };
}

export function dashboard(): DashboardStats {
  const orders = store.orders();
  const paid = orders.filter((o) => o.status === 'COMPLETED');
  const revenueUsd = round2(paid.reduce((s, o) => s + o.amountUsd, 0));
  const byProduct = new Map<string, { title: string; units: number; revenueUsd: number }>();
  for (const o of paid) {
    const e = byProduct.get(o.productId) || { title: o.title, units: 0, revenueUsd: 0 };
    e.units += o.qty; e.revenueUsd = round2(e.revenueUsd + o.amountUsd); byProduct.set(o.productId, e);
  }
  const top = [...byProduct.values()].sort((a, b) => b.revenueUsd - a.revenueUsd)[0];
  const days: DashboardStats['daily'] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const dayPaid = paid.filter((o) => (o.capturedAt || o.createdAt).slice(0, 10) === d);
    days.push({ date: d, revenueUsd: round2(dayPaid.reduce((s, o) => s + o.amountUsd, 0)), orders: dayPaid.length });
  }
  const products = store.products();
  const lowStock = products.filter((p) => p.stock <= 3).map((p) => ({ title: p.title, stock: p.stock }));
  const invoices = store.invoices();
  const pending = orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'VOIDED');
  const conversion = orders.length ? paid.length / orders.length : 0;

  const insights: string[] = [];
  if (top) insights.push(`${top.title} is your best seller (${top.units} sold, $${top.revenueUsd.toFixed(2)}). Post it again on your Status tonight.`);
  for (const l of lowStock.slice(0, 2)) insights.push(`Only ${l.stock} ${l.title} left — restock or raise the price slightly.`);
  const viewedNoSale = products.filter((p) => p.views >= 5 && !byProduct.has(p.id)).slice(0, 1);
  for (const p of viewedNoSale) insights.push(`${p.title} has ${p.views} views but no sales yet — try a clearer photo or a bundle offer.`);
  if (pending.length) insights.push(`${pending.length} checkout${pending.length > 1 ? 's' : ''} started but not paid — send a friendly reminder with the same link.`);
  if (conversion > 0 && conversion < 0.4) insights.push(`Only ${(conversion * 100).toFixed(0)}% of pay links get paid. Answer buyer questions faster with the Copilot's reply drafts.`);
  if (!insights.length) insights.push('Create your first listing in the Copilot tab, then share the PayPal link on WhatsApp.');

  return {
    revenueUsd, revenueNgn: Math.round(revenueUsd * config.ngnPerUsd), paidOrders: paid.length, pendingOrders: pending.length,
    conversionRate: round2(conversion), avgOrderUsd: paid.length ? round2(revenueUsd / paid.length) : 0, topProduct: top, daily: days, lowStock,
    invoices: { sent: invoices.length, paid: invoices.filter((i) => i.status === 'PAID').length, outstandingUsd: round2(invoices.filter((i) => i.status !== 'PAID').reduce((s, i) => s + i.totalUsd, 0)) },
    insights, hasSample: orders.some((o) => o.sample) || products.some((p) => p.sample),
  };
}
