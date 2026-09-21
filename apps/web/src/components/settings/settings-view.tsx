"use client";

import * as React from "react";
import { toast } from "sonner";
import { updateSystemSettings, SystemSettingsMap } from "@/server/services/settings-service";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Landmark,
  Percent,
  Scissors,
  Save,
  Loader2,
  ShieldCheck,
  Settings as SettingsIcon,
  Sparkles,
} from "lucide-react";

interface SettingsViewProps {
  initialSettings: SystemSettingsMap;
}

export function SettingsView({ initialSettings }: SettingsViewProps) {
  const [form, setForm] = React.useState<SystemSettingsMap>(initialSettings);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSystemSettings(form);
      toast.success("System & Mill configuration settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update system settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl mx-auto font-sans pb-10">
      {/* 1. TOP HERO BANNER */}
      <div className="bg-white rounded-2xl p-6 sm:p-7 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold uppercase tracking-wide">
            SYSTEM & MASTERS • MILL CONFIGURATION
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <SettingsIcon className="h-7 w-7 text-sky-500" />
            Mill Profile & System Settings
          </h1>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            Configure factory legal details, GST state jurisdiction, bank payment accounts, and deckle solver targets.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="submit"
            disabled={isSaving}
            className="h-10 px-6 rounded-xl bg-[#161622] hover:bg-[#202030] text-white font-bold text-xs gap-1.5 shadow-sm transition-all"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 stroke-[2.5]" /> Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 2. COMPANY PROFILE & GST CARD */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-sky-500" /> Company Profile & GST Information
          </h2>
          <span className="text-[11px] font-mono text-slate-400">
            Legal Entity Details
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
          <div className="space-y-1 sm:col-span-2">
            <label className="font-bold text-slate-700">Company / Mill Legal Name *</label>
            <Input
              value={form.millName}
              onChange={(e) => setForm({ ...form, millName: e.target.value })}
              className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200"
              required
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="font-bold text-slate-700">Factory / Registered Address *</label>
            <Input
              value={form.millAddress}
              onChange={(e) => setForm({ ...form, millAddress: e.target.value })}
              className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Mill GSTIN *</label>
            <Input
              value={form.millGstin}
              onChange={(e) => setForm({ ...form, millGstin: e.target.value })}
              className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200 font-mono uppercase"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Mill Home State (Intra-state Tax Anchor) *</label>
            <Input
              value={form.millState}
              onChange={(e) => setForm({ ...form, millState: e.target.value })}
              className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200"
              required
            />
          </div>
        </div>
      </div>

      {/* 3. BANKING & PAYMENT CARD */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Landmark className="h-4 w-4 text-emerald-500" /> Banking & Remittance Account
          </h2>
          <span className="text-[11px] font-mono text-slate-400">
            Printed on GST Invoices
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-700">Bank Name</label>
            <Input
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Account Beneficiary Name</label>
            <Input
              value={form.bankAccountName}
              onChange={(e) => setForm({ ...form, bankAccountName: e.target.value })}
              className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Bank Account Number</label>
            <Input
              value={form.bankAccountNumber}
              onChange={(e) => setForm({ ...form, bankAccountNumber: e.target.value })}
              className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200 font-mono"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">IFSC Code</label>
            <Input
              value={form.bankIfsc}
              onChange={(e) => setForm({ ...form, bankIfsc: e.target.value })}
              className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200 font-mono uppercase"
            />
          </div>
        </div>
      </div>

      {/* 4. DECKLE & TAX POLICY CARD */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Percent className="h-4 w-4 text-purple-500" /> Deckle Solver & Tax Rates
          </h2>
          <span className="text-[11px] font-mono text-slate-400">
            Engine Calibration
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
          <div className="space-y-1">
            <label className="font-bold text-slate-700">Default Kraft Paper GST Rate (%)</label>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                value={form.defaultGstRate}
                onChange={(e) => setForm({ ...form, defaultGstRate: Number(e.target.value) || 0 })}
                className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200 font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">%</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-700">Trim Waste Benchmark Target (%)</label>
            <div className="relative">
              <Input
                type="number"
                step="0.1"
                value={form.trimPercentTarget}
                onChange={(e) => setForm({ ...form, trimPercentTarget: Number(e.target.value) || 0 })}
                className="h-10 text-xs rounded-xl bg-slate-50/70 border-slate-200 font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">%</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
