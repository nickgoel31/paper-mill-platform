import { db } from "@/lib/db";
import { PostProductionMode } from "@/generated/prisma/browser";

/**
 * A mill's default routing for finished reels once a production run completes.
 * (Not a "use server" module — this is an internal helper, not a client-callable action.)
 */
export async function getPostProductionMode(tenantId: string | null): Promise<PostProductionMode> {
  if (!tenantId) return PostProductionMode.AUTO_DISPATCH;
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId },
    select: { postProductionMode: true },
  });
  return tenant?.postProductionMode ?? PostProductionMode.AUTO_DISPATCH;
}
