import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { api, type AppConfig } from './api';
import { Icon } from './components/Icon';
import Copilot from './pages/Copilot';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Storefront from './pages/Storefront';
import Paid from './pages/Paid';
import About from './pages/About';

const NAV = [
  { to: '/', label: 'Copilot', icon: 'chat' as const, end: true },
  { to: '/products', label: 'Products', icon: 'bag' as const },
  { to: '/sales', label: 'Sales', icon: 'chart' as const },
  { to: '/about', label: 'About', icon: 'info' as const },
];

function StatusPills({ cfg }: { cfg: AppConfig | null }) {
  if (!cfg) return <div className="pills"><span className="pill skeleton-pill" /></div>;
  const mock = cfg.paypalMode === 'mock';
  const llm = !cfg.aiEngine.startsWith('rules');
  return (
    <div className="pills">
      <span className={`pill ${mock ? 'pill-warn' : 'pill-ok'}`} title={mock ? 'Running without PayPal credentials' : `PayPal ${cfg.paypalMode}`}>
        <span className="dot" />{mock ? 'Mock' : cfg.paypalMode === 'sandbox' ? 'Sandbox' : 'Live'}
      </span>
      <span className="pill pill-ai" title={cfg.aiEngine}><Icon name={llm ? 'sparkle' : 'cpu'} size={14} /><span className="pill-label">{llm ? 'AI' : 'Offline AI'}</span></span>
    </div>
  );
}

export default function App() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const loc = useLocation();
  useEffect(() => { api<AppConfig>('/config').then(setCfg).catch(() => undefined); }, []);
  const buyerView = loc.pathname.startsWith('/p/') || loc.pathname.startsWith('/paid');

  if (buyerView)
    return (
      <Routes>
        <Route path="/p/:slug" element={<Storefront cfg={cfg} />} />
        <Route path="/paid" element={<Paid />} />
      </Routes>
    );

  const brand = (
    <div className="brand">
      <img src="/logo.svg" alt="" width={36} height={36} />
      <div className="brand-text">
        <div className="brand-name">SellerPilot <span className="ng">NG</span></div>
        <div className="brand-shop">{cfg?.shopName ?? 'Loading shop…'}</div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Main navigation">
        {brand}
        <nav className="side-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} /><span>{n.label}</span></NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <StatusPills cfg={cfg} />
          <div className="secured"><Icon name="paypal" size={16} />Payments by PayPal</div>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          {brand}
          <StatusPills cfg={cfg} />
        </header>
        <main className="content" key={loc.pathname}>
          <Routes>
            <Route path="/" element={<Copilot />} />
            <Route path="/products" element={<Products />} />
            <Route path="/sales" element={<Sales />} />
            <Route path="/about" element={<About cfg={cfg} />} />
          </Routes>
        </main>
      </div>
      <nav className="tabs" aria-label="Main navigation">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} size={22} /><span>{n.label}</span></NavLink>
        ))}
      </nav>
    </div>
  );
}
