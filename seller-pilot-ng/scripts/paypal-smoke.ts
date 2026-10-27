/**
 * PayPal sandbox smoke test — verifies your .env credentials end to end without the UI.
 *   npm run smoke:paypal                 -> OAuth + create a $1.00 order, prints the approval link
 *   npm run smoke:paypal -- <ORDER_ID>   -> captures an order you approved with a sandbox buyer
 */
import { paypalMode } from '../server/src/config.js';
import { captureOrder, createOrder, getAccessToken } from '../server/src/paypal.js';

if (paypalMode() === 'mock') { console.error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set (mock mode).'); process.exit(1); }
const id = process.argv[2];
await getAccessToken();
console.log('✓ OAuth token OK');
if (id) {
  const r = await captureOrder(id);
  console.log('✓ capture', r.status, r.captureId, r.payerEmail);
} else {
  const o = await createOrder({ referenceId: `smoke-${Date.now()}`, items: [{ name: 'SellerPilot smoke test', qty: 1, unitUsd: 1 }], returnUrl: 'https://example.com/return', cancelUrl: 'https://example.com/cancel' });
  console.log('✓ order', o.id, o.status);
  console.log('Approve with a sandbox personal account:', o.approveUrl);
  console.log(`Then run: npm run smoke:paypal -- ${o.id}`);
}
