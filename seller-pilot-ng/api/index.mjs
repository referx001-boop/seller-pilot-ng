// server/src/index.ts
import express from "express";
import cors from "cors";
import path2 from "node:path";
import fs2 from "node:fs";

// server/src/config.ts
import "dotenv/config";
var env = (k, d = "") => (process.env[k] ?? d).trim();
var config = {
  port: Number(env("PORT", "8787")),
  publicUrl: (env("PUBLIC_URL") || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:5173")).replace(/\/$/, ""),
  shopName: env("SHOP_NAME", "Ada Styles"),
  sellerEmail: env("SELLER_EMAIL"),
  ngnPerUsd: Number(env("NGN_PER_USD", "1550")) || 1550,
  paypal: {
    clientId: env("PAYPAL_CLIENT_ID"),
    clientSecret: env("PAYPAL_CLIENT_SECRET"),
    env: env("PAYPAL_ENV", "sandbox") === "live" ? "live" : "sandbox",
    payeeEmail: env("PAYPAL_PAYEE_EMAIL"),
    forceMock: env("PAYPAL_MODE") === "mock"
  },
  ai: {
    provider: env("AI_PROVIDER", "auto"),
    openaiKey: env("OPENAI_API_KEY"),
    openaiBaseUrl: env("OPENAI_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
    openaiModel: env("OPENAI_MODEL", "gpt-4o-mini"),
    geminiKey: env("GEMINI_API_KEY"),
    geminiModel: env("GEMINI_MODEL", "gemini-2.0-flash")
  }
};
var paypalMode = () => config.paypal.forceMock || !config.paypal.clientId || !config.paypal.clientSecret ? "mock" : config.paypal.env;
var paypalApiBase = () => config.paypal.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

// server/src/store.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
var file = path.resolve(process.env.DB_FILE || (process.env.VERCEL ? "/tmp/sellerpilot-db.json" : "data/db.json"));
var db = { products: [], orders: [], invoices: [] };
function load() {
  try {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    db = { products: [], orders: [], invoices: [] };
  }
}
function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(db, null, 2));
}
var uid = (p) => `${p}_${crypto.randomBytes(5).toString("hex")}`;
var store = {
  products: () => db.products,
  orders: () => db.orders,
  invoices: () => db.invoices,
  findProduct(idOrSlug) {
    return db.products.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
  },
  addProduct(p) {
    db.products.unshift(p);
    save();
    return p;
  },
  updateProduct(id, patch) {
    const p = db.products.find((x) => x.id === id);
    if (!p) return void 0;
    Object.assign(p, patch);
    save();
    return p;
  },
  deleteProduct(id) {
    db.products = db.products.filter((p) => p.id !== id);
    save();
  },
  addOrder(o) {
    db.orders.unshift(o);
    save();
    return o;
  },
  findOrder(id) {
    return db.orders.find((o) => o.id === id || o.paypalOrderId === id);
  },
  updateOrder(id, patch) {
    const o = store.findOrder(id);
    if (!o) return void 0;
    Object.assign(o, patch);
    save();
    return o;
  },
  addInvoice(i) {
    db.invoices.unshift(i);
    save();
    return i;
  },
  updateInvoice(id, patch) {
    const i = db.invoices.find((x) => x.id === id || x.paypalInvoiceId === id);
    if (!i) return void 0;
    Object.assign(i, patch);
    save();
    return i;
  },
  clearSample() {
    db.products = db.products.filter((p) => !p.sample);
    db.orders = db.orders.filter((o) => !o.sample);
    save();
  },
  replace(next) {
    db = next;
    save();
  },
  raw: () => db,
  persist: save
};

// server/src/services.ts
import QRCode from "qrcode";

// server/src/paypal.ts
import crypto2 from "node:crypto";
var cachedToken = null;
async function getAccessToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 6e4) return cachedToken.value;
  const auth = Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString("base64");
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials"
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new PayPalError(`OAuth failed: ${data.error_description || res.status}`, res.status, data);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1e3 };
  return cachedToken.value;
}
var PayPalError = class extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
  status;
  details;
};
async function pp(method, path3, body, extraHeaders = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${paypalApiBase()}${path3}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extraHeaders },
    body: body ? JSON.stringify(body) : void 0
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue = data?.details?.[0]?.issue || data?.name || res.status;
    throw new PayPalError(`PayPal ${method} ${path3} failed: ${issue}`, res.status, data);
  }
  return data;
}
var money = (n) => (Math.round(n * 100) / 100).toFixed(2);
async function createOrder(input) {
  const total = input.items.reduce((s, i) => s + i.unitUsd * i.qty, 0);
  if (paypalMode() === "mock") {
    const id = "MOCK" + crypto2.randomBytes(7).toString("hex").toUpperCase();
    return { id, status: "PAYER_ACTION_REQUIRED", approveUrl: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}token=${id}&mock=1`, mock: true };
  }
  const purchaseUnit = {
    reference_id: input.referenceId,
    description: (input.description || input.items[0]?.name || "SellerPilot order").slice(0, 127),
    custom_id: input.referenceId,
    amount: {
      currency_code: "USD",
      value: money(total),
      breakdown: { item_total: { currency_code: "USD", value: money(total) } }
    },
    items: input.items.map((i) => ({
      name: i.name.slice(0, 127),
      quantity: String(i.qty),
      description: i.description?.slice(0, 127),
      sku: i.sku,
      unit_amount: { currency_code: "USD", value: money(i.unitUsd) },
      category: "PHYSICAL_GOODS"
    }))
  };
  if (config.paypal.payeeEmail) purchaseUnit.payee = { email_address: config.paypal.payeeEmail };
  const order = await pp("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [purchaseUnit],
    ...input.redirect === false ? {} : { payment_source: {
      paypal: {
        experience_context: {
          brand_name: config.shopName.slice(0, 127),
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl
        }
      }
    } }
  }, { "PayPal-Request-Id": `sp-${input.referenceId}` });
  const approveUrl = order.links?.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  return { id: order.id, status: order.status, approveUrl };
}
async function getOrder(id) {
  if (id.startsWith("MOCK")) return { id, status: "APPROVED", mock: true };
  return pp("GET", `/v2/checkout/orders/${id}`);
}
async function captureOrder(id) {
  if (id.startsWith("MOCK")) {
    return { status: "COMPLETED", captureId: "MOCKCAP" + crypto2.randomBytes(5).toString("hex").toUpperCase(), payerName: "Demo Buyer", payerEmail: "buyer@example.com" };
  }
  const data = await pp("POST", `/v2/checkout/orders/${id}/capture`, void 0, { "PayPal-Request-Id": `cap-${id}` });
  const cap2 = data.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: data.status,
    captureId: cap2?.id,
    amount: cap2?.amount?.value,
    payerName: [data.payer?.name?.given_name, data.payer?.name?.surname].filter(Boolean).join(" ") || void 0,
    payerEmail: data.payer?.email_address,
    raw: { id: data.id, status: data.status, capture_status: cap2?.status }
  };
}
var toolkit = null;
var toolkitLoading = null;
function warmToolkit() {
  toolkitLoading ??= import("@paypal/agent-toolkit/openai");
  return toolkitLoading;
}
async function getToolkit() {
  if (!toolkit) {
    const { PayPalAgentToolkit } = await warmToolkit();
    toolkit = new PayPalAgentToolkit({
      clientId: config.paypal.clientId,
      clientSecret: config.paypal.clientSecret,
      configuration: {
        actions: {
          invoices: { create: true, send: true, get: true, list: true, generateQRC: true, sendReminder: true },
          orders: { get: true }
        },
        context: { sandbox: config.paypal.env !== "live" }
      }
    });
    const client = toolkit.client;
    client.getAccessToken = () => getAccessToken();
  }
  toolkit.client._accessToken = void 0;
  return toolkit;
}
async function toolkitCall(name, args) {
  const tk = await getToolkit();
  const result = await tk.handleToolCall({
    id: `call_${crypto2.randomBytes(4).toString("hex")}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) }
  });
  const content = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = content;
  }
  if (parsed && typeof parsed === "object" && parsed.error) throw new PayPalError(`Agent Toolkit ${name}: ${parsed.error.message || "error"}`, 400, parsed.error);
  return parsed;
}
async function toolkitToolNames() {
  if (!toolkit) return [];
  try {
    return (await getToolkit()).getTools().map((t) => t.function.name);
  } catch {
    return [];
  }
}
async function createAndSendInvoice(input) {
  if (paypalMode() === "mock") {
    const id2 = "INV2-MOCK-" + crypto2.randomBytes(3).toString("hex").toUpperCase();
    return { id: id2, status: "SENT", payerViewUrl: void 0, mock: true };
  }
  const [given, ...rest] = input.recipientName.trim().split(/\s+/);
  const created = await toolkitCall("create_invoice", {
    currency_code: "USD",
    invoicer_business_name: config.shopName,
    ...config.sellerEmail ? { invoicer_email_address: config.sellerEmail } : {},
    primary_recipients: [{ billing_info: { name: { given_name: given || "Customer", surname: rest.join(" ") || void 0 }, email_address: input.recipientEmail } }],
    items: input.items.map((i) => ({ name: i.name.slice(0, 200), quantity: String(i.qty), unit_amount: { currency_code: "USD", value: money(i.unitUsd) } })),
    note: input.note || `Thank you for shopping with ${config.shopName}!`
  });
  const href = created?.href || "";
  const id = href.split("/").pop() || created?.id;
  if (!id) throw new PayPalError("Agent Toolkit create_invoice returned no id", 500, created);
  const sent = await toolkitCall("send_invoice", { invoice_id: id, send_to_recipient: true });
  let qrPngBase64;
  try {
    const qr = await toolkitCall("generate_invoice_qr_code", { invoice_id: id, width: 300, height: 300 });
    const m = String(qr).match(/\r?\n\r?\n([A-Za-z0-9+/=]{100,})/);
    if (m) qrPngBase64 = m[1];
  } catch {
  }
  const detail = await toolkitCall("get_invoice", { invoice_id: id }).catch(() => null);
  return {
    id,
    number: detail?.detail?.invoice_number,
    status: detail?.status || "SENT",
    payerViewUrl: detail?.detail?.metadata?.recipient_view_url || sent?.href,
    qrPngBase64
  };
}

// server/src/ai/rules.ts
var COLORS = ["black", "white", "red", "blue", "navy", "green", "yellow", "pink", "purple", "brown", "beige", "cream", "gold", "silver", "grey", "gray", "orange", "wine", "maroon", "nude", "teal", "peach", "lilac", "mustard", "multicolour", "multicolor"];
var CATEGORIES = [
  { name: "Bags", emoji: "\u{1F45C}", words: /\b(bag|bags|tote|purse|clutch|backpack)\b/i, tags: ["#bags", "#totebag"], pitch: "Roomy, sturdy and made to turn heads on every outing." },
  { name: "Footwear", emoji: "\u{1F45F}", words: /\b(shoe|shoes|sneaker|sneakers|slides?|sandals?|heels|loafers?|palm slippers?|slippers?)\b/i, tags: ["#shoes", "#footwear"], pitch: "Comfortable all-day wear with a clean, durable finish." },
  { name: "Fashion", emoji: "\u{1F457}", words: /\b(dress|gown|ankara|adire|aso[- ]?oke|kaftan|agbada|shirt|top|skirt|trouser|jeans|abaya|two[- ]?piece|outfit|jalabiya)\b/i, tags: ["#fashion", "#africanfashion"], pitch: "Tailored to flatter, with fabric that breathes in our weather." },
  { name: "Hair & Wigs", emoji: "\u{1F487}\u{1F3FE}\u200D\u2640\uFE0F", words: /\b(wig|wigs|bundle|bundles|frontal|closure|braids?|hair)\b/i, tags: ["#wigs", "#hairvendor"], pitch: "Soft, full and easy to style straight out of the pack." },
  { name: "Beauty & Skincare", emoji: "\u{1F9F4}", words: /\b(cream|serum|soap|skincare|lotion|body butter|shea|oil|perfume|fragrance|scent|lip ?gloss|makeup)\b/i, tags: ["#skincare", "#beauty"], pitch: "Gentle, effective and loved by repeat customers." },
  { name: "Food & Drinks", emoji: "\u{1F372}", words: /\b(chin ?chin|zobo|kunu|puff[- ]?puff|cake|cakes|small chops|jollof|spice|pepper|plantain chips|food|snack|snacks|honey|tigernut)\b/i, tags: ["#foodvendor", "#naijafood"], pitch: "Freshly made in small batches, packed hygienically." },
  { name: "Jewellery", emoji: "\u{1F48D}", words: /\b(bead|beads|necklace|bracelet|earrings?|ring|rings|anklet|jewel(?:le)?ry)\b/i, tags: ["#jewelry", "#handmadejewelry"], pitch: "Statement pieces that finish any look." },
  { name: "Gadgets", emoji: "\u{1F3A7}", words: /\b(phone|iphone|charger|earbuds?|airpods|headphones?|power ?bank|smart ?watch|laptop|case|cases)\b/i, tags: ["#gadgets", "#techdeals"], pitch: "Tested before dispatch so it works out of the box." },
  { name: "Home & Decor", emoji: "\u{1F56F}\uFE0F", words: /\b(candle|candles|throw pillow|cushion|rug|decor|vase|bedsheet|duvet|curtain)\b/i, tags: ["#homedecor", "#homeinterior"], pitch: "Little touches that make your space feel finished." }
];
var STOP_PREFIX = /^(?:hi+|hello|hey|good (?:morning|afternoon|evening)|pls|please|abeg|ok(?:ay)?|so)\b[\s,!.:-]*/i;
var SELL_PREFIX = /^(?:i(?:'m| am)?\s+(?:now\s+)?(?:selling|sell)|we(?:'re| are)?\s+selling|selling|new stock(?: of)?|just in|now available|available|fresh(?:ly)?|restocked|in stock)\s*[:\-–]?\s*/i;
function round2(n) {
  return Math.round(n * 100) / 100;
}
function toNumber(raw, k) {
  const n = parseFloat(raw.replace(/,/g, ""));
  if (Number.isNaN(n)) return void 0;
  return k ? n * 1e3 : n;
}
function parsePrice(text, ngnPerUsd) {
  const t = text.replace(/\s+/g, " ");
  const usd = t.match(/(?:\$|us\$|usd\s?)\s?(\d+(?:[.,]\d{1,2})?)/i) || t.match(/(\d+(?:\.\d{1,2})?)\s?(?:usd|dollars?|bucks)\b/i);
  const ngn = t.match(/(?:₦|ngn\s?|\bn(?=\d))\s?(\d[\d,]*(?:\.\d+)?)\s?(k)?\b/i) || t.match(/(\d[\d,]*(?:\.\d+)?)\s?(k)?\s?(?:naira|ngn)\b/i) || t.match(/\b(\d{1,4}(?:\.\d)?)(k)\b/i);
  const out = {};
  if (ngn) out.ngn = toNumber(ngn[1], ngn[2]);
  if (usd) out.usd = toNumber(usd[1]);
  if (out.ngn && !out.usd) out.usd = round2(out.ngn / ngnPerUsd);
  return out;
}
function parseStock(text) {
  const m = text.match(/(\d+)\s*(?:pcs|pieces|units|pairs|bottles|packs|jars|sets|left|in stock|available|remaining)\b/i) || text.match(/(?:stock|qty|quantity)\s*(?:of|:|is|=)?\s*(\d+)/i) || text.match(/only\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : void 0;
}
function parseColors(text) {
  const found = /* @__PURE__ */ new Set();
  for (const c of COLORS) if (new RegExp(`\\b${c}\\b`, "i").test(text)) found.add(c === "gray" ? "grey" : c);
  return [...found].map(cap);
}
function parseSizes(text) {
  const m = text.match(/sizes?\s*(?:available|:|-|are|from|in)?\s*([^.;!\n]+)/i);
  if (!m) {
    const letters = text.match(/\b(XS|S|M|L|XL|XXL|XXXL)(?:\s*[,/]\s*(XS|S|M|L|XL|XXL|XXXL))+\b/);
    return letters ? letters[0].split(/\s*[,/]\s*/) : [];
  }
  const tokens = m[1].split(/\s*(?:,|\/|&|\band\b|\bor\b)\s*/i).map((t) => t.trim()).filter(Boolean);
  const out = [];
  for (const tok of tokens) {
    const range = tok.match(/^(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})$/);
    if (range) {
      const a = +range[1], b = +range[2];
      if (b > a && b - a <= 15) {
        for (let i = a; i <= b; i++) out.push(String(i));
        continue;
      }
    }
    if (/^(?:xs|s|m|l|xl|xxl|xxxl|[2-5]xl|\d{1,2}(?:\.5)?|uk\s?\d{1,2}|one size|free size)$/i.test(tok)) {
      out.push(tok.toUpperCase());
      continue;
    }
    break;
  }
  return out;
}
function parseDelivery(text) {
  const sentences = text.split(/(?<=[.!\n])\s+|,\s*(?=deliver|ship|dispatch|we deliver|pickup|pick-up)/i);
  const s = sentences.find((x) => /\b(deliver|delivery|ship|shipping|dispatch|nationwide|pick ?-?up|waybill)\b/i.test(x));
  return s ? cap(s.trim().replace(/[.,;]+$/, "")) : void 0;
}
function guessCategory(text) {
  return CATEGORIES.find((c) => c.words.test(text)) ?? { name: "General", emoji: "\u{1F6CD}\uFE0F", tags: ["#shopsmall"], pitch: "Quality you can trust, from a seller who cares." };
}
function extractProductName(text) {
  let first = text.trim().split(/\n/)[0];
  first = first.replace(STOP_PREFIX, "").replace(STOP_PREFIX, "");
  first = first.replace(SELL_PREFIX, "");
  const cut = first.search(/\s(?:for|at|@|going for|now)\s+(?:₦|n\d|\$|\d)|[,.;!(]|\s-\s|₦|\$|\bN\d|\b\d[\d,]*\s?(?:k|naira|ngn|usd)\b|\beach\b|\bin stock\b|\bsizes?\b|\bavailable\b/i);
  let name = (cut > 0 ? first.slice(0, cut) : first).trim();
  name = name.replace(/^(?:a|an|the|some|my|our|new|brand new)\s+/i, "").replace(/\s+(?:for sale|now)$/i, "");
  const words = name.split(/\s+/).slice(0, 7);
  return words.length ? titleCase(words.join(" ")) : "New Product";
}
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function titleCase(s) {
  const small = /* @__PURE__ */ new Set(["and", "or", "of", "with", "for", "in", "on", "the", "a", "to"]);
  return s.toLowerCase().split(" ").map((w, i) => i > 0 && small.has(w) ? w : cap(w)).join(" ").replace(/\bAnkara\b/g, "Ankara").replace(/\bAso[- ]?oke\b/gi, "Aso-Oke");
}
var fmtUsd = (n) => `$${n.toFixed(2)}`;
var fmtNgn = (n) => `\u20A6${Math.round(n).toLocaleString("en-NG")}`;
var formatPrice = (usd, ngn) => ngn ? `${fmtNgn(ngn)} (\u2248 ${fmtUsd(usd)})` : fmtUsd(usd);
function buildListing(text, opts) {
  const warnings = [];
  const price = parsePrice(text, opts.ngnPerUsd);
  if (!price.usd) warnings.push("No price found \u2014 set one before sharing the link.");
  const stock = parseStock(text) ?? 10;
  if (parseStock(text) === void 0) warnings.push("Stock not mentioned \u2014 assumed 10.");
  const colors = parseColors(text);
  const sizes = parseSizes(text);
  const delivery = parseDelivery(text);
  const cat = guessCategory(text);
  const title = extractProductName(text);
  const handmade = /\b(handmade|hand-made|handcrafted|made in nigeria|local|adire|ankara|aso[- ]?oke)\b/i.test(text);
  const lines = [
    `${title} \u2014 ${cat.pitch}`,
    handmade ? "Handcrafted in Nigeria by independent makers." : "",
    colors.length ? `Colours: ${colors.join(", ")}.` : "",
    sizes.length ? `Sizes: ${sizes.join(", ")}.` : "",
    delivery ? `${delivery}.` : "",
    `Pay securely with PayPal \u2014 card or PayPal balance, buyer protection included.`
  ].filter(Boolean);
  const description = lines.join(" ");
  const tagWords = title.split(" ").filter((w) => w.length > 3).slice(0, 2).map((w) => "#" + w.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const hashtags = [.../* @__PURE__ */ new Set([...cat.tags, ...tagWords, handmade ? "#madeinnigeria" : "#shopsmall", "#paypal"])].slice(0, 7);
  const priceLine = price.usd ? formatPrice(price.usd, price.ngn) : "DM for price";
  const caption = [
    `${cat.emoji} ${title.toUpperCase()} ${cat.emoji}`,
    cat.pitch,
    colors.length ? `\u{1F3A8} ${colors.join(" \u2022 ")}` : "",
    sizes.length ? `\u{1F4CF} Sizes: ${sizes.join(", ")}` : "",
    `\u{1F4B0} ${priceLine}`,
    stock <= 10 ? `\u26A1 Only ${stock} available!` : `\u{1F4E6} ${stock} in stock`,
    delivery ? `\u{1F69A} ${delivery}` : "",
    `\u{1F449} Tap the link to pay instantly with PayPal`,
    hashtags.join(" ")
  ].filter(Boolean).join("\n");
  const faq = [
    { q: "How much is it?", a: `It's ${priceLine} per item.` },
    { q: "How do I pay?", a: "Tap the PayPal link \u2014 you can pay with a PayPal account or a debit/credit card. Your payment is protected." },
    { q: "Is it available?", a: stock > 0 ? `Yes, ${stock} left in stock.` : "Sold out for now \u2014 I can notify you when it restocks." },
    ...delivery ? [{ q: "Do you deliver?", a: delivery + "." }] : [],
    ...sizes.length ? [{ q: "What sizes?", a: `Available sizes: ${sizes.join(", ")}.` }] : [],
    ...colors.length ? [{ q: "What colours?", a: `Available colours: ${colors.join(", ")}.` }] : []
  ];
  return { title, description, category: cat.name, emoji: cat.emoji, priceUsd: price.usd ?? 0, priceNgn: price.ngn, stock, colors, sizes, delivery, hashtags, caption, faq, warnings };
}
var PIDGIN = /\b(abeg|una|wetin|dey|e be|how far|oya|wahala|sabi|na so|o jare|biko)\b/i;
function answerBuyer(question, p, payLink) {
  const q = question.toLowerCase();
  const pidgin = PIDGIN.test(q);
  const price = formatPrice(p.priceUsd, p.priceNgn);
  const hi = pidgin ? "No wahala! " : "Thanks for reaching out! ";
  const linkLine = `You can pay securely here: ${payLink}`;
  const asksPrice = /(how much|price|cost|amount|how much e be)/.test(q);
  const asksDelivery = /(deliver|delivery|ship|shipping|dispatch|waybill|abroad|send to)/.test(q);
  if (asksPrice && asksDelivery)
    return { intent: "price+delivery", answer: `${hi}${p.title} is ${price}. ${p.delivery ? p.delivery + "." : "We deliver nationwide \u2014 cost depends on location."} ${linkLine}` };
  if (/(discount|reduce|last price|final price|cheaper|bargain|negotiat|lower)/.test(q))
    return { intent: "discount", answer: `${hi}The price for ${p.title} is ${price}. Buying 3 or more? Message me and I'll check what I can do. ${linkLine}` };
  if (/(how much|price|cost|amount|\bhm\b|how much e be)/.test(q))
    return { intent: "price", answer: `${hi}${p.title} is ${price}. ${p.stock > 0 ? `${p.stock} still available.` : "Currently sold out."} ${linkLine}` };
  if (/(size|fit|small|big|large|xl|measure)/.test(q))
    return { intent: "size", answer: p.sizes.length ? `${hi}${p.title} comes in sizes ${p.sizes.join(", ")}. Tell me your usual size and I'll confirm the fit before you pay.` : `${hi}${p.title} is one-size. Want measurements? I'll send them right away.` };
  if (/(colou?r|shade)/.test(q))
    return { intent: "color", answer: p.colors.length ? `${hi}Available colours: ${p.colors.join(", ")}. Just add your colour in the PayPal note when you pay. ${linkLine}` : `${hi}It comes as shown in the photos.` };
  if (/(deliver|delivery|ship|shipping|dispatch|location|where are you|send to|waybill|abroad|uk|us|canada|pick ?up)/.test(q))
    return { intent: "delivery", answer: `${hi}${p.delivery ? p.delivery + "." : "We deliver nationwide and can ship abroad \u2014 delivery cost depends on location."} Once you pay, I'll confirm dispatch with a tracking update.` };
  if (/(available|in stock|still have|remain|left|sold out|do you have)/.test(q))
    return { intent: "stock", answer: p.stock > 0 ? `${hi}Yes! ${p.stock} left. Grab yours before it sells out: ${payLink}` : `${hi}Sold out for now \u2014 I'll message you as soon as it restocks.` };
  if (/(pay|paypal|card|transfer|account|payment|trust|scam|legit|safe|refund|return)/.test(q))
    return { intent: "payment", answer: `${hi}Payment is through PayPal, so you can pay with your PayPal balance or a card and you're covered by PayPal Buyer Protection. ${linkLine}` };
  if (/(original|quality|material|real|fake|authentic|made of)/.test(q))
    return { intent: "quality", answer: `${hi}${p.description.split(" \u2014 ")[1]?.split(".")[0] ?? "Quality is guaranteed"}. Happy to send more photos or a quick video before you pay.` };
  return { intent: "general", answer: `${hi}${p.title} is ${price}. ${p.delivery ? p.delivery + ". " : ""}Any other question, just ask. ${linkLine}` };
}
function routeSellerMessage(msg) {
  const m = msg.trim();
  const lower = m.toLowerCase();
  const email = m.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const qty = parseInt(lower.match(/\b(\d{1,3})\s*(?:x\b|pcs|pieces|units|pairs|of\b)/)?.[1] || lower.match(/\bfor\s+(\d{1,3})\b(?!\s*k)/)?.[1] || "1", 10);
  if (/\binvoice\b|\bbill\b/.test(lower) && !/^(?:selling|new stock)/.test(lower)) {
    const name = m.match(/(?:[Ii]nvoice|[Bb]ill)\s+(?:to\s+|for\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/)?.[1];
    return { kind: "invoice", name, email, qty, productHint: m };
  }
  const quoted = m.match(/["“](.+?)["”]/)?.[1];
  if (quoted || /^(?:buyer|customer|client)\s+(?:asks?|asked|wants to know|said)|^reply (?:to|this)|^how do i (?:reply|answer)/i.test(m)) {
    const question = quoted || m.replace(/^(?:buyer|customer|client)\s+(?:asks?|asked|wants to know|said)\s*:?\s*/i, "").replace(/^reply (?:to|this)\s*:?\s*/i, "");
    return { kind: "buyer_question", question, productHint: m };
  }
  if (/(sales|revenue|how (?:much|many) (?:did|have) i|made today|this week|report|insight|dashboard|best ?seller|top product|performance)/.test(lower))
    return { kind: "sales" };
  if (/(status|has .* paid|did .* pay|is .* paid|check order)/.test(lower)) return { kind: "status", orderHint: m };
  if (/(pay(?:ment)? link|checkout|send (?:me )?(?:a |the )?link|paypal link|payment button|buy button)/.test(lower) && !/₦|\$|\d+\s?k\b|naira/.test(lower))
    return { kind: "checkout", qty, productHint: m };
  if (/(sell|selling|stock|price|₦|\$|\bn\d|\d+\s?k\b|naira|available|just in)/i.test(m) && m.length > 12) return { kind: "listing", text: m };
  return { kind: "help" };
}
function matchProduct(text, products) {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  let best;
  let bestScore = 0;
  for (const p of products) {
    const tw = p.title.toLowerCase().split(/\s+/);
    const score = tw.reduce((s, w) => s + (words.some((x) => x === w || w.length > 3 && (x.startsWith(w.slice(0, -1)) || w.startsWith(x))) ? 1 : 0), 0);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

// server/src/ai/llm.ts
function provider() {
  const a = config.ai;
  const want = a.provider;
  if (want === "rules") return null;
  if ((want === "gemini" || want === "auto") && a.geminiKey)
    return { name: `gemini:${a.geminiModel}`, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", key: a.geminiKey, model: a.geminiModel };
  if ((want === "openai" || want === "auto") && (a.openaiKey || /localhost|127\.0\.0\.1/.test(a.openaiBaseUrl) && want === "openai"))
    return { name: `openai-compatible:${a.openaiModel}`, baseUrl: a.openaiBaseUrl, key: a.openaiKey || "local", model: a.openaiModel };
  return null;
}
var llmAvailable = () => provider() !== null;
var engineName = () => provider()?.name ?? "rules (offline)";
async function chat(messages, opts = {}) {
  const p = provider();
  if (!p) throw new Error("No LLM provider configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25e3);
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        messages,
        temperature: opts.temperature ?? 0.4,
        ...opts.tools ? { tools: opts.tools, tool_choice: "auto" } : {},
        ...opts.json ? { response_format: { type: "json_object" } } : {}
      })
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const msg = data.choices?.[0]?.message ?? {};
    return { content: msg.content ?? null, tool_calls: msg.tool_calls };
  } finally {
    clearTimeout(timer);
  }
}
async function chatJson(system, user) {
  const r = await chat([{ role: "system", content: system }, { role: "user", content: user }], { json: true, temperature: 0.5 });
  const text = (r.content || "").replace(/^```(?:json)?|```$/g, "").trim();
  return JSON.parse(text);
}

// server/src/ai/copilot.ts
async function draftListing(text) {
  const base = buildListing(text, { ngnPerUsd: config.ngnPerUsd, shopName: config.shopName });
  if (!llmAvailable()) return { ...base, source: "rules" };
  try {
    const ai = await chatJson(
      `You write high-converting social-commerce listings for small Nigerian online sellers (Instagram/WhatsApp).
Return JSON with keys: title (<=60 chars), description (2-3 sentences, warm, honest, no invented facts), caption (Instagram/WhatsApp caption with emojis and line breaks, end with a call to pay via the PayPal link), hashtags (array of 5-7), faq (array of {q,a}, 4 items).
Never change price, stock, sizes, colours or delivery facts \u2014 they are given to you.`,
      `Seller message: """${text}"""
Extracted facts: ${JSON.stringify({ priceUsd: base.priceUsd, priceNgn: base.priceNgn, stock: base.stock, colors: base.colors, sizes: base.sizes, delivery: base.delivery, category: base.category })}`
    );
    return {
      ...base,
      title: ai.title?.slice(0, 80) || base.title,
      description: ai.description || base.description,
      caption: ai.caption || base.caption,
      hashtags: Array.isArray(ai.hashtags) && ai.hashtags.length ? ai.hashtags.slice(0, 7) : base.hashtags,
      faq: Array.isArray(ai.faq) && ai.faq.length ? ai.faq.slice(0, 6) : base.faq,
      source: "llm"
    };
  } catch (e) {
    console.warn("[ai] listing LLM failed, using rules:", e.message);
    return { ...base, source: "rules" };
  }
}
async function replyToBuyer(question, product, payLink) {
  const base = answerBuyer(question, product, payLink);
  if (!llmAvailable()) return { ...base, source: "rules" };
  try {
    const ai = await chatJson(
      `You are the friendly sales assistant of a small Nigerian online shop. Answer the buyer in 1-3 short sentences, in the buyer's register (reply in Nigerian Pidgin if they wrote Pidgin).
Only use the product facts given; if a fact is unknown, say the seller will confirm. Always end with the payment link when the buyer seems ready to buy. Return JSON {"answer": string, "intent": string}.`,
      `Product facts: ${JSON.stringify(product)}
Payment link: ${payLink}
Buyer: """${question}"""`
    );
    if (!ai.answer) throw new Error("empty");
    return { answer: ai.answer, intent: ai.intent || base.intent, source: "llm" };
  } catch {
    return { ...base, source: "rules" };
  }
}

// server/src/services.ts
var slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
var storefrontUrl = (p) => `${config.publicUrl}/p/${p.slug}`;
async function createProductFromText(text) {
  const d = await draftListing(text);
  let slug = slugify(d.title) || "item";
  if (store.findProduct(slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const product = {
    id: uid("prd"),
    slug,
    title: d.title,
    description: d.description,
    category: d.category,
    emoji: d.emoji,
    priceUsd: d.priceUsd,
    priceNgn: d.priceNgn,
    stock: d.stock,
    colors: d.colors,
    sizes: d.sizes,
    delivery: d.delivery,
    hashtags: d.hashtags,
    caption: d.caption,
    faq: d.faq,
    rawInput: text,
    source: d.source,
    views: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  store.addProduct(product);
  return { product, warnings: d.warnings };
}
async function qrDataUrl(text) {
  return QRCode.toDataURL(text, { margin: 1, width: 240, color: { dark: "#0b1f3a", light: "#ffffff" } });
}
async function createCheckout(productIdOrSlug, qty = 1, channel = "storefront", color, size, redirect = true) {
  const p = store.findProduct(productIdOrSlug);
  if (!p) throw new Error("Product not found");
  if (p.priceUsd <= 0) throw new Error("This product has no price yet");
  qty = Math.max(1, Math.min(qty, Math.max(1, p.stock), 50));
  if (p.stock <= 0) throw new Error("Out of stock");
  const localId = uid("ord");
  const variant = [color, size].filter(Boolean).join(" / ");
  const pp2 = await createOrder({
    referenceId: localId,
    items: [{ name: p.title + (variant ? ` (${variant})` : ""), qty, unitUsd: p.priceUsd, sku: p.id, description: p.category }],
    description: `${config.shopName}: ${p.title}`,
    returnUrl: `${config.publicUrl}/paid?order=${localId}`,
    cancelUrl: `${config.publicUrl}/p/${p.slug}?cancelled=1`,
    redirect
  });
  return store.addOrder({
    id: localId,
    paypalOrderId: pp2.id,
    productId: p.id,
    title: p.title,
    qty,
    amountUsd: round2(p.priceUsd * qty),
    status: pp2.status,
    approveUrl: pp2.approveUrl,
    channel,
    mock: pp2.mock,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function captureCheckout(idOrPaypalId) {
  const o = store.findOrder(idOrPaypalId);
  if (!o) throw new Error("Order not found");
  if (o.status === "COMPLETED") return o;
  const cap2 = await captureOrder(o.paypalOrderId);
  const patch = { status: cap2.status, captureId: cap2.captureId, buyerName: cap2.payerName, buyerEmail: cap2.payerEmail };
  if (cap2.status === "COMPLETED") {
    patch.capturedAt = (/* @__PURE__ */ new Date()).toISOString();
    const p = store.findProduct(o.productId);
    if (p) store.updateProduct(p.id, { stock: Math.max(0, p.stock - o.qty) });
  }
  return store.updateOrder(o.id, patch);
}
async function refreshOrder(idOrPaypalId) {
  const o = store.findOrder(idOrPaypalId);
  if (!o) throw new Error("Order not found");
  if (o.status === "COMPLETED" || o.sample) return o;
  const d = await getOrder(o.paypalOrderId);
  return store.updateOrder(o.id, { status: d.status });
}
async function createInvoice(input) {
  const items = input.items.map((i) => {
    const p = store.findProduct(i.productId);
    if (!p) throw new Error(`Unknown product ${i.productId}`);
    return { productId: p.id, title: p.title, qty: Math.max(1, i.qty), unitUsd: p.priceUsd };
  });
  if (!items.length) throw new Error("Invoice needs at least one item");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.recipientEmail)) throw new Error("A valid buyer email is needed for a PayPal invoice");
  const r = await createAndSendInvoice({ recipientName: input.recipientName, recipientEmail: input.recipientEmail, items: items.map((i) => ({ name: i.title, qty: i.qty, unitUsd: i.unitUsd })), note: input.note });
  return store.addInvoice({
    id: uid("inv"),
    paypalInvoiceId: r.id,
    number: r.number,
    recipientName: input.recipientName,
    recipientEmail: input.recipientEmail,
    items,
    totalUsd: round2(items.reduce((s, i) => s + i.unitUsd * i.qty, 0)),
    status: r.status,
    payerViewUrl: r.payerViewUrl,
    qrPngBase64: r.qrPngBase64,
    via: r.mock ? "mock" : "paypal-agent-toolkit",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function buyerAnswer(productIdOrSlug, question) {
  const p = store.findProduct(productIdOrSlug);
  if (!p) throw new Error("Product not found");
  const r = await replyToBuyer(question, p, storefrontUrl(p));
  return { ...r, product: p };
}
function dashboard() {
  const orders = store.orders();
  const paid = orders.filter((o) => o.status === "COMPLETED");
  const revenueUsd = round2(paid.reduce((s, o) => s + o.amountUsd, 0));
  const byProduct = /* @__PURE__ */ new Map();
  for (const o of paid) {
    const e = byProduct.get(o.productId) || { title: o.title, units: 0, revenueUsd: 0 };
    e.units += o.qty;
    e.revenueUsd = round2(e.revenueUsd + o.amountUsd);
    byProduct.set(o.productId, e);
  }
  const top = [...byProduct.values()].sort((a, b) => b.revenueUsd - a.revenueUsd)[0];
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    const dayPaid = paid.filter((o) => (o.capturedAt || o.createdAt).slice(0, 10) === d);
    days.push({ date: d, revenueUsd: round2(dayPaid.reduce((s, o) => s + o.amountUsd, 0)), orders: dayPaid.length });
  }
  const products = store.products();
  const lowStock = products.filter((p) => p.stock <= 3).map((p) => ({ title: p.title, stock: p.stock }));
  const invoices = store.invoices();
  const pending = orders.filter((o) => o.status !== "COMPLETED" && o.status !== "VOIDED");
  const conversion = orders.length ? paid.length / orders.length : 0;
  const insights = [];
  if (top) insights.push(`${top.title} is your best seller (${top.units} sold, $${top.revenueUsd.toFixed(2)}). Post it again on your Status tonight.`);
  for (const l of lowStock.slice(0, 2)) insights.push(`Only ${l.stock} ${l.title} left \u2014 restock or raise the price slightly.`);
  const viewedNoSale = products.filter((p) => p.views >= 5 && !byProduct.has(p.id)).slice(0, 1);
  for (const p of viewedNoSale) insights.push(`${p.title} has ${p.views} views but no sales yet \u2014 try a clearer photo or a bundle offer.`);
  if (pending.length) insights.push(`${pending.length} checkout${pending.length > 1 ? "s" : ""} started but not paid \u2014 send a friendly reminder with the same link.`);
  if (conversion > 0 && conversion < 0.4) insights.push(`Only ${(conversion * 100).toFixed(0)}% of pay links get paid. Answer buyer questions faster with the Copilot's reply drafts.`);
  if (!insights.length) insights.push("Create your first listing in the Copilot tab, then share the PayPal link on WhatsApp.");
  return {
    revenueUsd,
    revenueNgn: Math.round(revenueUsd * config.ngnPerUsd),
    paidOrders: paid.length,
    pendingOrders: pending.length,
    conversionRate: round2(conversion),
    avgOrderUsd: paid.length ? round2(revenueUsd / paid.length) : 0,
    topProduct: top,
    daily: days,
    lowStock,
    invoices: { sent: invoices.length, paid: invoices.filter((i) => i.status === "PAID").length, outstandingUsd: round2(invoices.filter((i) => i.status !== "PAID").reduce((s, i) => s + i.totalUsd, 0)) },
    insights,
    hasSample: orders.some((o) => o.sample) || products.some((p) => p.sample)
  };
}

// server/src/agent.ts
var TOOLS = [
  { type: "function", function: { name: "create_listing", description: "Turn a seller's chat-style product description into a saved product listing (title, description, price, stock, caption, hashtags, FAQ). Also creates its shareable PayPal checkout page.", parameters: { type: "object", properties: { text: { type: "string", description: "The seller's raw product description, verbatim" } }, required: ["text"] } } },
  { type: "function", function: { name: "create_checkout_link", description: "Create a PayPal checkout order (Orders v2) for an existing product and return the PayPal pay link to send to a buyer.", parameters: { type: "object", properties: { product: { type: "string", description: "Product id or words from its title" }, qty: { type: "integer", minimum: 1 } }, required: ["product"] } } },
  { type: "function", function: { name: "send_paypal_invoice", description: "Create and email a PayPal invoice (via the PayPal Agent Toolkit) to a buyer for products in the catalog.", parameters: { type: "object", properties: { recipient_name: { type: "string" }, recipient_email: { type: "string" }, product: { type: "string" }, qty: { type: "integer", minimum: 1 }, note: { type: "string" } }, required: ["recipient_name", "recipient_email", "product"] } } },
  { type: "function", function: { name: "answer_buyer_question", description: "Draft a reply to a buyer question about a product, including the pay link.", parameters: { type: "object", properties: { question: { type: "string" }, product: { type: "string" } }, required: ["question"] } } },
  { type: "function", function: { name: "get_sales_summary", description: "Get revenue, paid/pending orders, best seller, low stock and insights.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "check_order_status", description: "Check the latest PayPal status of the most recent order, or one matching a product/buyer.", parameters: { type: "object", properties: { hint: { type: "string" } } } } }
];
function resolveProduct(hint) {
  const products = store.products();
  if (!hint) return products[0];
  return store.findProduct(hint) || matchProduct(hint, products) || products[0];
}
async function runTool(name, args) {
  switch (name) {
    case "create_listing": {
      const { product, warnings } = await createProductFromText(String(args.text || ""));
      const url = storefrontUrl(product);
      return {
        via: "sellerpilot",
        summary: `Listed "${product.title}" at ${formatPrice(product.priceUsd, product.priceNgn)}, ${product.stock} in stock${warnings.length ? ` (${warnings.join(" ")})` : ""}`,
        cards: [{ type: "listing", product }, { type: "checkout", product, storefrontUrl: url, qrDataUrl: await qrDataUrl(url) }],
        data: { id: product.id, title: product.title, priceUsd: product.priceUsd, url, warnings }
      };
    }
    case "create_checkout_link": {
      const p = resolveProduct(args.product);
      if (!p) throw new Error("I could not find that product. Create a listing first.");
      const order = await createCheckout(p.id, Number(args.qty) || 1, "agent-link");
      const link = order.approveUrl || storefrontUrl(p);
      return {
        via: "paypal-orders-v2",
        summary: `PayPal order ${order.paypalOrderId} for ${order.qty} \xD7 ${p.title} = $${order.amountUsd.toFixed(2)}`,
        cards: [{ type: "checkout", product: p, storefrontUrl: storefrontUrl(p), order, qrDataUrl: await qrDataUrl(link) }],
        data: { orderId: order.paypalOrderId, payLink: link, amountUsd: order.amountUsd }
      };
    }
    case "send_paypal_invoice": {
      const p = resolveProduct(args.product);
      if (!p) throw new Error("Which product is this invoice for?");
      if (!args.recipient_email) throw new Error("I need the buyer's email address to send a PayPal invoice.");
      const inv = await createInvoice({ recipientName: args.recipient_name || "Customer", recipientEmail: args.recipient_email, items: [{ productId: p.id, qty: Number(args.qty) || 1 }], note: args.note });
      return {
        via: inv.via === "mock" ? "sellerpilot" : "paypal-agent-toolkit",
        summary: `Invoice ${inv.number ? "#" + inv.number + " " : ""}(${inv.paypalInvoiceId}) for $${inv.totalUsd.toFixed(2)} sent to ${inv.recipientEmail}`,
        cards: [{ type: "invoice", invoice: inv }],
        data: { invoiceId: inv.paypalInvoiceId, status: inv.status, payerViewUrl: inv.payerViewUrl, totalUsd: inv.totalUsd }
      };
    }
    case "answer_buyer_question": {
      const p = resolveProduct(args.product || args.question);
      if (!p) throw new Error("Create a listing first so I know what the buyer is asking about.");
      const r = await buyerAnswer(p.id, String(args.question));
      return { via: r.source === "llm" ? "llm" : "sellerpilot", summary: `Drafted a "${r.intent}" reply for ${p.title}`, cards: [{ type: "reply", question: args.question, answer: r.answer, product: p }], data: { answer: r.answer } };
    }
    case "get_sales_summary": {
      const stats = dashboard();
      return { via: "sellerpilot", summary: `Revenue $${stats.revenueUsd.toFixed(2)} from ${stats.paidOrders} paid orders`, cards: [{ type: "summary", stats }], data: stats };
    }
    case "check_order_status": {
      const orders = store.orders().filter((o2) => !o2.sample);
      const p = args.hint ? matchProduct(args.hint, store.products()) : void 0;
      const o = p && orders.find((x) => x.productId === p.id) || orders[0];
      if (!o) throw new Error("No orders yet.");
      const fresh = await refreshOrder(o.id).catch(() => o);
      return { via: "paypal-orders-v2", summary: `Order ${fresh.paypalOrderId} is ${fresh.status}`, cards: [{ type: "order", order: fresh }], data: { status: fresh.status } };
    }
  }
  throw new Error(`Unknown tool ${name}`);
}
async function exec(name, args, actions, cards) {
  const t0 = Date.now();
  try {
    const out = await runTool(name, args);
    actions.push({ tool: name, via: out.via, summary: out.summary, ok: true, ms: Date.now() - t0 });
    cards.push(...out.cards);
    return { ok: true, ...out };
  } catch (e) {
    const msg = e instanceof PayPalError ? `${e.message}` : e.message;
    actions.push({ tool: name, via: name.includes("invoice") ? "paypal-agent-toolkit" : name.includes("checkout") || name.includes("order") ? "paypal-orders-v2" : "sellerpilot", summary: msg, ok: false, ms: Date.now() - t0 });
    return { ok: false, error: msg };
  }
}
var HELP = `I'm your SellerPilot. Try:
\u2022 "Selling Ankara tote bags, 15k each, red and blue, 12 in stock, delivery in Lagos 1\u20132 days"
\u2022 "Send a payment link for 2 tote bags"
\u2022 "Invoice Chioma Okafor chioma@example.com for 2 tote bags"
\u2022 Customer asked: "how much e be, una dey deliver to Abuja?"
\u2022 "How are my sales this week?"`;
async function rulePlanner(message) {
  const actions = [];
  const cards = [];
  const intent = routeSellerMessage(message);
  let reply = "";
  switch (intent.kind) {
    case "listing": {
      const r = await exec("create_listing", { text: intent.text }, actions, cards);
      reply = r.ok ? "Done! I created the listing, a caption you can paste on Instagram/WhatsApp, and a PayPal checkout page buyers can pay on right away." : `I couldn't create that listing: ${r.error}`;
      break;
    }
    case "checkout": {
      const r = await exec("create_checkout_link", { product: intent.productHint, qty: intent.qty }, actions, cards);
      reply = r.ok ? "Here is a PayPal pay link for that exact order. Send it to your buyer \u2014 I'll mark it paid the moment PayPal confirms." : `Couldn't create the pay link: ${r.error}`;
      break;
    }
    case "invoice": {
      const p = resolveProduct(intent.productHint);
      const r = await exec("send_paypal_invoice", { recipient_name: intent.name || "Customer", recipient_email: intent.email, product: p?.id, qty: intent.qty }, actions, cards);
      reply = r.ok ? "Invoice created and sent through PayPal. Your buyer gets an email with a Pay Now button, and I added a QR code you can share on WhatsApp." : `Couldn't send the invoice: ${r.error}`;
      break;
    }
    case "buyer_question": {
      const r = await exec("answer_buyer_question", { question: intent.question, product: intent.productHint }, actions, cards);
      reply = r.ok ? "Here's a reply you can paste back to your customer:" : `${r.error}`;
      break;
    }
    case "sales": {
      await exec("get_sales_summary", {}, actions, cards);
      reply = "Here's how your shop is doing:";
      break;
    }
    case "status": {
      const r = await exec("check_order_status", { hint: intent.orderHint }, actions, cards);
      reply = r.ok ? "Latest status from PayPal:" : `${r.error}`;
      break;
    }
    default:
      reply = HELP;
  }
  return { reply, actions, cards, engine: "rules (offline)" };
}
async function llmPlanner(message, history) {
  const actions = [];
  const cards = [];
  const catalog = store.products().slice(0, 20).map((p) => ({ id: p.id, title: p.title, priceUsd: p.priceUsd, stock: p.stock }));
  const messages = [
    { role: "system", content: `You are SellerPilot, an agent that runs PayPal payments for a small Nigerian Instagram/WhatsApp seller ("${config.shopName}"). Use tools to actually do the work (create listings, PayPal pay links, PayPal invoices, buyer replies, sales summaries) instead of just advising. Never invent prices \u2014 they come from the catalog. Be brief and warm. Catalog: ${JSON.stringify(catalog)}` },
    ...history.slice(-6).map((h2) => ({ role: h2.role, content: h2.content })),
    { role: "user", content: message }
  ];
  for (let step = 0; step < 4; step++) {
    const t0 = Date.now();
    let r;
    try {
      r = await chat(messages, { tools: TOOLS });
    } catch (e) {
      if (!actions.length) throw e;
      return { reply: "Done \u2014 see the actions above.", actions, cards, engine: engineName() };
    }
    if (!r.tool_calls?.length) {
      actions.push({ tool: "plan", via: "llm", summary: engineName(), ok: true, ms: Date.now() - t0 });
      return { reply: r.content || "Done.", actions, cards, engine: engineName() };
    }
    messages.push({ role: "assistant", content: r.content, tool_calls: r.tool_calls });
    for (const call of r.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
      }
      const out = await exec(call.function.name, args, actions, cards);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out.ok ? out.data : { error: out.error }) });
    }
  }
  return { reply: "Done \u2014 see the actions above.", actions, cards, engine: engineName() };
}
async function runAgent(message, history = []) {
  if (llmAvailable()) {
    try {
      return await llmPlanner(message, history);
    } catch (e) {
      console.warn("[agent] LLM planner failed, falling back to rules:", e.message);
    }
  }
  return rulePlanner(message);
}
var agentToolNames = () => TOOLS.map((t) => t.function.name);

// server/src/seed.ts
var SAMPLES = [
  "Handmade coral bead necklaces \u20A612,500, red and gold, 8 in stock, delivery nationwide 2-4 days",
  "New stock: Adire two-piece sets \u20A628,000, sizes S, M, L, XL, 6 pieces left. We ship nationwide and to the UK",
  "Fresh chin chin 1kg jar going for 4500 naira, 30 jars available, pickup in Port Harcourt or delivery",
  "Unisex palm slippers $18, sizes 38-45, black and brown, 3 pairs left, delivery nationwide"
];
function seedSample() {
  const now = Date.now();
  const products = SAMPLES.map((text, i) => {
    const d = buildListing(text, { ngnPerUsd: config.ngnPerUsd, shopName: config.shopName });
    return { id: uid("prd"), slug: d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "") + "-s" + i, ...d, rawInput: text, source: "rules", views: [42, 18, 25, 9][i], createdAt: new Date(now - (8 - i) * 864e5).toISOString(), sample: true };
  });
  const orders = [];
  const pattern = [[0, 2], [2, 3], [0, 1], [1, 1], [2, 2], [0, 1], [3, 1], [2, 4], [0, 2], [1, 1]];
  pattern.forEach(([pi, qty], k) => {
    const p = products[pi];
    const day = now - (6 - Math.floor(k / 1.5)) * 864e5;
    const paid = k % 4 !== 3;
    orders.push({ id: uid("ord"), paypalOrderId: "SAMPLE" + (1e3 + k), productId: p.id, title: p.title, qty, amountUsd: Math.round(p.priceUsd * qty * 100) / 100, status: paid ? "COMPLETED" : "PAYER_ACTION_REQUIRED", channel: k % 3 ? "storefront" : "agent-link", buyerName: ["Tolu A.", "Chioma O.", "Emeka N.", "Aisha B.", "Kemi D."][k % 5], sample: true, createdAt: new Date(day).toISOString(), capturedAt: paid ? new Date(day + 36e5).toISOString() : void 0 });
  });
  const db2 = store.raw();
  store.replace({ products: [...db2.products.filter((p) => !p.sample), ...products], orders: [...db2.orders.filter((o) => !o.sample), ...orders], invoices: db2.invoices });
}

// server/src/index.ts
load();
if (process.env.VERCEL && store.products().length === 0) seedSample();
var app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));
var h = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((v) => {
  if (!res.headersSent) res.json(v);
}).catch(next);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/config", h(async () => ({
  shopName: config.shopName,
  paypalMode: paypalMode(),
  paypalClientId: paypalMode() === "mock" ? null : config.paypal.clientId,
  payeeOverride: Boolean(config.paypal.payeeEmail),
  aiEngine: engineName(),
  ngnPerUsd: config.ngnPerUsd,
  agentTools: agentToolNames(),
  paypalToolkitTools: paypalMode() === "mock" ? [] : await toolkitToolNames()
})));
app.post("/api/agent", h((req) => runAgent(String(req.body.message || ""), Array.isArray(req.body.history) ? req.body.history : [])));
app.post("/api/ai/listing", h((req) => draftListing(String(req.body.text || ""))));
app.get("/api/products", h(() => store.products()));
app.post("/api/products", h(async (req) => (await createProductFromText(String(req.body.text || ""))).product));
app.get("/api/products/:id", h((req, res) => {
  const p = store.findProduct(String(req.params.id));
  if (!p) return res.status(404).json({ error: "Not found" });
  if (req.query.view) store.updateProduct(p.id, { views: p.views + 1 });
  return p;
}));
app.patch("/api/products/:id", h((req, res) => {
  const allowed = ["title", "description", "priceUsd", "priceNgn", "stock", "caption", "delivery"];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  const p = store.updateProduct(String(req.params.id), patch);
  return p ?? res.status(404).json({ error: "Not found" });
}));
app.delete("/api/products/:id", h((req) => {
  store.deleteProduct(String(req.params.id));
  return { ok: true };
}));
app.post("/api/products/:id/ask", h((req) => buyerAnswer(String(req.params.id), String(req.body.question || ""))));
app.get("/api/products/:id/qr", h(async (req, res) => {
  const p = store.findProduct(String(req.params.id));
  if (!p) return res.status(404).json({ error: "Not found" });
  return { url: storefrontUrl(p), dataUrl: await qrDataUrl(storefrontUrl(p)) };
}));
app.get("/api/orders", h(() => store.orders()));
app.post("/api/orders", h((req) => createCheckout(String(req.body.productId), Number(req.body.qty) || 1, req.body.channel === "agent-link" ? "agent-link" : "storefront", req.body.color, req.body.size, req.body.flow !== "sdk")));
app.get("/api/orders/:id", h((req) => refreshOrder(String(req.params.id))));
app.post("/api/orders/:id/capture", h((req) => captureCheckout(String(req.params.id))));
app.get("/api/invoices", h(() => store.invoices()));
app.post("/api/invoices", h((req) => createInvoice(req.body)));
app.get("/api/dashboard", h(() => dashboard()));
app.post("/api/demo/seed", h(() => {
  seedSample();
  return { ok: true };
}));
app.post("/api/demo/clear-sample", h(() => {
  store.clearSample();
  return { ok: true };
}));
var dist = path2.resolve("dist");
if (fs2.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path2.join(dist, "index.html")));
}
app.use((err, _req, res, _next) => {
  const status = err instanceof PayPalError ? err.status >= 400 && err.status < 600 ? err.status : 502 : 400;
  console.error("[error]", err.message, err instanceof PayPalError ? JSON.stringify(err.details)?.slice(0, 500) : "");
  res.status(status).json({ error: err.message, details: err instanceof PayPalError ? err.details : void 0 });
});
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    if (paypalMode() !== "mock") warmToolkit().then(() => console.log("PayPal Agent Toolkit loaded")).catch((e) => console.warn("Agent Toolkit failed to load", e.message));
    console.log(`SellerPilot API on http://localhost:${config.port}  |  PayPal: ${paypalMode()}  |  AI: ${engineName()}`);
  });
}
var index_default = app;
export {
  app,
  index_default as default
};
