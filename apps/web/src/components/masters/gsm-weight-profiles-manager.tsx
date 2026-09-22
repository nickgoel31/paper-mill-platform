"use client";

import * as React from "react";
import { toast } from "sonner";
import { Scale, Plus, Pencil, Trash2, Loader2, Check, X, Ruler } from "lucide-react";
import {
  getGsmWeightProfiles,
  createGsmWeightProfile,
  updateGsmWeightProfile,
  deleteGsmWeightProfile,
} from "@/server/services/gsm-weight-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GsmWeightRow {
  id: string;
  gsm: number;
  kgPerInch: number;
  reelDiameterInch: number | null;
  notes: string | null;
}

interface GsmWeightProfilesManagerProps {
  initialData: GsmWeightRow[];
  canManage: boolean;
}

const emptyForm = { gsm: "", kgPerInch: "", reelDiameterInch: "", notes: "" };

export function GsmWeightProfilesManager({ initialData, canManage }: GsmWeightProfilesManagerProps) {
  const [rows, setRows] = React.useState(initialData);
  const [form, setForm] = React.useState(emptyForm);
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editForm, setEditForm] = React.useState(emptyForm);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const reload = async () => setRows((await getGsmWeightProfiles()) as GsmWeightRow[]);

  const parsePayload = (f: typeof emptyForm) => ({
    gsm: parseInt(f.gsm, 10),
    kgPerInch: parseFloat(f.kgPerInch),
    reelDiameterInch: f.reelDiameterInch.trim() ? parseFloat(f.reelDiameterInch) : null,
    notes: f.notes || null,
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      await createGsmWeightProfile(parsePayload(form));
      toast.success(`Added weight profile for ${form.gsm} GSM.`);
      setForm(emptyForm);
      await reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to add weight profile");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (row: GsmWeightRow) => {
    setEditingId(row.id);
    setEditForm({
      gsm: String(row.gsm),
      kgPerInch: String(row.kgPerInch),
      reelDiameterInch: row.reelDiameterInch != null ? String(row.reelDiameterInch) : "",
      notes: row.notes || "",
    });
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    try {
      await updateGsmWeightProfile(id, parsePayload(editForm));
      toast.success("Weight profile updated.");
      setEditingId(null);
      await reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to update weight profile");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: GsmWeightRow) => {
    if (!confirm(`Delete the weight profile for ${row.gsm} GSM?`)) return;
    setBusyId(row.id);
    try {
      await deleteGsmWeightProfile(row.id);
      toast.success("Weight profile deleted.");
      await reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete weight profile");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 font-sans pb-16 max-w-3xl">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <Scale className="h-7 w-7 text-sky-500" />
          GSM Weight Chart
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          How many kg a standard finished reel weighs per inch of width, for each GSM your mill
          runs. Different GSMs wind to different lengths on the same machine, so this doesn't
          scale linearly — set it from your own reel weighments. The deckle planner uses it to
          estimate cut weight; reel diameter is shown to operators for reference only.
        </p>
      </div>

      {canManage && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] p-4 flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">GSM *</label>
            <Input
              type="number"
              required
              value={form.gsm}
              onChange={(e) => setForm({ ...form, gsm: e.target.value })}
              placeholder="120"
              className="h-9 w-24 rounded-xl text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">kg / inch *</label>
            <Input
              type="number"
              step="0.01"
              required
              value={form.kgPerInch}
              onChange={(e) => setForm({ ...form, kgPerInch: e.target.value })}
              placeholder="15.5"
              className="h-9 w-28 rounded-xl text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600">Reel Dia. (inch)</label>
            <Input
              type="number"
              step="0.1"
              value={form.reelDiameterInch}
              onChange={(e) => setForm({ ...form, reelDiameterInch: e.target.value })}
              placeholder="Optional"
              className="h-9 w-32 rounded-xl text-sm font-mono"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[140px]">
            <label className="text-[11px] font-bold text-slate-600">Notes</label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional"
              className="h-9 rounded-xl text-sm"
            />
          </div>
          <Button type="submit" disabled={adding} className="h-9 px-4 rounded-xl text-xs font-bold gap-1.5">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </Button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] divide-y divide-slate-100">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No weight profiles yet. Add one per GSM your mill runs above.
          </div>
        ) : (
          rows.map((row) => {
            const isEditing = editingId === row.id;
            const busy = busyId === row.id;
            return (
              <div key={row.id} className="p-4 flex flex-wrap items-center gap-3">
                {isEditing ? (
                  <>
                    <Input
                      type="number"
                      value={editForm.gsm}
                      onChange={(e) => setEditForm({ ...editForm, gsm: e.target.value })}
                      className="h-8 w-20 rounded-lg text-xs font-mono"
                    />
                    <span className="text-[11px] text-slate-400">GSM</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={editForm.kgPerInch}
                      onChange={(e) => setEditForm({ ...editForm, kgPerInch: e.target.value })}
                      className="h-8 w-24 rounded-lg text-xs font-mono"
                    />
                    <span className="text-[11px] text-slate-400">kg/in</span>
                    <Input
                      type="number"
                      step="0.1"
                      value={editForm.reelDiameterInch}
                      onChange={(e) => setEditForm({ ...editForm, reelDiameterInch: e.target.value })}
                      placeholder="Dia."
                      className="h-8 w-24 rounded-lg text-xs font-mono"
                    />
                    <Input
                      value={editForm.notes}
                      onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                      placeholder="Notes"
                      className="h-8 flex-1 min-w-[100px] rounded-lg text-xs"
                    />
                    <div className="flex gap-1 ml-auto">
                      <Button size="sm" disabled={busy} onClick={() => saveEdit(row.id)} className="h-8 px-3 text-xs rounded-lg gap-1">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)} className="h-8 px-2 text-xs rounded-lg">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="font-mono font-black text-sm text-slate-900 w-16">{row.gsm} <span className="text-[10px] font-sans text-slate-400">GSM</span></span>
                    <span className="font-mono font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-lg text-xs">
                      {row.kgPerInch.toFixed(2)} kg/inch
                    </span>
                    {row.reelDiameterInch != null && (
                      <span className="font-mono text-xs text-slate-500 flex items-center gap-1">
                        <Ruler className="h-3 w-3" /> {row.reelDiameterInch.toFixed(1)}&quot; dia
                      </span>
                    )}
                    {row.notes && <span className="text-[11px] text-slate-400 truncate">{row.notes}</span>}
                    {canManage && (
                      <div className="ml-auto flex items-center gap-1">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => startEdit(row)} className="h-8 px-2 rounded-lg">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => handleDelete(row)}
                          className="h-8 px-2 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
