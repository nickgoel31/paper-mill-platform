import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import {
  getInvoices,
  getInvoiceSummaryStats,
} from "@/server/services/invoice-service";
import { getClientOptions } from "@/server/services/lookup-service";
import { InvoiceList } from "@/components/invoices/invoice-list";

export const metadata = {
  title: "GST Tax Invoices & Billing | PaperMill ERP",
};

export default async function InvoicesPage() {
  const { tenantId, role } = await requireRole(Role.ADMIN, Role.DISPATCH, Role.SALES, Role.PLANNER);

  const [initialData, stats, clients] = await Promise.all([
    getInvoices({ page: 1, pageSize: 20 }),
    getInvoiceSummaryStats(),
    getClientOptions(tenantId!),
  ]);

  return (
    <InvoiceList
      initialData={JSON.parse(JSON.stringify(initialData))}
      initialStats={stats}
      clients={clients}
      userRole={role}
    />
  );
}
