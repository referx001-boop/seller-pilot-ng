"""Capture 390px mobile screenshots of a running SellerPilot server into screenshots/.

Usage (mock mode, no PayPal credentials needed):
  PAYPAL_MODE=mock PORT=8787 PUBLIC_URL=http://localhost:8787 DB_FILE=/tmp/sp-db.json npm start &
  BASE=http://localhost:8787 python3 scripts/screenshots.py
Optional: BUYER_EMAIL=<sandbox buyer email> (defaults to buyer@example.com)
"""
import os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:8787")
BUYER_EMAIL = os.environ.get("BUYER_EMAIL", "buyer@example.com")
OUT = os.environ.get("OUT", "screenshots")
W, H = 390, 844


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2, is_mobile=True, has_touch=True)
        page = ctx.new_page()

        def shot(name, full=False):
            page.wait_for_timeout(500)
            if full:
                # grow the viewport instead of full_page so sticky header / tab bar render in place
                h = page.evaluate("document.documentElement.scrollHeight")
                page.set_viewport_size({"width": W, "height": min(h, 3200)})
                page.evaluate("window.scrollTo(0, 0)")
                page.wait_for_timeout(400)
            page.screenshot(path=f"{OUT}/{name}.png")
            page.set_viewport_size({"width": W, "height": H})
            print("saved", name)

        def send(text, timeout=30000):
            n = page.locator(".msg.assistant .bubble:not(.typing)").count()
            page.fill(".composer textarea", text)
            page.click(".composer .send-btn")
            page.wait_for_function(
                "n => document.querySelectorAll('.msg.assistant .bubble:not(.typing)').length > n", arg=n, timeout=timeout)
            page.wait_for_timeout(700)

        page.goto(BASE + "/")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="networkidle")
        shot("01-copilot-empty")
        send("Selling handmade Ankara tote bags, 15k each, red and blue, 12 in stock. Delivery within Lagos 1-2 days, nationwide 3-5 days")
        shot("02-copilot-listing", True)
        send("Send a payment link for 2 tote bags")
        pay_url = page.locator(".pay-card .linkbox").last.get_attribute("href")
        send('Customer asked: "abeg how much e be, una dey deliver to Abuja?"')
        shot("03-copilot-paylink-reply", True)
        send(f"Invoice Chioma Okafor {BUYER_EMAIL} for 2 tote bags")
        page.evaluate("() => { const els = document.querySelectorAll('.msg'); els[els.length - 2]?.scrollIntoView(); }")
        shot("04-copilot-invoice")

        page.goto(BASE + "/products", wait_until="networkidle")
        page.locator(".product .product-row").first.click()
        page.wait_for_timeout(900)
        shot("05-products", True)

        slug = page.evaluate("async () => (await (await fetch('/api/products')).json()).find(p => !p.sample)?.slug")
        page.goto(f"{BASE}/p/{slug}", wait_until="networkidle")
        page.fill(".ask-form input", "Do you deliver to Abuja?")
        page.click(".ask-form button")
        page.wait_for_timeout(1200)
        shot("06-storefront-buyer", True)

        page.goto(BASE + "/sales", wait_until="networkidle")
        shot("07-sales-dashboard", True)
        page.goto(BASE + "/about", wait_until="networkidle")
        shot("08-about", True)

        if pay_url:
            target = pay_url if pay_url.startswith("http") else BASE + pay_url
            page.goto(target, wait_until="networkidle")
            page.wait_for_selector(".success h2")
            page.wait_for_timeout(1200)
            shot("09-paid-confirmation")
        b.close()


if __name__ == "__main__":
    main()
