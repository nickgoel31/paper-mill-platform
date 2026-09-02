import { requireRole } from "@/server/auth-helpers";
import { Role } from "@/generated/prisma/browser";
import {
  getNotifications,
  getNotificationSummaryStats,
} from "@/server/services/notification-service";
import { NotificationList } from "@/components/notifications/notification-list";

export const metadata = {
  title: "WhatsApp Notifications | PaperMill ERP",
};

export default async function NotificationsPage() {
  await requireRole(Role.ADMIN, Role.DISPATCH);

  const [initialData, stats] = await Promise.all([
    getNotifications({ page: 1, pageSize: 20 }),
    getNotificationSummaryStats(),
  ]);

  return (
    <NotificationList
      initialData={JSON.parse(JSON.stringify(initialData))}
      initialStats={stats}
    />
  );
}
