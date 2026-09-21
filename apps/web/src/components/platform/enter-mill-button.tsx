"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enterMill } from "@/server/services/platform-service";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";

/** Step into a mill's ERP as its admin ("view as mill"). */
export function EnterMillButton({
  tenantId,
  disabled,
  size = "sm",
}: {
  tenantId: string;
  disabled?: boolean;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function go() {
    setBusy(true);
    try {
      await enterMill(tenantId);
      router.push("/");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Could not open mill");
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={disabled || busy}
      onClick={go}
      className="rounded-xl"
    >
      {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />}
      Open mill
    </Button>
  );
}
