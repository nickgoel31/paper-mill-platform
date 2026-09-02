import { requireRole } from "@/server/auth-helpers";
import { Role } from "@prisma/client";
import { getSystemSettings } from "@/server/services/settings-service";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata = {
  title: "System & Mill Settings | PaperMill ERP",
};

export default async function SettingsPage() {
  await requireRole(Role.ADMIN);

  const settings = await getSystemSettings();

  return <SettingsView initialSettings={JSON.parse(JSON.stringify(settings))} />;
}
