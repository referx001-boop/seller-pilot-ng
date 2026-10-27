import { useState } from 'react';
import { copy, ngn, price, usd, whatsappShare, type AgentAction, type AgentCard } from '../api';
import { Icon } from './Icon';
import { useToast } from './Toast';
import StatsView from './StatsView';

export function CopyBtn({ text, label = 'Copy', toast = 'Copied to clipboard', variant = 'ghost' }: { text: string; label?: string; toast?: string; variant?: string }) {
  const [done, setDone] = useState(false);
  const notify = useToast();
  return (
    <button type="button" className={`btn ${variant} sm`} onClick={() => { copy(text); setDone(true); notify(toast); setTimeout(() => setDone(false), 1500); }}>
      <Icon name={done ? 'check' : 'copy'} size={16} />{done ? 'Copied' : label}
    </button>
  );
}

/** Native share sheet when available, otherwise copies the text. */
export function ShareBtn({ text, title, url }: { text: string; title?: string; url?: string }) {
  const notify = useToast();
  return (
    <button type="button" className="btn ghost sm" onClick={async () => {
      if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch { return; } }
      copy(url ? `${text}` : text); notify('Share text copied');
    }}><Icon name="share" size={16} />Share</button>
  );
}

export function WhatsAppBtn({ text, label = 'WhatsApp' }: { text: string; label?: string }) {
  return <a className="btn wa sm" href={whatsappShare(text)} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={16} />{label}</a>;
}

const SERVICE: Record<string, { label: string; icon: 'paypal' | 'sparkle' | 'bolt'; cls: string }> = {
  'paypal-agent-toolkit': { label: 'PayPal Agent Toolkit', icon: 'paypal', cls: 'svc-paypal' },
  'paypal-orders-v2': { label: 'PayPal Orders v2', icon: 'paypal', cls: 'svc-paypal' },
  llm: { label: 'Language model', icon: 'sparkle', cls: 'svc-llm' },
};
const service = (via: string) => SERVICE[via] ?? { label: via === 'mock' ? 'PayPal (mock)' : 'SellerPilot', icon: via === 'mock' ? 'paypal' as const : 'bolt' as const, cls: via === 'mock' ? 'svc-mock' : 'svc-local' };

export function ActionTrace({ actions, engine }: { actions: AgentAction[]; engine?: string }) {
  if (!actions.length) return null;
  return (
    <div className="trace" aria-label="Actions the agent took">
      <div className="trace-head"><Icon name="bolt" size={14} />{actions.length} action{actions.length > 1 ? 's' : ''} taken</div>
      {actions.map((a, i) => {
        const s = service(a.via);
        return (
          <div key={i} className={`action ${a.ok ? 'ok' : 'err'}`}>
            <span className={`svc-icon ${s.cls}`}><Icon name={s.icon} size={16} /></span>
            <div className="action-body">
              <div className="action-top"><span className={`svc-name ${s.cls}`}>{s.label}</span><code>{a.tool}</code></div>
              <div className="action-sum">{a.summary}</div>
            </div>
            <div className="action-meta">
              <span className={`state ${a.ok ? 'state-ok' : 'state-err'}`} title={a.ok ? 'Succeeded' : 'Failed'}><Icon name={a.ok ? 'check' : 'x'} size={12} /></span>
              <span className="ms">{a.ms}ms</span>
            </div>
          </div>
        );
      })}
      {engine && <div className="engine">Planner · {engine}</div>}
    </div>
  );
}

function QrBox({ src, alt }: { src?: string; alt: string }) {
  return src
    ? <img className="qr" src={src} alt={alt} width={112} height={112} />
    : <div className="qr qr-empty" aria-hidden><Icon name="qr" size={28} /></div>;
}

export function Card({ card }: { card: AgentCard }) {
  switch (card.type) {
    case 'listing': {
      const p = card.product;
      return (
        <div className="card agent-card">
          <div className="card-kicker"><Icon name="bag" size={14} />Listing created</div>
          <div className="listing-head">
            <div className="emoji" aria-hidden>{p.emoji}</div>
            <div className="grow">
              <h3>{p.title}</h3>
              <div className="price">{price(p)}</div>
              <div className="muted small">{p.category} · {p.stock} in stock</div>
            </div>
          </div>
          <p className="body-text">{p.description}</p>
          {(p.colors.length > 0 || p.sizes.length > 0) && <div className="chips">{p.colors.map((c) => <span key={c} className="chip">{c}</span>)}{p.sizes.map((s) => <span key={s} className="chip alt">{s}</span>)}</div>}
          <details className="disclosure">
            <summary><span>Instagram / WhatsApp caption</span><Icon name="chevron" size={16} className="chev" /></summary>
            <pre className="caption">{p.caption}</pre>
            <div className="btnrow"><CopyBtn text={p.caption} label="Copy caption" toast="Caption copied" /><WhatsAppBtn text={p.caption} label="Post" /></div>
          </details>
          <div className="card-foot muted">Written by {p.source === 'llm' ? 'language model' : 'offline AI'}</div>
        </div>
      );
    }
    case 'checkout': {
      const link = card.order?.approveUrl || card.storefrontUrl;
      const msg = `${card.product.emoji} ${card.product.title} — ${price(card.product)}\nPay securely with PayPal: ${link}`;
      return (
        <div className="card agent-card pay-card">
          <div className="pay-head">
            <span className="pp-badge"><Icon name="paypal" size={16} />{card.order ? 'PayPal pay link' : 'PayPal checkout page'}</span>
            {card.order?.mock && <span className="status s-mock">Mock</span>}
          </div>
          <div className="pay-body">
            <QrBox src={card.qrDataUrl} alt="QR code for the PayPal link" />
            <div className="grow">
              <div className="pay-title">{card.product.title}</div>
              <div className="pay-amount">{card.order ? usd(card.order.amountUsd) : card.product.priceNgn ? ngn(card.product.priceNgn) : usd(card.product.priceUsd)}</div>
              <div className="muted small">{card.order ? `${card.order.qty} × ${usd(card.product.priceUsd)}` : card.product.priceNgn ? `Charged ${usd(card.product.priceUsd)} via PayPal` : 'per item'}</div>
            </div>
          </div>
          <a className="linkbox" href={link} target="_blank" rel="noreferrer"><Icon name="link" size={16} /><span>{link.replace(/^https?:\/\//, '')}</span><Icon name="external" size={14} /></a>
          <div className="btnrow btnrow-3">
            <CopyBtn text={link} label="Copy link" toast="Pay link copied" variant="primary" />
            <ShareBtn text={msg} title={card.product.title} />
            <WhatsAppBtn text={msg} />
          </div>
          {card.order && <div className="card-foot muted mono">Order {card.order.paypalOrderId} · {card.order.status.replace(/_/g, ' ').toLowerCase()}</div>}
        </div>
      );
    }
    case 'invoice': {
      const i = card.invoice;
      return (
        <div className="card agent-card pay-card">
          <div className="pay-head">
            <span className="pp-badge"><Icon name="invoice" size={16} />PayPal invoice{i.number ? ` #${i.number}` : ''}</span>
            <span className={`status s-${i.status}`}>{i.status}</span>
          </div>
          <div className="pay-body">
            <QrBox src={i.qrPngBase64 ? `data:image/png;base64,${i.qrPngBase64}` : undefined} alt="PayPal invoice QR code" />
            <div className="grow">
              <div className="muted small">Billed to</div>
              <div className="pay-title">{i.recipientName}</div>
              <div className="muted small break">{i.recipientEmail}</div>
              <div className="pay-amount">{usd(i.totalUsd)}</div>
            </div>
          </div>
          <ul className="line-items">{i.items.map((x, k) => <li key={k}><span>{x.qty} × {x.title}</span><b>{usd(x.qty * x.unitUsd)}</b></li>)}</ul>
          {i.payerViewUrl && <div className="btnrow"><a className="btn paypal sm" href={i.payerViewUrl} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Open invoice</a><CopyBtn text={i.payerViewUrl} label="Copy pay link" toast="Invoice link copied" /><ShareBtn text={`Your invoice from us: ${i.payerViewUrl}`} title="PayPal invoice" /></div>}
          <div className="card-foot muted mono">{i.paypalInvoiceId} · via {i.via === 'mock' ? 'mock' : 'PayPal Agent Toolkit'}</div>
        </div>
      );
    }
    case 'reply':
      return (
        <div className="card agent-card">
          <div className="card-kicker"><Icon name="chat" size={14} />Draft reply to buyer</div>
          <div className="quote"><Icon name="user" size={14} />{card.question}</div>
          <div className="draft">{card.answer}</div>
          <div className="btnrow"><CopyBtn text={card.answer} label="Copy reply" toast="Reply copied" /><WhatsAppBtn text={card.answer} label="Send on WhatsApp" /></div>
        </div>
      );
    case 'summary':
      return <div className="card agent-card"><div className="card-kicker"><Icon name="chart" size={14} />Sales summary</div><StatsView stats={card.stats} compact /></div>;
    case 'order':
      return (
        <div className="card agent-card">
          <div className="pay-head"><span className="pp-badge"><Icon name="paypal" size={16} />PayPal order</span><span className={`status s-${card.order.status}`}>{card.order.status === 'COMPLETED' ? 'PAID' : card.order.status === 'PAYER_ACTION_REQUIRED' ? 'AWAITING PAYMENT' : card.order.status.replace(/_/g, ' ')}</span></div>
          <div className="pay-title">{card.order.title}</div>
          <div className="pay-amount">{usd(card.order.amountUsd)}</div>
          <div className="card-foot muted mono">{card.order.paypalOrderId}</div>
        </div>
      );
  }
}
