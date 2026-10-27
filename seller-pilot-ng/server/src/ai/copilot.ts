/** High-level AI features. Each tries the LLM first (if configured) and always falls back to rules. */
import { config } from '../config.js';
import { answerBuyer, buildListing, type ListingDraft, type ProductLike } from './rules.js';
import { chatJson, llmAvailable } from './llm.js';

export async function draftListing(text: string): Promise<ListingDraft & { source: 'rules' | 'llm' }> {
  const base = buildListing(text, { ngnPerUsd: config.ngnPerUsd, shopName: config.shopName });
  if (!llmAvailable()) return { ...base, source: 'rules' };
  try {
    const ai = await chatJson<Partial<ListingDraft>>(
      `You write high-converting social-commerce listings for small Nigerian online sellers (Instagram/WhatsApp).
Return JSON with keys: title (<=60 chars), description (2-3 sentences, warm, honest, no invented facts), caption (Instagram/WhatsApp caption with emojis and line breaks, end with a call to pay via the PayPal link), hashtags (array of 5-7), faq (array of {q,a}, 4 items).
Never change price, stock, sizes, colours or delivery facts — they are given to you.`,
      `Seller message: """${text}"""\nExtracted facts: ${JSON.stringify({ priceUsd: base.priceUsd, priceNgn: base.priceNgn, stock: base.stock, colors: base.colors, sizes: base.sizes, delivery: base.delivery, category: base.category })}`,
    );
    return {
      ...base,
      title: ai.title?.slice(0, 80) || base.title,
      description: ai.description || base.description,
      caption: ai.caption || base.caption,
      hashtags: Array.isArray(ai.hashtags) && ai.hashtags.length ? ai.hashtags.slice(0, 7) : base.hashtags,
      faq: Array.isArray(ai.faq) && ai.faq.length ? ai.faq.slice(0, 6) : base.faq,
      source: 'llm',
    };
  } catch (e) {
    console.warn('[ai] listing LLM failed, using rules:', (e as Error).message);
    return { ...base, source: 'rules' };
  }
}

export async function replyToBuyer(question: string, product: ProductLike, payLink: string): Promise<{ answer: string; intent: string; source: 'rules' | 'llm' }> {
  const base = answerBuyer(question, product, payLink);
  if (!llmAvailable()) return { ...base, source: 'rules' };
  try {
    const ai = await chatJson<{ answer: string; intent: string }>(
      `You are the friendly sales assistant of a small Nigerian online shop. Answer the buyer in 1-3 short sentences, in the buyer's register (reply in Nigerian Pidgin if they wrote Pidgin).
Only use the product facts given; if a fact is unknown, say the seller will confirm. Always end with the payment link when the buyer seems ready to buy. Return JSON {"answer": string, "intent": string}.`,
      `Product facts: ${JSON.stringify(product)}\nPayment link: ${payLink}\nBuyer: """${question}"""`,
    );
    if (!ai.answer) throw new Error('empty');
    return { answer: ai.answer, intent: ai.intent || base.intent, source: 'llm' };
  } catch {
    return { ...base, source: 'rules' };
  }
}
