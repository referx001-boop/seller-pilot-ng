# SellerPilot NG — demo video script (target 2:45, hard limit < 3:00)

**Setup before recording**
- Run `npm run build && PUBLIC_URL=http://localhost:8787 npm start` with sandbox credentials in `.env`. Set `PAYPAL_PAYEE_EMAIL` if your sandbox merchant can't receive.
- Open Chrome DevTools in device mode (iPhone 12/14, 390×844), or record on your phone over the same Wi-Fi.
- Clear the chat ("Clear chat"). On **Sales**, click **Load sample data** *after* the live payment so the real order is on top.
- Have a second tab signed in to the PayPal **sandbox Personal** account (developer.paypal.com → Sandbox Accounts).
- Use your own voice and no copyrighted music (hackathon rule). Upload to YouTube as **Public** or **Unlisted-but-public-link** (the rules say "publicly visible").

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Title card: "SellerPilot NG — AI co-pilot for social sellers". Then a WhatsApp-style chat full of "how much?" messages (a mock-up or your own photo). | "Millions of Nigerian businesses sell on Instagram and WhatsApp. They answer the same questions all day and chase bank-transfer screenshots. Since January, people in Nigeria can finally receive PayPal payments through Paga. SellerPilot makes that usable from a chat." |
| 0:15–0:45 | Copilot tab. Tap the first chip (Ankara tote bags, 15k…). Show the action trace, the listing card, then open the caption. | "I just describe the product the way I'd type it to a customer. The agent pulls out the price in Naira and dollars, stock, colours and delivery, writes the listing and caption, and publishes a PayPal checkout page with a QR code." |
| 0:45–1:25 | Tap "Send a payment link for 2 tote bags". Point at the "PayPal Orders v2" trace. Open the link → PayPal sandbox login → review page shows **Ada Styles · 2 Handmade Ankara Tote Bags · $19.36** → Complete Purchase → `/paid` "Payment received" with order and capture IDs. | "Now a buyer wants two. The agent creates a real PayPal order for that exact amount, and I send the link on WhatsApp. The buyer pays with PayPal or a card, and SellerPilot captures the payment on the server. Here's the capture ID, and stock just dropped from twelve to ten." |
| 1:25–1:50 | Back in Copilot: send "Invoice Chioma Okafor <sandbox email> for 2 tote bags". Show the "PayPal Agent Toolkit" trace and the invoice card with PayPal's QR. Optionally flash the invoice in the sandbox. | "For buyers who prefer an invoice, one sentence does it. This runs on PayPal's official Agent Toolkit: create invoice, send invoice, QR code. The customer gets PayPal's email with a Pay Now button." |
| 1:50–2:10 | Send: Customer asked: "abeg how much e be, una dey deliver to Abuja?" Show the draft reply and the "Send on WhatsApp" button. Then show the buyer page's "Ask the shop" box. | "And when customers ask, even in Pidgin, I get an accurate reply from the product's real data, with the pay link included. Buyers can also ask on the checkout page itself." |
| 2:10–2:30 | Sales tab: revenue in $ and ₦, the chart, insights, the real order with its PayPal IDs at the top (sample rows are labelled). | "The dashboard counts only captured PayPal payments and tells me what to do next: restock, follow up on unpaid links, or repost my best seller." |
| 2:30–2:45 | About tab: agent tools and enabled Agent Toolkit tools. "AI: offline" badge. | "It runs with any OpenAI-compatible model or Gemini, and it works fully offline with no paid AI key. The AI never sets prices, because totals are computed on the server. SellerPilot NG: chat to listing to PayPal, built for Africa's social sellers." |

**Tips**
- Keep each tap deliberate and pause a beat so judges can read the action trace.
- If PayPal's sandbox is slow, cut the waiting in editing but keep the review page and the capture result on screen.
- Say "sandbox" once out loud. It's honest, and judges expect it.
