import { Link, Navigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, FileSliders, LayoutDashboard,
  Package, Route, Settings2, Users,
} from 'lucide-react';
import ClientsSection from '../components/settings/ClientsSection.jsx';
import ProductsSection from '../components/settings/ProductsSection.jsx';
import InvoiceFieldsSection from '../components/settings/InvoiceFieldsSection.jsx';
import PaymentTimelineSettings from '../components/settings/PaymentTimelineSettings.jsx';
import DashboardFiltersSection from '../components/settings/DashboardFiltersSection.jsx';
import { PageHeader } from '../components/ui.jsx';

// A single focused section at a time. The overview does not mount any data-editing panels
// or make their API requests until the user opens that section.
const SECTIONS = [
  {
    key: 'clients', title: 'Clients', category: 'Invoice management',
    description: 'Manage client names, addresses, and TIN details used on invoices.',
    icon: Users, tone: 'bg-brand-soft text-brand-ink', Component: ClientsSection,
  },
  {
    key: 'products', title: 'Products & Services', category: 'Invoice management',
    description: 'Maintain the products and services available when creating an invoice.',
    icon: Package, tone: 'bg-info-soft text-info-ink', Component: ProductsSection,
  },
  {
    key: 'invoice-fields', title: 'Invoice Fields', category: 'Invoice management',
    description: 'Add and organize custom fields for your invoice forms.',
    icon: FileSliders, tone: 'bg-success-soft text-success-ink', Component: InvoiceFieldsSection,
  },
  {
    key: 'payment-timeline', title: 'Payment Timeline', category: 'Invoice management',
    description: 'Create, reorder, and customize your payment tracking stages.',
    icon: Route, tone: 'bg-warning-soft text-warning-ink', Component: PaymentTimelineSettings,
  },
  {
    key: 'dashboard-filters', title: 'Dashboard Filters', category: 'Dashboard',
    description: 'Choose which filters appear in your dashboard and their order.',
    icon: LayoutDashboard, tone: 'bg-brand-soft text-brand-ink', Component: DashboardFiltersSection,
  },
];

export default function Settings() {
  const { section } = useParams();

  if (!section) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <PageHeader
          title="Settings"
          description="Choose what you would like to manage. Each area opens separately so you can focus on one thing at a time."
        />
        <nav aria-label="Settings sections">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Settings2 size={16} className="text-fg-subtle" aria-hidden="true" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-fg-muted">Settings areas</h2>
          </div>
          <div className="flex flex-col gap-3">
            {SECTIONS.map(({ key, title, description, category, icon: Icon, tone }) => (
              <Link
                key={key}
                to={`/settings/${key}`}
                className="group flex min-w-0 items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4 text-left shadow-sm outline-none transition-colors hover:border-brand/40 hover:bg-surface-2/60 focus-visible:ring-2 focus-visible:ring-brand/40 sm:px-5 sm:py-5"
                aria-label={`Open ${title} settings`}
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tone}`} aria-hidden="true">
                  <Icon size={23} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{category}</span>
                  <span className="mt-0.5 block text-sm font-semibold text-fg sm:text-base">{title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-fg-muted sm:text-sm">{description}</span>
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-fg-muted transition-colors group-hover:border-brand/30 group-hover:bg-brand-soft group-hover:text-brand-ink" aria-hidden="true">
                  <ChevronRight size={18} />
                </span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    );
  }

  const active = SECTIONS.find((item) => item.key === section);
  if (!active) return <Navigate to="/settings" replace />;

  const Icon = active.icon;
  const Content = active.Component;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <nav aria-label="Settings navigation">
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          All settings
        </Link>
      </nav>
      <header className="flex items-start gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${active.tone}`} aria-hidden="true">
          <Icon size={23} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-fg-subtle">{active.category}</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-fg">{active.title}</h1>
          <p className="mt-1 text-sm text-fg-muted">{active.description}</p>
        </div>
      </header>
      <div className="w-full min-w-0">
        <Content />
      </div>
    </div>
  );
}
