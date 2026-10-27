/**
 * Offline "AI" engine: deterministic NLP rules + templates.
 * It understands the way Nigerian Instagram/WhatsApp vendors actually write
 * ("15k", "₦15,000", "N15000", "sizes 38-45", light Pidgin like "how much e be?")
 * and is the fallback whenever no LLM key is configured or the LLM call fails.
 */

export interface ListingDraft {
  title: string;
  description: string;
  category: string;
  emoji: string;
  priceUsd: number;
  priceNgn?: number;
  stock: number;
  colors: string[];
  sizes: string[];
  delivery?: string;
  hashtags: string[];
  caption: string;
  faq: { q: string; a: string }[];
  warnings: string[];
}

const COLORS = ['black', 'white', 'red', 'blue', 'navy', 'green', 'yellow', 'pink', 'purple', 'brown', 'beige', 'cream', 'gold', 'silver', 'grey', 'gray', 'orange', 'wine', 'maroon', 'nude', 'teal', 'peach', 'lilac', 'mustard', 'multicolour', 'multicolor'];

const CATEGORIES: { name: string; emoji: string; words: RegExp; tags: string[]; pitch: string }[] = [
  { name: 'Bags', emoji: '👜', words: /\b(bag|bags|tote|purse|clutch|backpack)\b/i, tags: ['#bags', '#totebag'], pitch: 'Roomy, sturdy and made to turn heads on every outing.' },
  { name: 'Footwear', emoji: '👟', words: /\b(shoe|shoes|sneaker|sneakers|slides?|sandals?|heels|loafers?|palm slippers?|slippers?)\b/i, tags: ['#shoes', '#footwear'], pitch: 'Comfortable all-day wear with a clean, durable finish.' },
  { name: 'Fashion', emoji: '👗', words: /\b(dress|gown|ankara|adire|aso[- ]?oke|kaftan|agbada|shirt|top|skirt|trouser|jeans|abaya|two[- ]?piece|outfit|jalabiya)\b/i, tags: ['#fashion', '#africanfashion'], pitch: 'Tailored to flatter, with fabric that breathes in our weather.' },
  { name: 'Hair & Wigs', emoji: '💇🏾‍♀️', words: /\b(wig|wigs|bundle|bundles|frontal|closure|braids?|hair)\b/i, tags: ['#wigs', '#hairvendor'], pitch: 'Soft, full and easy to style straight out of the pack.' },
  { name: 'Beauty & Skincare', emoji: '🧴', words: /\b(cream|serum|soap|skincare|lotion|body butter|shea|oil|perfume|fragrance|scent|lip ?gloss|makeup)\b/i, tags: ['#skincare', '#beauty'], pitch: 'Gentle, effective and loved by repeat customers.' },
  { name: 'Food & Drinks', emoji: '🍲', words: /\b(chin ?chin|zobo|kunu|puff[- ]?puff|cake|cakes|small chops|jollof|spice|pepper|plantain chips|food|snack|snacks|honey|tigernut)\b/i, tags: ['#foodvendor', '#naijafood'], pitch: 'Freshly made in small batches, packed hygienically.' },
  { name: 'Jewellery', emoji: '💍', words: /\b(bead|beads|necklace|bracelet|earrings?|ring|rings|anklet|jewel(?:le)?ry)\b/i, tags: ['#jewelry', '#handmadejewelry'], pitch: 'Statement pieces that finish any look.' },
  { name: 'Gadgets', emoji: '🎧', words: /\b(phone|iphone|charger|earbuds?|airpods|headphones?|power ?bank|smart ?watch|laptop|case|cases)\b/i, tags: ['#gadgets', '#techdeals'], pitch: 'Tested before dispatch so it works out of the box.' },
  { name: 'Home & Decor', emoji: '🕯️', words: /\b(candle|candles|throw pillow|cushion|rug|decor|vase|bedsheet|duvet|curtain)\b/i, tags: ['#homedecor', '#homeinterior'], pitch: 'Little touches that make your space feel finished.' },
];

const STOP_PREFIX = /^(?:hi+|hello|hey|good (?:morning|afternoon|evening)|pls|please|abeg|ok(?:ay)?|so)\b[\s,!.:-]*/i;
const SELL_PREFIX = /^(?:i(?:'m| am)?\s+(?:now\s+)?(?:selling|sell)|we(?:'re| are)?\s+selling|selling|new stock(?: of)?|just in|now available|available|fresh(?:ly)?|restocked|in stock)\s*[:\-–]?\s*/i;

export function round2(n: number) { return Math.round(n * 100) / 100; }

function toNumber(raw: string, k?: string) {
  const n = parseFloat(raw.replace(/,/g, ''));
  if (Number.isNaN(n)) return undefined;
  return k ? n * 1000 : n;
}

export function parsePrice(text: string, ngnPerUsd: number): { usd?: number; ngn?: number } {
  const t = text.replace(/\s+/g, ' ');
  const usd =
    t.match(/(?:\$|us\$|usd\s?)\s?(\d+(?:[.,]\d{1,2})?)/i) ||
    t.match(/(\d+(?:\.\d{1,2})?)\s?(?:usd|dollars?|bucks)\b/i);
  const ngn =
    t.match(/(?:₦|ngn\s?|\bn(?=\d))\s?(\d[\d,]*(?:\.\d+)?)\s?(k)?\b/i) ||
    t.match(/(\d[\d,]*(?:\.\d+)?)\s?(k)?\s?(?:naira|ngn)\b/i) ||
    t.match(/\b(\d{1,4}(?:\.\d)?)(k)\b/i);
  const out: { usd?: number; ngn?: number } = {};
  if (ngn) out.ngn = toNumber(ngn[1], ngn[2]);
  if (usd) out.usd = toNumber(usd[1]);
  if (out.ngn && !out.usd) out.usd = round2(out.ngn / ngnPerUsd);
  return out;
}

export function parseStock(text: string): number | undefined {
  const m =
    text.match(/(\d+)\s*(?:pcs|pieces|units|pairs|bottles|packs|jars|sets|left|in stock|available|remaining)\b/i) ||
    text.match(/(?:stock|qty|quantity)\s*(?:of|:|is|=)?\s*(\d+)/i) ||
    text.match(/only\s+(\d+)\b/i);
  return m ? parseInt(m[1], 10) : undefined;
}

export function parseColors(text: string): string[] {
  const found = new Set<string>();
  for (const c of COLORS) if (new RegExp(`\\b${c}\\b`, 'i').test(text)) found.add(c === 'gray' ? 'grey' : c);
  return [...found].map(cap);
}

export function parseSizes(text: string): string[] {
  const m = text.match(/sizes?\s*(?:available|:|-|are|from|in)?\s*([^.;!\n]+)/i);
  if (!m) {
    const letters = text.match(/\b(XS|S|M|L|XL|XXL|XXXL)(?:\s*[,/]\s*(XS|S|M|L|XL|XXL|XXXL))+\b/);
    return letters ? letters[0].split(/\s*[,/]\s*/) : [];
  }
  const tokens = m[1].split(/\s*(?:,|\/|&|\band\b|\bor\b)\s*/i).map((t) => t.trim()).filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    const range = tok.match(/^(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})$/);
    if (range) {
      const a = +range[1], b = +range[2];
      if (b > a && b - a <= 15) { for (let i = a; i <= b; i++) out.push(String(i)); continue; }
    }
    if (/^(?:xs|s|m|l|xl|xxl|xxxl|[2-5]xl|\d{1,2}(?:\.5)?|uk\s?\d{1,2}|one size|free size)$/i.test(tok)) { out.push(tok.toUpperCase()); continue; }
    break; // first token that is not a size ends the list
  }
  return out;
}

export function parseDelivery(text: string): string | undefined {
  const sentences = text.split(/(?<=[.!\n])\s+|,\s*(?=deliver|ship|dispatch|we deliver|pickup|pick-up)/i);
  const s = sentences.find((x) => /\b(deliver|delivery|ship|shipping|dispatch|nationwide|pick ?-?up|waybill)\b/i.test(x));
  return s ? cap(s.trim().replace(/[.,;]+$/, '')) : undefined;
}

export function guessCategory(text: string) {
  return CATEGORIES.find((c) => c.words.test(text)) ?? { name: 'General', emoji: '🛍️', tags: ['#shopsmall'], pitch: 'Quality you can trust, from a seller who cares.' };
}

export function extractProductName(text: string): string {
  let first = text.trim().split(/\n/)[0];
  first = first.replace(STOP_PREFIX, '').replace(STOP_PREFIX, '');
  first = first.replace(SELL_PREFIX, '');
  // cut at the first price / separator
  const cut = first.search(/\s(?:for|at|@|going for|now)\s+(?:₦|n\d|\$|\d)|[,.;!(]|\s-\s|₦|\$|\bN\d|\b\d[\d,]*\s?(?:k|naira|ngn|usd)\b|\beach\b|\bin stock\b|\bsizes?\b|\bavailable\b/i);
  let name = (cut > 0 ? first.slice(0, cut) : first).trim();
  name = name.replace(/^(?:a|an|the|some|my|our|new|brand new)\s+/i, '').replace(/\s+(?:for sale|now)$/i, '');
  const words = name.split(/\s+/).slice(0, 7);
  return words.length ? titleCase(words.join(' ')) : 'New Product';
}

export function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
export function titleCase(s: string) {
  const small = new Set(['and', 'or', 'of', 'with', 'for', 'in', 'on', 'the', 'a', 'to']);
  return s.toLowerCase().split(' ').map((w, i) => (i > 0 && small.has(w) ? w : cap(w))).join(' ')
    .replace(/\bAnkara\b/g, 'Ankara').replace(/\bAso[- ]?oke\b/gi, 'Aso-Oke');
}

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtNgn = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;
export const formatPrice = (usd: number, ngn?: number) => (ngn ? `${fmtNgn(ngn)} (≈ ${fmtUsd(usd)})` : fmtUsd(usd));

export function buildListing(text: string, opts: { ngnPerUsd: number; shopName: string }): ListingDraft {
  const warnings: string[] = [];
  const price = parsePrice(text, opts.ngnPerUsd);
  if (!price.usd) warnings.push('No price found — set one before sharing the link.');
  const stock = parseStock(text) ?? 10;
  if (parseStock(text) === undefined) warnings.push('Stock not mentioned — assumed 10.');
  const colors = parseColors(text);
  const sizes = parseSizes(text);
  const delivery = parseDelivery(text);
  const cat = guessCategory(text);
  const title = extractProductName(text);
  const handmade = /\b(handmade|hand-made|handcrafted|made in nigeria|local|adire|ankara|aso[- ]?oke)\b/i.test(text);

  const lines = [
    `${title} — ${cat.pitch}`,
    handmade ? 'Handcrafted in Nigeria by independent makers.' : '',
    colors.length ? `Colours: ${colors.join(', ')}.` : '',
    sizes.length ? `Sizes: ${sizes.join(', ')}.` : '',
    delivery ? `${delivery}.` : '',
    `Pay securely with PayPal — card or PayPal balance, buyer protection included.`,
  ].filter(Boolean);
  const description = lines.join(' ');

  const tagWords = title.split(' ').filter((w) => w.length > 3).slice(0, 2).map((w) => '#' + w.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const hashtags = [...new Set([...cat.tags, ...tagWords, handmade ? '#madeinnigeria' : '#shopsmall', '#paypal'])].slice(0, 7);

  const priceLine = price.usd ? formatPrice(price.usd, price.ngn) : 'DM for price';
  const caption = [
    `${cat.emoji} ${title.toUpperCase()} ${cat.emoji}`,
    cat.pitch,
    colors.length ? `🎨 ${colors.join(' • ')}` : '',
    sizes.length ? `📏 Sizes: ${sizes.join(', ')}` : '',
    `💰 ${priceLine}`,
    stock <= 10 ? `⚡ Only ${stock} available!` : `📦 ${stock} in stock`,
    delivery ? `🚚 ${delivery}` : '',
    `👉 Tap the link to pay instantly with PayPal`,
    hashtags.join(' '),
  ].filter(Boolean).join('\n');

  const faq = [
    { q: 'How much is it?', a: `It's ${priceLine} per item.` },
    { q: 'How do I pay?', a: 'Tap the PayPal link — you can pay with a PayPal account or a debit/credit card. Your payment is protected.' },
    { q: 'Is it available?', a: stock > 0 ? `Yes, ${stock} left in stock.` : 'Sold out for now — I can notify you when it restocks.' },
    ...(delivery ? [{ q: 'Do you deliver?', a: delivery + '.' }] : []),
    ...(sizes.length ? [{ q: 'What sizes?', a: `Available sizes: ${sizes.join(', ')}.` }] : []),
    ...(colors.length ? [{ q: 'What colours?', a: `Available colours: ${colors.join(', ')}.` }] : []),
  ];

  return { title, description, category: cat.name, emoji: cat.emoji, priceUsd: price.usd ?? 0, priceNgn: price.ngn, stock, colors, sizes, delivery, hashtags, caption, faq, warnings };
}

/* ------------------------------ Buyer Q&A ------------------------------ */

export interface ProductLike {
  title: string; priceUsd: number; priceNgn?: number; stock: number; colors: string[]; sizes: string[]; delivery?: string; description: string;
}

const PIDGIN = /\b(abeg|una|wetin|dey|e be|how far|oya|wahala|sabi|na so|o jare|biko)\b/i;

export function answerBuyer(question: string, p: ProductLike, payLink: string): { answer: string; intent: string } {
  const q = question.toLowerCase();
  const pidgin = PIDGIN.test(q);
  const price = formatPrice(p.priceUsd, p.priceNgn);
  const hi = pidgin ? 'No wahala! ' : 'Thanks for reaching out! ';
  const linkLine = `You can pay securely here: ${payLink}`;

  const asksPrice = /(how much|price|cost|amount|how much e be)/.test(q);
  const asksDelivery = /(deliver|delivery|ship|shipping|dispatch|waybill|abroad|send to)/.test(q);
  if (asksPrice && asksDelivery)
    return { intent: 'price+delivery', answer: `${hi}${p.title} is ${price}. ${p.delivery ? p.delivery + '.' : 'We deliver nationwide — cost depends on location.'} ${linkLine}` };
  if (/(discount|reduce|last price|final price|cheaper|bargain|negotiat|lower)/.test(q))
    return { intent: 'discount', answer: `${hi}The price for ${p.title} is ${price}. Buying 3 or more? Message me and I'll check what I can do. ${linkLine}` };
  if (/(how much|price|cost|amount|\bhm\b|how much e be)/.test(q))
    return { intent: 'price', answer: `${hi}${p.title} is ${price}. ${p.stock > 0 ? `${p.stock} still available.` : 'Currently sold out.'} ${linkLine}` };
  if (/(size|fit|small|big|large|xl|measure)/.test(q))
    return { intent: 'size', answer: p.sizes.length ? `${hi}${p.title} comes in sizes ${p.sizes.join(', ')}. Tell me your usual size and I'll confirm the fit before you pay.` : `${hi}${p.title} is one-size. Want measurements? I'll send them right away.` };
  if (/(colou?r|shade)/.test(q))
    return { intent: 'color', answer: p.colors.length ? `${hi}Available colours: ${p.colors.join(', ')}. Just add your colour in the PayPal note when you pay. ${linkLine}` : `${hi}It comes as shown in the photos.` };
  if (/(deliver|delivery|ship|shipping|dispatch|location|where are you|send to|waybill|abroad|uk|us|canada|pick ?up)/.test(q))
    return { intent: 'delivery', answer: `${hi}${p.delivery ? p.delivery + '.' : 'We deliver nationwide and can ship abroad — delivery cost depends on location.'} Once you pay, I'll confirm dispatch with a tracking update.` };
  if (/(available|in stock|still have|remain|left|sold out|do you have)/.test(q))
    return { intent: 'stock', answer: p.stock > 0 ? `${hi}Yes! ${p.stock} left. Grab yours before it sells out: ${payLink}` : `${hi}Sold out for now — I'll message you as soon as it restocks.` };
  if (/(pay|paypal|card|transfer|account|payment|trust|scam|legit|safe|refund|return)/.test(q))
    return { intent: 'payment', answer: `${hi}Payment is through PayPal, so you can pay with your PayPal balance or a card and you're covered by PayPal Buyer Protection. ${linkLine}` };
  if (/(original|quality|material|real|fake|authentic|made of)/.test(q))
    return { intent: 'quality', answer: `${hi}${p.description.split(' — ')[1]?.split('.')[0] ?? 'Quality is guaranteed'}. Happy to send more photos or a quick video before you pay.` };
  return { intent: 'general', answer: `${hi}${p.title} is ${price}. ${p.delivery ? p.delivery + '. ' : ''}Any other question, just ask. ${linkLine}` };
}

/* ------------------------------ Seller intent router ------------------------------ */

export type SellerIntent =
  | { kind: 'invoice'; name?: string; email?: string; qty: number; productHint: string }
  | { kind: 'buyer_question'; question: string; productHint: string }
  | { kind: 'sales' }
  | { kind: 'checkout'; qty: number; productHint: string }
  | { kind: 'status'; orderHint: string }
  | { kind: 'listing'; text: string }
  | { kind: 'help' };

export function routeSellerMessage(msg: string): SellerIntent {
  const m = msg.trim();
  const lower = m.toLowerCase();
  const email = m.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0];
  const qty = parseInt(lower.match(/\b(\d{1,3})\s*(?:x\b|pcs|pieces|units|pairs|of\b)/)?.[1] || lower.match(/\bfor\s+(\d{1,3})\b(?!\s*k)/)?.[1] || '1', 10);

  if (/\binvoice\b|\bbill\b/.test(lower) && !/^(?:selling|new stock)/.test(lower)) {
    const name = m.match(/(?:[Ii]nvoice|[Bb]ill)\s+(?:to\s+|for\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/)?.[1];
    return { kind: 'invoice', name, email, qty, productHint: m };
  }
  const quoted = m.match(/["“](.+?)["”]/)?.[1];
  if (quoted || /^(?:buyer|customer|client)\s+(?:asks?|asked|wants to know|said)|^reply (?:to|this)|^how do i (?:reply|answer)/i.test(m)) {
    const question = quoted || m.replace(/^(?:buyer|customer|client)\s+(?:asks?|asked|wants to know|said)\s*:?\s*/i, '').replace(/^reply (?:to|this)\s*:?\s*/i, '');
    return { kind: 'buyer_question', question, productHint: m };
  }
  if (/(sales|revenue|how (?:much|many) (?:did|have) i|made today|this week|report|insight|dashboard|best ?seller|top product|performance)/.test(lower))
    return { kind: 'sales' };
  if (/(status|has .* paid|did .* pay|is .* paid|check order)/.test(lower)) return { kind: 'status', orderHint: m };
  if (/(pay(?:ment)? link|checkout|send (?:me )?(?:a |the )?link|paypal link|payment button|buy button)/.test(lower) && !/₦|\$|\d+\s?k\b|naira/.test(lower))
    return { kind: 'checkout', qty, productHint: m };
  if (/(sell|selling|stock|price|₦|\$|\bn\d|\d+\s?k\b|naira|available|just in)/i.test(m) && m.length > 12) return { kind: 'listing', text: m };
  return { kind: 'help' };
}

/** Pick the product a free-text message most likely refers to. */
export function matchProduct<T extends { title: string }>(text: string, products: T[]): T | undefined {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  let best: T | undefined; let bestScore = 0;
  for (const p of products) {
    const tw = p.title.toLowerCase().split(/\s+/);
    const score = tw.reduce((s, w) => s + (words.some((x) => x === w || (w.length > 3 && (x.startsWith(w.slice(0, -1)) || w.startsWith(x)))) ? 1 : 0), 0);
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}
