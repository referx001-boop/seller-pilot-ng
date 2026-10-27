import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, price, type Product } from '../api';
import { CopyBtn, ShareBtn, WhatsAppBtn } from '../components/Cards';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

export default function Products() {
  const [items, setItems] = useState<Product[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [qr, setQr] = useState<Record<string, string>>({});
  const notify = useToast();
  const load = () => api<Product[]>('/products').then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  async function toggle(p: Product) {
    setOpen(open === p.id ? null : p.id);
    if (!qr[p.id]) { const r = await api<{ dataUrl: string }>(`/products/${p.id}/qr`); setQr((q) => ({ ...q, [p.id]: r.dataUrl })); }
  }
  async function remove(p: Product) {
    if (!confirm(`Delete “${p.title}”?`)) return;
    await api(`/products/${p.id}`, { method: 'DELETE' }); notify('Listing deleted', 'info'); load();
  }
  const url = (p: Product) => `${location.origin}/p/${p.slug}`;

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Products</h1><p className="muted">{items ? `${items.length} listing${items.length === 1 ? '' : 's'} · tap one to share its pay link` : 'Loading…'}</p></div>
        <Link to="/" className="btn primary sm"><Icon name="plus" size={16} />New</Link>
      </div>
      {!items && <div className="plist">{[0, 1, 2].map((i) => <div key={i} className="card skeleton-card"><div className="sk sk-sq" /><div className="grow"><div className="sk sk-line" /><div className="sk sk-line short" /></div></div>)}</div>}
      {items && !items.length && (
        <div className="empty-state">
          <span className="empty-icon"><Icon name="bag" size={28} /></span>
          <h3>No listings yet</h3>
          <p className="muted">Describe a product to the Copilot and it will write the listing and PayPal checkout for you.</p>
          <Link to="/" className="btn primary"><Icon name="chat" size={18} />Open Copilot</Link>
        </div>
      )}
      <div className="plist">
        {items?.map((p) => (
          <div key={p.id} className={`card product ${open === p.id ? 'open' : ''}`}>
            <button className="product-row" onClick={() => toggle(p)} aria-expanded={open === p.id}>
              <div className="emoji" aria-hidden>{p.emoji}</div>
              <div className="grow">
                <h3>{p.title} {p.sample && <span className="tag">Sample</span>}</h3>
                <div className="muted small">{p.category} · {p.stock} left · {p.views} views</div>
                <div className="price">{price(p)}</div>
              </div>
              <Icon name="chevron" size={18} className="chev" />
            </button>
            {open === p.id && (
              <div className="pdetail">
                <p className="body-text">{p.description}</p>
                <div className="pay-body">
                  {qr[p.id] ? <img className="qr" src={qr[p.id]} alt={`QR code for ${p.title} checkout`} width={112} height={112} /> : <div className="qr qr-empty"><span className="spinner dark" /></div>}
                  <div className="grow">
                    <span className="pp-badge"><Icon name="paypal" size={16} />Checkout page</span>
                    <a className="linkbox" href={`/p/${p.slug}`} target="_blank" rel="noreferrer"><Icon name="link" size={16} /><span>{url(p).replace(/^https?:\/\//, '')}</span></a>
                  </div>
                </div>
                <div className="btnrow">
                  <CopyBtn text={url(p)} label="Copy link" toast="Checkout link copied" variant="primary" />
                  <ShareBtn text={`${p.caption}\n\n${url(p)}`} title={p.title} />
                  <WhatsAppBtn text={`${p.caption}\n\n${url(p)}`} />
                  <CopyBtn text={p.caption} label="Caption" toast="Caption copied" />
                  <button className="btn ghost sm danger" onClick={() => remove(p)}><Icon name="trash" size={16} />Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
