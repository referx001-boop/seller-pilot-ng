# SellerPilot NG — Devpost submission text

**Tagline (≤200 chars):** An AI co-pilot that turns a WhatsApp-style message into a product listing, a PayPal checkout link and invoice, buyer replies and a sales dashboard, built for Africa's social sellers.

---

## Inspiration

In Nigeria, a huge share of small commerce happens on Instagram and WhatsApp. A seller posts a photo, buyers send "how much?" in the DMs, and the seller types out the price, the delivery details and a bank account number again and again, then checks screenshots of transfers to confirm payment. Selling to buyers outside the country, including the diaspora, has been even harder: for years Nigerian PayPal accounts could send money but not receive it.

That changed in January 2026, when PayPal and Paga launched account linking that lets people in Nigeria receive PayPal payments and withdraw them in Naira ([Finextra, 27 Jan 2026](https://www.finextra.com/pressarticle/108638/paypal-goes-live-in-nigeria-through-paga)). The payment rail now exists. What these sellers still lack is a tool that fits how they already work: chat-first, phone-first, and too busy for a full e-commerce dashboard. SellerPilot NG is that tool.

## What it does

The seller chats with SellerPilot the way they already chat on WhatsApp. The agent doesn't just give advice. It **does the PayPal work**:

- **Message → listing → checkout.** "Selling handmade Ankara tote bags, 15k each, red and blue, 12 in stock, delivery in Lagos 1–2 days" becomes a product with a title, description, Instagram/WhatsApp caption, hashtags and FAQ. It also gets a buyer checkout page with **PayPal Smart Buttons** and a QR code. The agent understands how Nigerian vendors write: `15k`, `N4500`, `₦28,000`, `sizes 38-45`.
- **One-tap PayPal pay links.** "Send a payment link for 2 tote bags" creates a **PayPal Orders v2** order for that exact quantity. The seller pastes the link or QR into WhatsApp. When the buyer pays, SellerPilot **captures** the payment and lowers the stock.
- **PayPal invoices from chat.** "Invoice Chioma Okafor chioma@… for 2 tote bags" runs the **PayPal Agent Toolkit**: `create_invoice` → `send_invoice` → `generate_invoice_qr_code`. The buyer receives PayPal's invoice email with a Pay Now button.
- **Buyer replies.** The seller pastes a customer question such as "abeg how much e be, una dey deliver to Abuja?" and gets an accurate draft built from the product's real data, ending with the pay link. Buyers can also ask questions directly on the checkout page.
- **Sales dashboard.** Revenue from captured PayPal payments (in $ and ₦), pay-link conversion, best sellers, low stock, unpaid checkouts, and plain-language next steps.
- **Transparent agent.** Every reply shows an action trace of which tool ran and on which PayPal API, so the seller always knows what the agent did with their money.

## How we built it

- **Frontend:** React + Vite + TypeScript. Mobile-first, because our users run their business from a phone. A bottom-tab app (Copilot, Products, Sales, About), a public buyer checkout page, and a `/paid` return page.
- **Backend:** Node.js + Express + TypeScript.
  - **PayPal Orders v2** via REST: create with `experience_context` (brand name, `PAY_NOW`, return/cancel URLs) for pay links, a plain create for the JS SDK Smart Buttons, server-side capture, idempotency keys, and an optional payee override.
  - **PayPal Invoicing via the official PayPal Agent Toolkit** (`@paypal/agent-toolkit`): we call the toolkit's tools through `handleToolCall()`, in the same format an LLM function call uses, and share our OAuth token with it.
- **AI layer, pluggable by design.** One agent tool registry with two planners:
  1. an **LLM planner** using OpenAI-compatible function calling. It works with OpenAI, Gemini (through its OpenAI-compatible endpoint), Groq, OpenRouter, or a local Ollama.
  2. an **offline rule planner**: a deterministic NLP engine for prices in ₦ and $, stock, sizes, colours, delivery, category, intent routing and light Pidgin detection, plus copy templates. It needs no API key, costs nothing, and is the automatic fallback when an LLM call fails.
- **Guardrail:** the model never sets an amount. Prices come from the catalog and totals are computed on the server, so a hallucination cannot change what a buyer is charged.
- **Tested in the PayPal sandbox end to end.** We ran a real sandbox order through approval by a sandbox buyer and server capture (status `COMPLETED` with a capture ID), and sent real sandbox invoices.
- **AI assistance disclosure:** Yusuf Balogun designed and directed the project and owns the submission. Much of the code and documentation was written with an AI agent (Hark), under his direction and review.

## Challenges we ran into

- **Our Nigeria-region sandbox merchant couldn't receive payments.** The first sandbox approval failed with `PAYEE_ACCOUNT_LOCKED_OR_CLOSED`. We added a configurable `payee` override in Orders v2 so checkouts can settle to a US sandbox business account. In production, this is where the seller's own PayPal account (linked to Paga) goes.
- **No Naira in PayPal.** Sellers think in ₦, but PayPal settles in USD and other supported currencies. SellerPilot keeps the ₦ price for display and charges a USD amount at a configurable rate, with a clear note to the buyer.
- **AI without a paid API key.** We wanted it to work for a seller with no budget, so the offline engine had to be good on its own: parsing "15k", "N4500" and "₦28,000", sizes like "38-45" or "S, M, L", and a delivery line out of free text.
- **Agent Toolkit integration details.** The toolkit fetches its own token from a different sandbox host. Sharing our cached token kept auth in one place. The toolkit's dependency tree is large, so we load it lazily to keep server start-up instant.

## Accomplishments that we're proud of

- A real **end-to-end sandbox payment**: chat message → listing → PayPal order → sandbox buyer approval → capture → stock and dashboard updated.
- **PayPal invoices sent from a single chat sentence** through the official Agent Toolkit, with PayPal's own QR code shown in the chat.
- The app works **fully offline from AI** and fully **without PayPal credentials** (clearly labelled mock mode), so anyone can run it in two commands.
- A clean, phone-first UI that feels like the chat apps our users already live in.

## What we learned

- Agentic commerce gets trustworthy when the agent's actions are **visible** (the action trace) and **bounded** (no AI-set prices).
- PayPal's Orders v2 `experience_context` and the Agent Toolkit's tool schema make it simple for an agent to actually transact, not just recommend.
- For emerging markets, "works without a paid AI key, on a low-end phone" is a feature, not a fallback.

## What's next for SellerPilot NG

- PayPal **webhooks** (`CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `INVOICING.INVOICE.PAID`) for instant paid notifications.
- A **WhatsApp Business API** bot so buyers can ask and pay without leaving WhatsApp.
- **Shipment tracking** through the Agent Toolkit's tracking tools, plus **refunds and disputes** from chat.
- Multi-currency checkout (GBP/EUR/CAD for diaspora buyers), photo-to-listing with a vision model, Yoruba/Igbo/Hausa replies, and multi-seller accounts with a real database.

## Built with

`typescript` · `node.js` · `express` · `react` · `vite` · `paypal-orders-v2` · `paypal-javascript-sdk` · `paypal-invoicing` · `paypal-agent-toolkit` · `openai-compatible-api` (optional: `gemini`, `openai`, `groq`, `ollama`) · `qrcode` · `puppeteer`

## Try it

- Code (MIT): **<GitHub URL — add after pushing>**
- Demo video: **<YouTube URL — add after uploading>**
- Setup: see the README. You only need PayPal sandbox credentials. No AI key is required.
