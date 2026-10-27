import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildListing, parsePrice, parseSizes, routeSellerMessage, answerBuyer, matchProduct } from '../src/ai/rules.js';

const opts = { ngnPerUsd: 1500, shopName: 'Test' };

test('parses naira shorthand and converts to USD', () => {
  assert.deepEqual(parsePrice('Ankara bags 15k each', 1500), { ngn: 15000, usd: 10 });
  assert.deepEqual(parsePrice('price ₦28,000 only', 1400), { ngn: 28000, usd: 20 });
  assert.equal(parsePrice('N4500 per jar', 1500).ngn, 4500);
  assert.equal(parsePrice('slides $18', 1500).usd, 18);
});

test('parses sizes', () => {
  assert.deepEqual(parseSizes('sizes 38-41, black'), ['38', '39', '40', '41']);
  assert.deepEqual(parseSizes('Sizes: S, M, L. Delivery'), ['S', 'M', 'L']);
});

test('builds a listing from a WhatsApp-style message', () => {
  const d = buildListing('Selling handmade Ankara tote bags, 15k each, red and blue, 12 in stock. Delivery within Lagos 1-2 days', opts);
  assert.equal(d.title, 'Handmade Ankara Tote Bags');
  assert.equal(d.category, 'Bags');
  assert.equal(d.priceUsd, 10);
  assert.equal(d.stock, 12);
  assert.deepEqual(d.colors, ['Red', 'Blue']);
  assert.match(d.delivery!, /Lagos/);
  assert.ok(d.caption.includes('PayPal'));
});

test('routes seller intents', () => {
  assert.equal(routeSellerMessage('Invoice Chioma Okafor chioma@example.com for 2 tote bags').kind, 'invoice');
  assert.equal(routeSellerMessage('Customer asked: "how much e be?"').kind, 'buyer_question');
  assert.equal(routeSellerMessage('How are my sales this week?').kind, 'sales');
  assert.equal(routeSellerMessage('send a payment link for 2 tote bags').kind, 'checkout');
  assert.equal(routeSellerMessage('New stock: Adire sets ₦28,000, sizes S, M').kind, 'listing');
});

test('answers buyer questions in their register', () => {
  const p = { title: 'Tote Bag', priceUsd: 10, priceNgn: 15000, stock: 4, colors: ['Red'], sizes: [], delivery: 'Delivery within Lagos 1-2 days', description: 'Tote Bag — Roomy.' };
  const a = answerBuyer('abeg how much e be?', p, 'https://x/p/tote');
  assert.equal(a.intent, 'price');
  assert.match(a.answer, /No wahala/);
  assert.match(a.answer, /₦15,000/);
  assert.equal(answerBuyer('do you deliver to Abuja?', p, 'l').intent, 'delivery');
});

test('matches products by fuzzy title', () => {
  const ps = [{ title: 'Handmade Ankara Tote Bags' }, { title: 'Adire Two-piece Sets' }];
  assert.equal(matchProduct('link for 2 tote bags', ps)?.title, 'Handmade Ankara Tote Bags');
});

test('extracts invoice recipient', () => {
  const r = routeSellerMessage('Invoice Chioma Okafor chioma@example.com for 2 tote bags');
  assert.equal(r.kind, 'invoice');
  if (r.kind === 'invoice') { assert.equal(r.name, 'Chioma Okafor'); assert.equal(r.email, 'chioma@example.com'); assert.equal(r.qty, 2); }
});
