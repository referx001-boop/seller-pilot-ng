import { ngn, usd, type Stats } from '../api';
import { Icon } from './Icon';

export default function StatsView({ stats, compact }: { stats: Stats; compact?: boolean }) {
  const max = Math.max(1, ...stats.daily.map((d) => d.revenueUsd));
  return (
    <div className="stats">
      <div className="kpis">
        <div className="kpi main">
          <small>Revenue (paid)</small>
          <b>{usd(stats.revenueUsd)}</b>
          <span>≈ {ngn(stats.revenueNgn)}</span>
        </div>
        <div className="kpi"><small>Paid orders</small><b>{stats.paidOrders}</b><span>{stats.pendingOrders} pending</span></div>
        <div className="kpi"><small>Conversion</small><b>{Math.round(stats.conversionRate * 100)}%</b><span>avg {usd(stats.avgOrderUsd)}</span></div>
        {!compact && <div className="kpi"><small>Invoices sent</small><b>{stats.invoices.sent}</b><span>{stats.invoices.paid} paid</span></div>}
        {!compact && <div className="kpi"><small>Outstanding</small><b>{usd(stats.invoices.outstandingUsd)}</b><span>on invoices</span></div>}
      </div>
      <div className="chart-head"><span>Revenue, last 7 days</span></div>
      <div className="chart" role="img" aria-label={`Revenue last 7 days: ${stats.daily.map((d) => `${d.date} ${usd(d.revenueUsd)}`).join(', ')}`}>
        {stats.daily.every((d) => !d.revenueUsd) && <div className="chart-empty">No paid sales in the last 7 days yet</div>}
        {stats.daily.map((d) => (
          <div key={d.date} className="bar-wrap" title={`${d.date}: ${usd(d.revenueUsd)}`}>
            <div className={`bar ${d.revenueUsd ? '' : 'bar-zero'}`} style={{ height: `${Math.max(3, (d.revenueUsd / max) * 100)}%` }} />
            <small>{new Date(d.date + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short' })}</small>
          </div>
        ))}
      </div>
      {stats.insights.length > 0 && (
        <div className="insights">
          <h4><Icon name="sparkle" size={16} />Copilot insights</h4>
          <ul>{stats.insights.map((i) => <li key={i}>{i}</li>)}</ul>
        </div>
      )}
      {!compact && stats.lowStock.length > 0 && (
        <div className="lowstock"><Icon name="alert" size={16} /><span>Low stock: {stats.lowStock.map((l) => `${l.title} (${l.stock})`).join(', ')}</span></div>
      )}
    </div>
  );
}
