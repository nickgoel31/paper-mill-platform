import { notFound } from "next/navigation";
import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import { getInvoiceById } from "@/server/services/invoice-service";
import { getSystemSettings } from "@/server/services/settings-service";
import { InvoiceDetailView } from "@/components/invoices/invoice-detail-view";

export const metadata = {
  title: "Tax Invoice View | PaperMill ERP",
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { role } = await requireRole(
    Role.ADMIN,
    Role.DISPATCH,
    Role.SALES,
    Role.PLANNER
  );

  const { id } = await params;
  const invoice = await getInvoiceById(id);

  if (!invoice) {
    notFound();
  }
  const settings = await getSystemSettings();

  return (
    <InvoiceDetailView
      invoice={JSON.parse(JSON.stringify(invoice))}
      userRole={role}
      seller={{
        name: settings.millName,
        address: settings.millAddress,
        gstin: settings.millGstin,
        state: settings.millState,
        phone: settings.contactPhone,
        email: settings.contactEmail,
        bankName: settings.bankName,
        bankAccountName: settings.bankAccountName,
        bankAccountNumber: settings.bankAccountNumber,
        bankIfsc: settings.bankIfsc,
      }}
    />
  );
}
