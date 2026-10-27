export type Currency = 'USD';

export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  emoji: string;
  priceUsd: number;
  priceNgn?: number;
  stock: number;
  colors: string[];
  sizes: string[];
  delivery?: string;
  hashtags: string[];
  caption: string;
  faq: { q: string; a: string }[];
  rawInput?: string;
  source: 'rules' | 'llm';
  views: number;
  createdAt: string;
  sample?: boolean;
}

export type OrderStatus = 'CREATED' | 'PAYER_ACTION_REQUIRED' | 'APPROVED' | 'COMPLETED' | 'VOIDED' | 'FAILED';

export interface Order {
  id: string; // local id
  paypalOrderId: string;
  productId: string;
  title: string;
  qty: number;
  amountUsd: number;
  status: OrderStatus;
  approveUrl?: string;
  captureId?: string;
  buyerName?: string;
  buyerEmail?: string;
  channel: 'storefront' | 'agent-link' | 'invoice';
  mock?: boolean;
  sample?: boolean;
  createdAt: string;
  capturedAt?: string;
}

export interface Invoice {
  id: string; // local id
  paypalInvoiceId: string;
  number?: string;
  recipientName: string;
  recipientEmail: string;
  items: { productId: string; title: string; qty: number; unitUsd: number }[];
  totalUsd: number;
  status: string;
  payerViewUrl?: string;
  qrPngBase64?: string;
  via: 'paypal-agent-toolkit' | 'mock';
  createdAt: string;
}

export interface AgentAction {
  tool: string;
  via: 'sellerpilot' | 'paypal-agent-toolkit' | 'paypal-orders-v2' | 'llm';
  summary: string;
  ok: boolean;
  ms: number;
}

export type AgentCard =
  | { type: 'listing'; product: Product }
  | { type: 'checkout'; product: Product; storefrontUrl: string; order?: Order; qrDataUrl?: string }
  | { type: 'invoice'; invoice: Invoice }
  | { type: 'summary'; stats: DashboardStats }
  | { type: 'reply'; question: string; answer: string; product?: Product }
  | { type: 'order'; order: Order };

export interface AgentResult {
  reply: string;
  actions: AgentAction[];
  cards: AgentCard[];
  engine: string;
}

export interface DashboardStats {
  revenueUsd: number;
  revenueNgn: number;
  paidOrders: number;
  pendingOrders: number;
  conversionRate: number; // paid / created
  avgOrderUsd: number;
  topProduct?: { title: string; units: number; revenueUsd: number };
  daily: { date: string; revenueUsd: number; orders: number }[];
  lowStock: { title: string; stock: number }[];
  invoices: { sent: number; paid: number; outstandingUsd: number };
  insights: string[];
  hasSample: boolean;
}
