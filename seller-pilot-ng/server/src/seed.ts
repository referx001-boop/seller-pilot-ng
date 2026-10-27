/** Optional sample data so the dashboard isn't empty in a demo. Every seeded row is flagged `sample: true` and labelled in the UI. */
import { store, uid } from './store.js';
import { buildListing } from './ai/rules.js';
import { config } from './config.js';
import type { Order, Product } from './types.js';

const SAMPLES = [
  'Handmade coral bead necklaces ₦12,500, red and gold, 8 in stock, delivery nationwide 2-4 days',
  'New stock: Adire two-piece sets ₦28,000, sizes S, M, L, XL, 6 pieces left. We ship nationwide and to the UK',
  'Fresh chin chin 1kg jar going for 4500 naira, 30 jars available, pickup in Port Harcourt or delivery',
  'Unisex palm slippers $18, sizes 38-45, black and brown, 3 pairs left, delivery nationwide',
];

export function seedSample() {
  const now = Date.now();
  const products: Product[] = SAMPLES.map((text, i) => {
    const d = buildListing(text, { ngnPerUsd: config.ngnPerUsd, shopName: config.shopName });
    return { id: uid('prd'), slug: d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '') + '-s' + i, ...d, rawInput: text, source: 'rules', views: [42, 18, 25, 9][i], createdAt: new Date(now - (8 - i) * 86400000).toISOString(), sample: true } as Product;
  });
  const orders: Order[] = [];
  const pattern = [[0, 2], [2, 3], [0, 1], [1, 1], [2, 2], [0, 1], [3, 1], [2, 4], [0, 2], [1, 1]];
  pattern.forEach(([pi, qty], k) => {
    const p = products[pi];
    const day = now - (6 - Math.floor(k / 1.5)) * 86400000;
    const paid = k % 4 !== 3;
    orders.push({ id: uid('ord'), paypalOrderId: 'SAMPLE' + (1000 + k), productId: p.id, title: p.title, qty, amountUsd: Math.round(p.priceUsd * qty * 100) / 100, status: paid ? 'COMPLETED' : 'PAYER_ACTION_REQUIRED', channel: k % 3 ? 'storefront' : 'agent-link', buyerName: ['Tolu A.', 'Chioma O.', 'Emeka N.', 'Aisha B.', 'Kemi D.'][k % 5], sample: true, createdAt: new Date(day).toISOString(), capturedAt: paid ? new Date(day + 3600000).toISOString() : undefined });
  });
  const db = store.raw();
  store.replace({ products: [...db.products.filter((p) => !p.sample), ...products], orders: [...db.orders.filter((o) => !o.sample), ...orders], invoices: db.invoices });
}
