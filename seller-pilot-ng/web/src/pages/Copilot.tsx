import { useEffect, useRef, useState } from 'react';
import { api, type AgentResult } from '../api';
import { ActionTrace, Card } from '../components/Cards';
import { Icon } from '../components/Icon';

interface Msg { role: 'user' | 'assistant'; content: string; result?: AgentResult; error?: boolean }
const KEY = 'sellerpilot.chat.v1';

const SUGGESTIONS: { label: string; icon: 'bag' | 'link' | 'invoice' | 'chat' | 'chart'; text: string }[] = [
  { label: 'List a product', icon: 'bag', text: 'Selling handmade Ankara tote bags, 15k each, red and blue, 12 in stock. Delivery within Lagos 1-2 days, nationwide 3-5 days' },
  { label: 'Pay link for 2 bags', icon: 'link', text: 'Send a payment link for 2 tote bags' },
  { label: 'Invoice a customer', icon: 'invoice', text: 'Invoice Chioma Okafor chioma@example.com for 2 tote bags' },
  { label: 'Reply in Pidgin', icon: 'chat', text: 'Customer asked: "abeg how much e be, una dey deliver to Abuja?"' },
  { label: 'Sales this week', icon: 'chart', text: 'How are my sales this week?' },
];

const CAPS = [
  { icon: 'bag' as const, t: 'Listings & captions', d: 'From one WhatsApp-style message' },
  { icon: 'paypal' as const, t: 'PayPal pay links + QR', d: 'Share anywhere, get paid in USD' },
  { icon: 'invoice' as const, t: 'PayPal invoices', d: 'Sent through the Agent Toolkit' },
  { icon: 'chat' as const, t: 'Buyer replies', d: 'English or Pidgin, instantly' },
];

export default function Copilot() {
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30)));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    end.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [msgs, busy]);

  async function send(message: string) {
    if (!message.trim() || busy) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: message }]);
    setText(''); setBusy(true);
    try {
      const result = await api<AgentResult>('/agent', { body: { message, history } });
      setMsgs((m) => [...m, { role: 'assistant', content: result.reply, result }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Something went wrong: ${(e as Error).message}`, error: true }]);
    } finally { setBusy(false); input.current?.focus(); }
  }

  return (
    <div className="copilot">
      {msgs.length === 0 ? (
        <section className="welcome">
          <div className="hero">
            <span className="hero-eyebrow"><Icon name="sparkle" size={14} />Your AI sales co-pilot</span>
            <h1>Tell me what you're selling, like you would on WhatsApp.</h1>
            <p>I'll write the listing, create a PayPal pay link, send invoices, answer buyers and track your sales.</p>
          </div>
          <div className="caps">
            {CAPS.map((c) => (
              <div key={c.t} className="cap"><span className="cap-icon"><Icon name={c.icon} size={18} /></span><div><b>{c.t}</b><span>{c.d}</span></div></div>
            ))}
          </div>
          <div className="section-label">Try one</div>
        </section>
      ) : (
        <div className="thread">
          {msgs.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' && <span className="avatar" aria-hidden><img src="/logo.svg" alt="" width={28} height={28} /></span>}
              <div className="msg-col">
                <div className={`bubble ${m.error ? 'bubble-error' : ''}`}>{m.error && <Icon name="alert" size={16} />}{m.content}</div>
                {m.result && <ActionTrace actions={m.result.actions} engine={m.result.engine} />}
                {m.result?.cards.map((c, j) => <Card key={j} card={c} />)}
              </div>
            </div>
          ))}
          {busy && (
            <div className="msg assistant">
              <span className="avatar" aria-hidden><img src="/logo.svg" alt="" width={28} height={28} /></span>
              <div className="msg-col"><div className="bubble typing" aria-label="SellerPilot is working"><span /><span /><span /><em>Working on it…</em></div></div>
            </div>
          )}
        </div>
      )}
      <div ref={end} />
      <div className="dock">
        <div className="suggest" role="list">
          {SUGGESTIONS.map((s) => (
            <button key={s.label} role="listitem" className="chip-btn" onClick={() => send(s.text)} disabled={busy} title={s.text}><Icon name={s.icon} size={16} />{s.label}</button>
          ))}
        </div>
        <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <label htmlFor="composer-input" className="sr-only">Message SellerPilot</label>
          <textarea id="composer-input" ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. New stock: Adire two-piece ₦28,000, sizes S–XL, 6 left…" rows={1}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
          <button className="send-btn" disabled={busy || !text.trim()} aria-label="Send message">
            {busy ? <span className="spinner" /> : <Icon name="send" size={20} />}
          </button>
        </form>
        {msgs.length > 0 && <button className="linkish" onClick={() => setMsgs([])}><Icon name="refresh" size={14} />New conversation</button>}
      </div>
    </div>
  );
}
