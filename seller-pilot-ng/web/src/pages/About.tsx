import type { AppConfig } from '../api';
import { Icon } from '../components/Icon';

export default function About({ cfg }: { cfg: AppConfig | null }) {
  return (
    <div className="page about">
      <div className="page-head"><div><h1>How SellerPilot works</h1><p className="muted">One chat, real PayPal services underneath.</p></div></div>
      <div className="card">
        <h4><Icon name="cpu" size={16} />Status</h4>
        <ul className="kv">
          <li><span>PayPal</span><b>{cfg?.paypalMode ?? '…'}{cfg?.payeeOverride ? ' (payee override on)' : ''}</b></li>
          <li><span>AI engine</span><b>{cfg?.aiEngine ?? '…'}</b></li>
          <li><span>₦ per $1</span><b>{cfg?.ngnPerUsd}</b></li>
        </ul>
      </div>
      <div className="card">
        <h4><Icon name="bolt" size={16} />Agent tools</h4>
        <div className="chips">{cfg?.agentTools.map((t) => <span className="chip" key={t}>{t}</span>)}</div>
        <h4><Icon name="paypal" size={16} />PayPal Agent Toolkit tools enabled</h4>
        <div className="chips">{cfg?.paypalToolkitTools.length ? cfg.paypalToolkitTools.map((t) => <span className="chip alt" key={t}>{t}</span>) : <span className="muted small">Not loaded (mock mode)</span>}</div>
      </div>
      <div className="card">
        <h4><Icon name="chart" size={16} />Flow</h4>
        <ol className="steps">
          <li>Seller types a WhatsApp-style message → the agent extracts price (₦ or $), stock, sizes, colours and delivery, and writes the listing + caption.</li>
          <li>A buyer-facing checkout page is created with PayPal Smart Buttons (Orders v2 create → capture). The agent can also mint a one-off PayPal pay link for a specific quantity.</li>
          <li>Invoices go out through the official PayPal Agent Toolkit (create_invoice → send_invoice → generate_invoice_qr_code).</li>
          <li>Buyer questions (even in Pidgin) get instant draft replies with the pay link; the dashboard tracks real captured payments.</li>
        </ol>
        <p className="notice"><Icon name="lock" size={16} /><span>Prices are never set by the AI model: totals are computed server-side from the catalog.</span></p>
      </div>
    </div>
  );
}
