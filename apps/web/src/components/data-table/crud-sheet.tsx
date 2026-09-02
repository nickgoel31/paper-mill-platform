"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface CrudSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  isSubmitting?: boolean;
  submitLabel?: string;
  onSubmit?: () => void;
  width?: string;
}

export function CrudSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  isSubmitting = false,
  submitLabel = "Save Changes",
  onSubmit,
  width = "sm:max-w-xl",
}: CrudSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={`flex flex-col h-full ${width} p-0`}>
        {/* Header */}
        <SheetHeader className="px-6 py-4 border-b bg-slate-50/50 shrink-0">
          <SheetTitle className="text-lg font-bold text-slate-900">
            {title}
          </SheetTitle>
          {description && (
            <SheetDescription className="text-xs text-muted-foreground">
              {description}
            </SheetDescription>
          )}
        </SheetHeader>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>

        {/* Footer Actions if onSubmit provided directly */}
        {onSubmit && (
          <SheetFooter className="px-6 py-3 border-t bg-slate-50/50 flex flex-row justify-end gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting}
              onClick={onSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
