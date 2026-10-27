import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, price, usd, type AppConfig, type Order, type Product } from '../api';
import { Icon } from '../components/Icon';

declare global { interface Window { paypal?: any } }

function loadPayPalSdk(clientId: string): Promise<any> {
  if (window.paypal) return Promise.resolve(window.paypal);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons`;
    s.onload = () => resolve(window.paypal);
    s.onerror = () => reject(new Error('PayPal SDK failed to load'));
    document.head.appendChild(s);
  });
}

export default function Storefront({ cfg }: { cfg: AppConfig | null }) {
  const { slug = '' } = useParams();
  const [sp] = useSearchParams();
  const [p, setP] = useState<Product | null>(null);
  const [err, setErr] = useState('');
  const [qty, setQty] = useState(1);
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [paid, setPaid] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [sdkState, setSdkState] = useState<'idle' | 'ready' | 'failed'>('idle');
  const btnRef = useRef<HTMLDivElement>(null);
  const state = useRef({ qty, color, size });
  state.current = { qty, color, size };

  const [q, setQ] = useState('');
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);

  useEffect(() => { api<Product>(`/products/${slug}?view=1`).then((x) => { setP(x); setColor(x.colors[0] || ''); setSize(x.sizes[0] || ''); }).catch((e) => setErr(e.message)); }, [slug]);

  useEffect(() => {
    if (!p || !cfg || cfg.paypalMode === 'mock' || !cfg.paypalClientId || !btnRef.current) return;
    let cancelled = false;
    loadPayPalSdk(cfg.paypalClientId).then((paypal) => {
      if (cancelled || !btnRef.current) return;
      btnRef.current.innerHTML = '';
      paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', label: 'pay' },
        createOrder: async () => {
          const o = await api<Order>('/orders', { body: { productId: p.id, ...state.current, flow: 'sdk' } });
          return o.paypalOrderId;
        },
        onApprove: async (data: any) => { const o = await api<Order>(`/orders/${data.orderID}/capture`, { body: {} }); setPaid(o); },
        onError: (e: any) => setErr(String(e?.message || e)),
      }).render(btnRef.current);
      setSdkState('ready');
    }).catch(() => setSdkState('failed'));
    return () => { cancelled = true; };
  }, [p, cfg]);

  async function payViaLink() {
    if (!p) return; setBusy(true);
    try {
      const o = await api<Order>('/orders', { body: { productId: p.id, qty, color, size } });
      if (o.approveUrl) location.href = o.approveUrl;
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault(); if (!q.trim() || !p) return;
    const question = q; setQ('');
    const r = await api<{ answer: string }>(`/products/${p.id}/ask`, { body: { question } });
    setChat((c) => [...c, { q: question, a: r.answer }]);
  }

  const shopbar = (
    <header className="shopbar">
      <div className="brand"><img src="/logo.svg" alt="" width={32} height={32} /><b>{cfg?.shopName ?? 'Shop'}</b></div>
      <span className="secured"><Icon name="lock" size={14} />Secured by PayPal</span>
    </header>
  );

  if (err && !p) return <div className="store">{shopbar}<div className="card empty-state"><span className="empty-icon"><Icon name="alert" size={28} /></span><h3>Product not available</h3><p className="muted">{err}</p></div></div>;
  if (!p) return <div className="store">{shopbar}<div className="card"><div className="sk sk-hero" /><div className="sk sk-line" /><div className="sk sk-line short" /></div></div>;
  if (paid) return (
    <div className="store">{shopbar}<div className="card success">
      <span className="success-icon"><Icon name="check" size={36} /></span><h2>Payment received</h2>
      <p>{paid.qty} × {paid.title} — <b>{usd(paid.amountUsd)}</b></p>
      <p className="muted small mono">PayPal order {paid.paypalOrderId}{paid.captureId ? ` · capture ${paid.captureId}` : ''}</p>
      <p>The seller has been notified and will confirm delivery shortly.</p>
    </div></div>
  );

  return (
    <div className="store">
      {shopbar}
      {sp.get('cancelled') && <div className="notice"><Icon name="info" size={16} /><span>Payment cancelled — you can try again below.</span></div>}
      <div className="card hero-product">
        <div className="emoji xl" aria-hidden>{p.emoji}</div>
        <h1>{p.title}</h1>
        <div className="price big">{price(p)}</div>
        <p className="body-text">{p.description}</p>
        <div className="meta-row">
          <span className={`status ${p.stock > 0 ? 's-COMPLETED' : 's-VOID'}`}>{p.stock > 0 ? `${p.stock} in stock` : 'Sold out'}</span>
          {p.delivery && <span className="muted small">{p.delivery}</span>}
        </div>
      </div>
      <div className="card">
        {p.colors.length > 0 && <div className="field"><div className="field-label">Colour</div><div className="chips">{p.colors.map((c) => <button key={c} type="button" aria-pressed={c === color} className={`chip chip-select ${c === color ? 'on' : ''}`} onClick={() => setColor(c)}>{c}</button>)}</div></div>}
        {p.sizes.length > 0 && <div className="field"><div className="field-label">Size</div><div className="chips">{p.sizes.map((s) => <button key={s} type="button" aria-pressed={s === size} className={`chip chip-select ${s === size ? 'on' : ''}`} onClick={() => setSize(s)}>{s}</button>)}</div></div>}
        <div className="field">
          <div className="field-label">Quantity</div>
          <div className="qty">
            <button type="button" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}><Icon name="minus" size={18} /></button>
            <b aria-live="polite">{qty}</b>
            <button type="button" aria-label="Increase quantity" onClick={() => setQty(Math.min(p.stock || 1, qty + 1))}><Icon name="plus" size={18} /></button>
            <span className="total">Total <b>{usd(p.priceUsd * qty)}</b></span>
          </div>
        </div>
        {cfg?.paypalMode !== 'mock' && <div ref={btnRef} className="pp-buttons" />}
        {cfg?.paypalMode !== 'mock' && sdkState !== 'ready' && <div className="muted small">{sdkState === 'failed' ? 'PayPal buttons could not load — use the button below.' : 'Loading PayPal…'}</div>}
        <button className="btn paypal block" onClick={payViaLink} disabled={busy || p.stock <= 0}>
          {busy ? <span className="spinner dark" /> : <Icon name="paypal" size={20} />}
          {cfg?.paypalMode === 'mock' ? 'Pay with PayPal (mock)' : busy ? 'Opening PayPal…' : 'Pay with PayPal'}
        </button>
        {p.priceNgn && <p className="muted tiny center">Charged in USD ({usd(p.priceUsd)} per item) — PayPal does not settle in Naira.</p>}
        {err && <p className="error"><Icon name="alert" size={16} />{err}</p>}
      </div>
      <div className="card ask">
        <h4><Icon name="chat" size={18} />Ask the shop</h4>
        {chat.length === 0 && <p className="muted small">Questions about delivery, sizes or colours get an instant answer.</p>}
        {chat.map((c, i) => <div key={i} className="qa"><div className="bubble me">{c.q}</div><div className="bubble bot">{c.a}</div></div>)}
        <form onSubmit={ask} className="ask-form"><label htmlFor="ask-input" className="sr-only">Your question</label><input id="ask-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Do you deliver to Abuja?" /><button className="send-btn" aria-label="Ask"><Icon name="send" size={18} /></button></form>
      </div>
      <footer className="store-foot"><Icon name="lock" size={14} />Payments are processed by PayPal. Your card details are never shared with the seller.</footer>
    </div>
  );
}
