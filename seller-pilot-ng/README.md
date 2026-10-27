# SellerPilot NG

**An AI co-pilot for Instagram & WhatsApp sellers that turns a chat message into a product listing, a PayPal checkout link, PayPal invoices, buyer replies and a live sales dashboard.**

> "Selling handmade Ankara tote bags, 15k each, red and blue, 12 in stock. Delivery within Lagos 1-2 days"
>
> → listing + caption + hashtags, a shareable checkout page with PayPal buttons, a QR code, and a ready-to-send WhatsApp message, in about a second.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) (Devpost, Oct–Nov 2026). Runs fully against the **PayPal sandbox**.

| Copilot | Pay link + buyer reply | PayPal invoice | Buyer checkout | Sales |
|---|---|---|---|---|
| ![](screenshots/02-copilot-listing.png) | ![](screenshots/03-copilot-paylink-reply.png) | ![](screenshots/04-copilot-invoice.png) | ![](screenshots/06-storefront-buyer.png) | ![](screenshots/07-sales-dashboard.png) |

---

## What it does

| Seller says (Copilot tab) | Agent tool | What actually happens on PayPal |
|---|---|---|
| "Selling Adire two-piece ₦28,000, sizes S–XL, 6 left…" | `create_listing` | Pulls out price (₦ or $; `15k`, `N4500` and `₦28,000` all work), stock, sizes, colours and delivery. Writes the title, description, IG/WhatsApp caption, hashtags and FAQ, and publishes a buyer checkout page `/p/<slug>` with PayPal Smart Buttons and a QR code. |
| "Send a payment link for 2 tote bags" | `create_checkout_link` | Creates a **PayPal Orders v2** order (`intent: CAPTURE`) for that exact quantity and returns the PayPal approval link and a QR code to paste into WhatsApp. When the buyer pays, PayPal redirects to `/paid`, which **captures** the order and lowers stock. |
| "Invoice Chioma Okafor chioma@… for 2 tote bags" | `send_paypal_invoice` | Uses the official **PayPal Agent Toolkit** (`@paypal/agent-toolkit`): `create_invoice` → `send_invoice` → `generate_invoice_qr_code` → `get_invoice`. The buyer gets PayPal's email with a Pay Now button. |
| Customer asked: "abeg how much e be, una dey deliver to Abuja?" | `answer_buyer_question` | Drafts a reply from the product's real facts with the pay link. It matches the buyer's tone and understands light Pidgin. Buyers can also ask questions on the checkout page. |
| "How are my sales this week?" | `get_sales_summary` | Revenue from **captured** PayPal orders, conversion from pay links, best seller, low stock, unpaid checkouts, and next-step insights. |
| "Has the tote bag order been paid?" | `check_order_status` | `GET /v2/checkout/orders/{id}` for the latest status. |

Every agent reply shows an **action trace**: which tool ran, whether it ran through *PayPal Orders v2*, the *PayPal Agent Toolkit* or SellerPilot, and how long it took.

**Guardrail:** the AI never sets prices. It can only pick products, quantities and recipients. Totals are always computed on the server from the catalog.

## Architecture

```
web/ (Vite + React + TS, mobile-first)          server/ (Express + TS)
┌──────────────────────────┐   /api   ┌──────────────────────────────────────────────┐
│ Copilot chat  ───────────┼─────────▶│ agent.ts  — tool registry + 2 planners        │
│ Products / QR / WhatsApp │          │   • LLM planner (OpenAI-compatible tools)     │
│ Sales dashboard          │          │   • Rule planner (offline, always available)  │
│ Buyer checkout /p/:slug ─┼─ PayPal ─┤ ai/rules.ts   — offline NLP for seller text   │
│   (JS SDK Smart Buttons) │  JS SDK  │ ai/llm.ts     — OpenAI / Gemini / Groq / Ollama│
│ /paid (capture on return)│          │ paypal.ts     — Orders v2 create/get/capture  │
└──────────────────────────┘          │               + PayPal Agent Toolkit invoices │
                                      │ store.ts      — JSON file store (data/db.json)│
                                      └──────────────────────────────────────────────┘
```

* **PayPal Orders v2** (direct REST): create with `payment_source.paypal.experience_context` (brand name, `PAY_NOW`, return/cancel URLs) for pay links; a plain create for the JS SDK Smart Buttons; capture on the server; idempotent `PayPal-Request-Id`; optional `payee` override.
* **PayPal Agent Toolkit** (`@paypal/agent-toolkit/openai`): tool calls run through `handleToolCall()`, in the same shape an LLM function call would take. SellerPilot shares its own cached OAuth token with the toolkit. The toolkit is loaded lazily because its dependencies take a while to import.
* **AI provider is pluggable** (`AI_PROVIDER=auto|rules|openai|gemini`):
  * **rules** (default, offline, free): a deterministic parser and templates tuned to how Nigerian vendors write. No API key needed.
  * **openai**: any OpenAI-compatible Chat Completions endpoint (OpenAI, Groq, OpenRouter, Together, local Ollama or LM Studio) with function calling.
  * **gemini**: Google Gemini through its OpenAI-compatible endpoint.
  * If an LLM call fails or times out, SellerPilot falls back to the rules engine automatically.
* **Mock mode**: with no PayPal credentials the app still runs end to end. It uses fake `MOCK…` order IDs, and every screen labels them clearly.

## Run it locally

Requirements: Node 18.18+ (tested on Node 22), npm.

```bash
git clone <this repo> sellerpilot && cd sellerpilot
npm install
cp .env.example .env        # then fill in PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET (sandbox)
npm run dev                 # API on :8787, web on http://localhost:5173
```

Production-style single process:

```bash
npm run build               # type-checks server + web, builds web into dist/
PUBLIC_URL=http://localhost:8787 npm start   # serves the API and the built app on :8787
```

Other scripts:

```bash
npm test                    # unit tests for the offline AI engine (node:test)
npm run smoke:paypal        # OAuth + create a $1 sandbox order, prints the approval link
npm run smoke:paypal -- <ORDER_ID>   # capture it after approving with a sandbox buyer
npx tsx scripts/screenshots.ts all   # mobile screenshots into screenshots/ (needs Chromium; set CHROME_PATH)
```

### PayPal sandbox setup (5 minutes)

1. Go to <https://developer.paypal.com/dashboard/applications/sandbox>, then **Create App** (Merchant). Copy the **Client ID** and **Secret** into `.env`.
2. In the app's **Features**, tick **Invoicing** (needed for `send_paypal_invoice`) and save.
3. Under **Testing Tools → Sandbox Accounts**, use the default **Personal** account (email and password are under its details) to act as the buyer.
4. **If your app's default sandbox business account cannot receive payments** (we saw `PAYEE_ACCOUNT_LOCKED_OR_CLOSED` with a Nigeria-region sandbox merchant), create a **Business** sandbox account with country **United States** and set `PAYPAL_PAYEE_EMAIL=<that account's email>`. Checkout orders are then paid to that account.
5. Optional: set `SELLER_EMAIL` to your sandbox business email so it appears on invoices.

### Try it (judges)

1. Open the app and send the first suggestion chip (the Ankara tote bag).
2. Tap **Send a payment link for 2 tote bags**, open the PayPal link, and log in with the sandbox **Personal** account. You will be redirected to `/paid`, where the order is captured.
3. Send **Invoice <name> <sandbox-personal-email> for 2 tote bags**. The invoice appears in the sandbox buyer's PayPal account.
4. Open **Sales**. Real captured orders show their PayPal order and capture IDs. *Load sample data* adds clearly labelled sample orders so the charts have something to show.

### Environment variables

See [`.env.example`](.env.example). Nothing secret is committed. `data/db.json` (local store) and `.env` are git-ignored.

## Notes & limitations

* Prices given in Naira are **charged in USD**, because PayPal does not settle in NGN. The rate is `NGN_PER_USD` (default 1550). Change it to the current rate.
* Since Jan 2026, people in Nigeria can receive PayPal payments by linking their PayPal account to a Paga wallet ([Finextra, 27 Jan 2026](https://www.finextra.com/pressarticle/108638/paypal-goes-live-in-nigeria-through-paga)). SellerPilot itself has only been tested in the PayPal **sandbox**.
* Storage is a JSON file, which is fine for a single seller. Multi-tenant auth, webhooks and a real database are on the roadmap.
* With no LLM key, the copy comes from templates. It is decent but not creative. Setting `GEMINI_API_KEY` or `OPENAI_API_KEY` upgrades captions, replies and planning.

## Built with

TypeScript, Node.js, Express, React, Vite, React Router, PayPal Orders v2 REST API, PayPal JavaScript SDK (Smart Buttons), PayPal Invoicing API via the PayPal Agent Toolkit (`@paypal/agent-toolkit`), OpenAI-compatible function calling (optional Gemini, OpenAI, Groq or Ollama), `qrcode`, `node:test`, Puppeteer (screenshots).

## License

[MIT](LICENSE) © 2026 Yusuf Balogun
