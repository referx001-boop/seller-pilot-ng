import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config, paypalMode } from './config.js';
import { load, store } from './store.js';
import * as svc from './services.js';
import { runAgent, agentToolNames } from './agent.js';
import { draftListing } from './ai/copilot.js';
import { engineName } from './ai/llm.js';
import { PayPalError, toolkitToolNames, warmToolkit } from './paypal.js';
import { seedSample } from './seed.js';

load();
const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));

const h = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).then((v) => { if (!res.headersSent) res.json(v); }).catch(next);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', h(async () => ({
  shopName: config.shopName,
  paypalMode: paypalMode(),
  paypalClientId: paypalMode() === 'mock' ? null : config.paypal.clientId,
  payeeOverride: Boolean(config.paypal.payeeEmail),
  aiEngine: engineName(),
  ngnPerUsd: config.ngnPerUsd,
  agentTools: agentToolNames(),
  paypalToolkitTools: paypalMode() === 'mock' ? [] : await toolkitToolNames(),
})));

// ---- AI copilot ----
app.post('/api/agent', h((req) => runAgent(String(req.body.message || ''), Array.isArray(req.body.history) ? req.body.history : [])));
app.post('/api/ai/listing', h((req) => draftListing(String(req.body.text || ''))));

// ---- products ----
app.get('/api/products', h(() => store.products()));
app.post('/api/products', h(async (req) => (await svc.createProductFromText(String(req.body.text || ''))).product));
app.get('/api/products/:id', h((req, res) => {
  const p = store.findProduct(String(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (req.query.view) store.updateProduct(p.id, { views: p.views + 1 });
  return p;
}));
app.patch('/api/products/:id', h((req, res) => {
  const allowed = ['title', 'description', 'priceUsd', 'priceNgn', 'stock', 'caption', 'delivery'] as const;
  const patch: any = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  const p = store.updateProduct(String(req.params.id), patch);
  return p ?? res.status(404).json({ error: 'Not found' });
}));
app.delete('/api/products/:id', h((req) => { store.deleteProduct(String(req.params.id)); return { ok: true }; }));
app.post('/api/products/:id/ask', h((req) => svc.buyerAnswer(String(req.params.id), String(req.body.question || ''))));
app.get('/api/products/:id/qr', h(async (req, res) => {
  const p = store.findProduct(String(req.params.id));
  if (!p) return res.status(404).json({ error: 'Not found' });
  return { url: svc.storefrontUrl(p), dataUrl: await svc.qrDataUrl(svc.storefrontUrl(p)) };
}));

// ---- PayPal Orders v2 ----
app.get('/api/orders', h(() => store.orders()));
app.post('/api/orders', h((req) => svc.createCheckout(String(req.body.productId), Number(req.body.qty) || 1, req.body.channel === 'agent-link' ? 'agent-link' : 'storefront', req.body.color, req.body.size, req.body.flow !== 'sdk')));
app.get('/api/orders/:id', h((req) => svc.refreshOrder(String(req.params.id))));
app.post('/api/orders/:id/capture', h((req) => svc.captureCheckout(String(req.params.id))));

// ---- PayPal Invoicing (Agent Toolkit) ----
app.get('/api/invoices', h(() => store.invoices()));
app.post('/api/invoices', h((req) => svc.createInvoice(req.body)));

// ---- dashboard ----
app.get('/api/dashboard', h(() => svc.dashboard()));
app.post('/api/demo/seed', h(() => { seedSample(); return { ok: true }; }));
app.post('/api/demo/clear-sample', h(() => { store.clearSample(); return { ok: true }; }));

// ---- static frontend (production) ----
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof PayPalError ? (err.status >= 400 && err.status < 600 ? err.status : 502) : 400;
  console.error('[error]', err.message, err instanceof PayPalError ? JSON.stringify(err.details)?.slice(0, 500) : '');
  res.status(status).json({ error: err.message, details: err instanceof PayPalError ? err.details : undefined });
});

app.listen(config.port, () => {
  if (paypalMode() !== 'mock') warmToolkit().then(() => console.log('PayPal Agent Toolkit loaded')).catch((e) => console.warn('Agent Toolkit failed to load', e.message));
  console.log(`SellerPilot API on http://localhost:${config.port}  |  PayPal: ${paypalMode()}  |  AI: ${engineName()}`);
});
