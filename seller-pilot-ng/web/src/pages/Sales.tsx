import { useEffect, useState } from 'react';
import { api, usd, type Invoice, type Order, type Stats } from '../api';
import StatsView from '../components/StatsView';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

const label = (s: string) => (s === 'COMPLETED' ? 'PAID' : s === 'PAYER_ACTION_REQUIRED' || s === 'CREATED' ? 'AWAITING PAYMENT' : s.replace(/_/g, ' '));

export default function Sales() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const load = () => Promise.all([api<Stats>('/dashboard').then(setStats), api<Order[]>('/orders').then(setOrders), api<Invoice[]>('/invoices').then(setInvoices)]).catch(() => undefined);
  useEffect(() => { load(); }, []);

  async function sample(path: string, msg: string) {
    setBusy(true);
    try { await api(path, { body: {} }); await load(); notify(msg, 'info'); } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Sales</h1><p className="muted">Captured PayPal payments and invoices</p></div>
        {stats && (stats.hasSample
          ? <button className="btn ghost sm" disabled={busy} onClick={() => sample('/demo/clear-sample', 'Sample data hidden')}>Hide sample</button>
          : <button className="btn ghost sm" disabled={busy} onClick={() => sample('/demo/seed', 'Sample data loaded')}>Load sample</button>)}
      </div>
      {stats?.hasSample && <div className="notice"><Icon name="info" size={16} /><span>Includes clearly labelled <b>sample</b> orders for the demo. Real sandbox payments show their PayPal IDs.</span></div>}
      {stats ? <div className="card"><StatsView stats={stats} /></div> : <div className="card"><div className="sk sk-block" /><div className="sk sk-line" /><div className="sk sk-line short" /></div>}

      <h2 className="section-title">Orders</h2>
      <div className="table">
        {orders?.slice(0, 30).map((o) => (
          <div key={o.id} className="trow">
            <span className="row-icon"><Icon name="paypal" size={16} /></span>
            <div className="grow">
              <b>{o.qty} × {o.title}</b>
              <div className="muted small">{o.buyerName || 'Buyer'} · {new Date(o.createdAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })} · {o.channel}{o.sample ? ' · sample' : ''}</div>
              <div className="muted tiny mono">{o.paypalOrderId}{o.captureId ? ` · capture ${o.captureId}` : ''}</div>
            </div>
            <div className="right"><b>{usd(o.amountUsd)}</b><span className={`status s-${o.status}`}>{label(o.status)}</span></div>
          </div>
        ))}
        {orders && !orders.length && <div className="empty-inline"><Icon name="bag" size={20} />No orders yet. Share a pay link to get your first sale.</div>}
        {!orders && <div className="trow"><div className="grow"><div className="sk sk-line" /><div className="sk sk-line short" /></div></div>}
      </div>

      <h2 className="section-title">Invoices</h2>
      <div className="table">
        {invoices?.map((i) => (
          <div key={i.id} className="trow">
            <span className="row-icon"><Icon name="invoice" size={16} /></span>
            <div className="grow">
              <b>{i.recipientName}</b>
              <div className="muted small break">{i.recipientEmail} · {i.items.map((x) => `${x.qty} × ${x.title}`).join(', ')}</div>
              <div className="muted tiny mono">{i.paypalInvoiceId} · {i.via}</div>
            </div>
            <div className="right"><b>{usd(i.totalUsd)}</b><span className={`status s-${i.status}`}>{i.status}</span></div>
          </div>
        ))}
        {invoices && !invoices.length && <div className="empty-inline"><Icon name="invoice" size={20} />No invoices yet. Ask the Copilot to “invoice &lt;name&gt; &lt;email&gt; for …”.</div>}
      </div>
    </div>
  );
}
