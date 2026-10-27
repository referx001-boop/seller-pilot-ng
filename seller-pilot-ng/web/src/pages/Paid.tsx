import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, usd, type Order } from '../api';
import { Icon } from '../components/Icon';

/** PayPal redirects buyers here (return_url) after approving a pay link; we capture server-side. */
export default function Paid() {
  const [sp] = useSearchParams();
  const [o, setO] = useState<Order | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const id = sp.get('order') || sp.get('token');
    if (!id) { setErr('Missing order reference'); return; }
    api<Order>(`/orders/${id}/capture`, { body: {} }).then(setO).catch((e) => setErr(e.message));
  }, [sp]);
  return (
    <div className="store">
      <header className="shopbar"><div className="brand"><img src="/logo.svg" alt="" width={32} height={32} /><b>SellerPilot</b></div><span className="secured"><Icon name="lock" size={14} />Secured by PayPal</span></header>
      <div className="card success">
        {!o && !err && <><span className="success-icon pending"><span className="spinner dark big" /></span><h2>Confirming your PayPal payment…</h2><p className="muted">This only takes a moment.</p></>}
        {err && <><span className="success-icon failed"><Icon name="alert" size={34} /></span><h2>We couldn't confirm the payment</h2><p>{err}</p></>}
        {o && <><span className="success-icon"><Icon name="check" size={36} /></span><h2>Payment received</h2><p>{o.qty} × {o.title} — <b>{usd(o.amountUsd)}</b></p><p className="muted small mono">PayPal order {o.paypalOrderId} · {o.status}{o.captureId ? ` · capture ${o.captureId}` : ''}</p><p>Thank you! The seller will confirm delivery shortly.</p></>}
      </div>
    </div>
  );
}
