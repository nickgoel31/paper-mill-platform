"use client";

import * as React from "react";
import { renderWhatsAppMessage } from "@/lib/whatsapp/templates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Phone, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";

interface NotificationPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notification: any | null;
}

export function NotificationPreviewModal({
  open,
  onOpenChange,
  notification,
}: NotificationPreviewModalProps) {
  if (!notification) return null;

  const payload = (notification.payload as Record<string, any>) || {};
  const renderedText = renderWhatsAppMessage(
    notification.templateName,
    payload,
    "HRA Paper Mill"
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(renderedText);
    toast.success("Message copied to clipboard!");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-700">
            <MessageSquare className="h-5 w-5" />
            <DialogTitle className="text-base font-bold">
              WhatsApp Notification Preview
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Fully rendered text message as dispatched to the customer&apos;s verified WhatsApp number.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Metadata Card */}
          <div className="p-3 bg-slate-50 border rounded-lg grid grid-cols-2 gap-2 font-mono text-[11px]">
            <div>
              <span className="text-[10px] text-muted-foreground font-sans uppercase block">
                Destination Phone
              </span>
              <strong className="text-slate-900">+{notification.phoneNumber}</strong>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground font-sans uppercase block">
                Template Name
              </span>
              <Badge variant="outline" className="font-mono text-[10px]">
                {notification.templateName}
              </Badge>
            </div>
            {notification.providerMessageId && (
              <div className="col-span-2 pt-1 border-t border-slate-200">
                <span className="text-[10px] text-muted-foreground font-sans uppercase block">
                  Provider Message ID (WAMID)
                </span>
                <span className="text-muted-foreground text-[10px] truncate block">
                  {notification.providerMessageId}
                </span>
              </div>
            )}
          </div>

          {/* Rendered Bubble (WhatsApp Green UI Mockup) */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-800">Rendered Message Body</label>
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-950 font-sans leading-relaxed shadow-inner whitespace-pre-wrap">
              {renderedText}
            </div>
          </div>

          {/* Raw Payload JSON */}
          <div className="space-y-1">
            <label className="font-semibold text-slate-800">Template Payload Variables</label>
            <pre className="p-3 bg-slate-900 text-emerald-400 rounded-lg text-[10px] font-mono overflow-x-auto max-h-32">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="text-xs gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" /> Copy Text
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
