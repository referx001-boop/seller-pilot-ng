import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Invoice, Order, Product } from './types.js';

interface DB { products: Product[]; orders: Order[]; invoices: Invoice[] }

const file = path.resolve(process.env.DB_FILE || (process.env.VERCEL ? '/tmp/sellerpilot-db.json' : 'data/db.json'));
let db: DB = { products: [], orders: [], invoices: [] };

export function load() {
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    db = { products: [], orders: [], invoices: [] };
  }
}
function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
}
export const uid = (p: string) => `${p}_${crypto.randomBytes(5).toString('hex')}`;

export const store = {
  products: () => db.products,
  orders: () => db.orders,
  invoices: () => db.invoices,
  findProduct(idOrSlug: string) {
    return db.products.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
  },
  addProduct(p: Product) { db.products.unshift(p); save(); return p; },
  updateProduct(id: string, patch: Partial<Product>) {
    const p = db.products.find((x) => x.id === id);
    if (!p) return undefined;
    Object.assign(p, patch); save(); return p;
  },
  deleteProduct(id: string) { db.products = db.products.filter((p) => p.id !== id); save(); },
  addOrder(o: Order) { db.orders.unshift(o); save(); return o; },
  findOrder(id: string) { return db.orders.find((o) => o.id === id || o.paypalOrderId === id); },
  updateOrder(id: string, patch: Partial<Order>) {
    const o = store.findOrder(id); if (!o) return undefined; Object.assign(o, patch); save(); return o;
  },
  addInvoice(i: Invoice) { db.invoices.unshift(i); save(); return i; },
  updateInvoice(id: string, patch: Partial<Invoice>) {
    const i = db.invoices.find((x) => x.id === id || x.paypalInvoiceId === id); if (!i) return undefined; Object.assign(i, patch); save(); return i;
  },
  clearSample() {
    db.products = db.products.filter((p) => !p.sample);
    db.orders = db.orders.filter((o) => !o.sample);
    save();
  },
  replace(next: DB) { db = next; save(); },
  raw: () => db,
  persist: save,
};
