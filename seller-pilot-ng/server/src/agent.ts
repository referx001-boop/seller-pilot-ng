/**
 * SellerPilot agent: the seller types (or pastes) a WhatsApp-style message; the agent decides
 * which tools to run and actually transacts on PayPal — creating listings, PayPal checkout orders,
 * sending PayPal invoices (via the PayPal Agent Toolkit), drafting buyer replies and summarising sales.
 *
 * Two planners share one tool registry:
 *   1. LLM planner (OpenAI-compatible function calling) when an AI key is configured.
 *   2. Rule planner (offline) — always available, also used when the LLM fails.
 *
 * Guardrail: money amounts are never taken from the model. Prices come from the catalog and
 * totals are computed server-side; the model can only pick products, quantities and recipients.
 */
import { config } from './config.js';
import { store } from './store.js';
import * as svc from './services.js';
import * as paypal from './paypal.js';
import { chat, engineName, llmAvailable, type ChatMsg } from './ai/llm.js';
import { matchProduct, routeSellerMessage, formatPrice } from './ai/rules.js';
import type { AgentAction, AgentCard, AgentResult, Product } from './types.js';

type ToolOut = { summary: string; cards: AgentCard[]; data: unknown; via: AgentAction['via'] };

const TOOLS = [
  { type: 'function', function: { name: 'create_listing', description: 'Turn a seller\'s chat-style product description into a saved product listing (title, description, price, stock, caption, hashtags, FAQ). Also creates its shareable PayPal checkout page.', parameters: { type: 'object', properties: { text: { type: 'string', description: 'The seller\'s raw product description, verbatim' } }, required: ['text'] } } },
  { type: 'function', function: { name: 'create_checkout_link', description: 'Create a PayPal checkout order (Orders v2) for an existing product and return the PayPal pay link to send to a buyer.', parameters: { type: 'object', properties: { product: { type: 'string', description: 'Product id or words from its title' }, qty: { type: 'integer', minimum: 1 } }, required: ['product'] } } },
  { type: 'function', function: { name: 'send_paypal_invoice', description: 'Create and email a PayPal invoice (via the PayPal Agent Toolkit) to a buyer for products in the catalog.', parameters: { type: 'object', properties: { recipient_name: { type: 'string' }, recipient_email: { type: 'string' }, product: { type: 'string' }, qty: { type: 'integer', minimum: 1 }, note: { type: 'string' } }, required: ['recipient_name', 'recipient_email', 'product'] } } },
  { type: 'function', function: { name: 'answer_buyer_question', description: 'Draft a reply to a buyer question about a product, including the pay link.', parameters: { type: 'object', properties: { question: { type: 'string' }, product: { type: 'string' } }, required: ['question'] } } },
  { type: 'function', function: { name: 'get_sales_summary', description: 'Get revenue, paid/pending orders, best seller, low stock and insights.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'check_order_status', description: 'Check the latest PayPal status of the most recent order, or one matching a product/buyer.', parameters: { type: 'object', properties: { hint: { type: 'string' } } } } },
];

function resolveProduct(hint?: string): Product | undefined {
  const products = store.products();
  if (!hint) return products[0];
  // exact id/slug, then fuzzy title match, then the most recent listing (what sellers usually mean)
  return store.findProduct(hint) || matchProduct(hint, products) || products[0];
}

async function runTool(name: string, args: any): Promise<ToolOut> {
  switch (name) {
    case 'create_listing': {
      const { product, warnings } = await svc.createProductFromText(String(args.text || ''));
      const url = svc.storefrontUrl(product);
      return {
        via: 'sellerpilot',
        summary: `Listed "${product.title}" at ${formatPrice(product.priceUsd, product.priceNgn)}, ${product.stock} in stock${warnings.length ? ` (${warnings.join(' ')})` : ''}`,
        cards: [{ type: 'listing', product }, { type: 'checkout', product, storefrontUrl: url, qrDataUrl: await svc.qrDataUrl(url) }],
        data: { id: product.id, title: product.title, priceUsd: product.priceUsd, url, warnings },
      };
    }
    case 'create_checkout_link': {
      const p = resolveProduct(args.product);
      if (!p) throw new Error('I could not find that product. Create a listing first.');
      const order = await svc.createCheckout(p.id, Number(args.qty) || 1, 'agent-link');
      const link = order.approveUrl || svc.storefrontUrl(p);
      return {
        via: 'paypal-orders-v2',
        summary: `PayPal order ${order.paypalOrderId} for ${order.qty} × ${p.title} = $${order.amountUsd.toFixed(2)}`,
        cards: [{ type: 'checkout', product: p, storefrontUrl: svc.storefrontUrl(p), order, qrDataUrl: await svc.qrDataUrl(link) }],
        data: { orderId: order.paypalOrderId, payLink: link, amountUsd: order.amountUsd },
      };
    }
    case 'send_paypal_invoice': {
      const p = resolveProduct(args.product);
      if (!p) throw new Error('Which product is this invoice for?');
      if (!args.recipient_email) throw new Error('I need the buyer\'s email address to send a PayPal invoice.');
      const inv = await svc.createInvoice({ recipientName: args.recipient_name || 'Customer', recipientEmail: args.recipient_email, items: [{ productId: p.id, qty: Number(args.qty) || 1 }], note: args.note });
      return {
        via: inv.via === 'mock' ? 'sellerpilot' : 'paypal-agent-toolkit',
        summary: `Invoice ${inv.number ? '#' + inv.number + ' ' : ''}(${inv.paypalInvoiceId}) for $${inv.totalUsd.toFixed(2)} sent to ${inv.recipientEmail}`,
        cards: [{ type: 'invoice', invoice: inv }],
        data: { invoiceId: inv.paypalInvoiceId, status: inv.status, payerViewUrl: inv.payerViewUrl, totalUsd: inv.totalUsd },
      };
    }
    case 'answer_buyer_question': {
      const p = resolveProduct(args.product || args.question);
      if (!p) throw new Error('Create a listing first so I know what the buyer is asking about.');
      const r = await svc.buyerAnswer(p.id, String(args.question));
      return { via: r.source === 'llm' ? 'llm' : 'sellerpilot', summary: `Drafted a "${r.intent}" reply for ${p.title}`, cards: [{ type: 'reply', question: args.question, answer: r.answer, product: p }], data: { answer: r.answer } };
    }
    case 'get_sales_summary': {
      const stats = svc.dashboard();
      return { via: 'sellerpilot', summary: `Revenue $${stats.revenueUsd.toFixed(2)} from ${stats.paidOrders} paid orders`, cards: [{ type: 'summary', stats }], data: stats };
    }
    case 'check_order_status': {
      const orders = store.orders().filter((o) => !o.sample);
      const p = args.hint ? matchProduct(args.hint, store.products()) : undefined;
      const o = (p && orders.find((x) => x.productId === p.id)) || orders[0];
      if (!o) throw new Error('No orders yet.');
      const fresh = await svc.refreshOrder(o.id).catch(() => o);
      return { via: 'paypal-orders-v2', summary: `Order ${fresh.paypalOrderId} is ${fresh.status}`, cards: [{ type: 'order', order: fresh }], data: { status: fresh.status } };
    }
  }
  throw new Error(`Unknown tool ${name}`);
}

async function exec(name: string, args: any, actions: AgentAction[], cards: AgentCard[]) {
  const t0 = Date.now();
  try {
    const out = await runTool(name, args);
    actions.push({ tool: name, via: out.via, summary: out.summary, ok: true, ms: Date.now() - t0 });
    cards.push(...out.cards);
    return { ok: true, ...out };
  } catch (e) {
    const msg = e instanceof paypal.PayPalError ? `${e.message}` : (e as Error).message;
    actions.push({ tool: name, via: name.includes('invoice') ? 'paypal-agent-toolkit' : name.includes('checkout') || name.includes('order') ? 'paypal-orders-v2' : 'sellerpilot', summary: msg, ok: false, ms: Date.now() - t0 });
    return { ok: false, error: msg };
  }
}

const HELP = `I'm your SellerPilot. Try:
• "Selling Ankara tote bags, 15k each, red and blue, 12 in stock, delivery in Lagos 1–2 days"
• "Send a payment link for 2 tote bags"
• "Invoice Chioma Okafor chioma@example.com for 2 tote bags"
• Customer asked: "how much e be, una dey deliver to Abuja?"
• "How are my sales this week?"`;

async function rulePlanner(message: string): Promise<AgentResult> {
  const actions: AgentAction[] = []; const cards: AgentCard[] = [];
  const intent = routeSellerMessage(message);
  let reply = '';
  switch (intent.kind) {
    case 'listing': {
      const r = await exec('create_listing', { text: intent.text }, actions, cards);
      reply = r.ok ? 'Done! I created the listing, a caption you can paste on Instagram/WhatsApp, and a PayPal checkout page buyers can pay on right away.' : `I couldn't create that listing: ${r.error}`;
      break;
    }
    case 'checkout': {
      const r = await exec('create_checkout_link', { product: intent.productHint, qty: intent.qty }, actions, cards);
      reply = r.ok ? 'Here is a PayPal pay link for that exact order. Send it to your buyer — I\'ll mark it paid the moment PayPal confirms.' : `Couldn't create the pay link: ${r.error}`;
      break;
    }
    case 'invoice': {
      const p = resolveProduct(intent.productHint);
      const r = await exec('send_paypal_invoice', { recipient_name: intent.name || 'Customer', recipient_email: intent.email, product: p?.id, qty: intent.qty }, actions, cards);
      reply = r.ok ? 'Invoice created and sent through PayPal. Your buyer gets an email with a Pay Now button, and I added a QR code you can share on WhatsApp.' : `Couldn't send the invoice: ${r.error}`;
      break;
    }
    case 'buyer_question': {
      const r = await exec('answer_buyer_question', { question: intent.question, product: intent.productHint }, actions, cards);
      reply = r.ok ? 'Here\'s a reply you can paste back to your customer:' : `${r.error}`;
      break;
    }
    case 'sales': {
      await exec('get_sales_summary', {}, actions, cards);
      reply = 'Here\'s how your shop is doing:';
      break;
    }
    case 'status': {
      const r = await exec('check_order_status', { hint: intent.orderHint }, actions, cards);
      reply = r.ok ? 'Latest status from PayPal:' : `${r.error}`;
      break;
    }
    default:
      reply = HELP;
  }
  return { reply, actions, cards, engine: 'rules (offline)' };
}

async function llmPlanner(message: string, history: { role: 'user' | 'assistant'; content: string }[]): Promise<AgentResult> {
  const actions: AgentAction[] = []; const cards: AgentCard[] = [];
  const catalog = store.products().slice(0, 20).map((p) => ({ id: p.id, title: p.title, priceUsd: p.priceUsd, stock: p.stock }));
  const messages: ChatMsg[] = [
    { role: 'system', content: `You are SellerPilot, an agent that runs PayPal payments for a small Nigerian Instagram/WhatsApp seller ("${config.shopName}"). Use tools to actually do the work (create listings, PayPal pay links, PayPal invoices, buyer replies, sales summaries) instead of just advising. Never invent prices — they come from the catalog. Be brief and warm. Catalog: ${JSON.stringify(catalog)}` },
    ...history.slice(-6).map((h) => ({ role: h.role, content: h.content }) as ChatMsg),
    { role: 'user', content: message },
  ];
  for (let step = 0; step < 4; step++) {
    const t0 = Date.now();
    let r: Awaited<ReturnType<typeof chat>>;
    try { r = await chat(messages, { tools: TOOLS }); } catch (e) {
      if (!actions.length) throw e; // nothing done yet -> let the rule planner take over
      return { reply: 'Done — see the actions above.', actions, cards, engine: engineName() };
    }
    if (!r.tool_calls?.length) {
      actions.push({ tool: 'plan', via: 'llm', summary: engineName(), ok: true, ms: Date.now() - t0 });
      return { reply: r.content || 'Done.', actions, cards, engine: engineName() };
    }
    messages.push({ role: 'assistant', content: r.content, tool_calls: r.tool_calls });
    for (const call of r.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
      const out = await exec(call.function.name, args, actions, cards);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out.ok ? (out as any).data : { error: (out as any).error }) });
    }
  }
  return { reply: 'Done — see the actions above.', actions, cards, engine: engineName() };
}

export async function runAgent(message: string, history: { role: 'user' | 'assistant'; content: string }[] = []): Promise<AgentResult> {
  if (llmAvailable()) {
    try { return await llmPlanner(message, history); } catch (e) { console.warn('[agent] LLM planner failed, falling back to rules:', (e as Error).message); }
  }
  return rulePlanner(message);
}

export const agentToolNames = () => TOOLS.map((t) => t.function.name);
