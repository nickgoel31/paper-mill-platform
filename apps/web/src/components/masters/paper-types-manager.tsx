"use client";

import * as React from "react";
import { toast } from "sonner";
import { Layers, Plus, Pencil, Trash2, Loader2, Check, X } from "lucide-react";
import {
  getPaperTypeOptions,
  createPaperTypeOption,
  updatePaperTypeOption,
  deletePaperTypeOption,
} from "@/server/services/paper-type-service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PaperTypeRow {
  id: string;
  name: string;
  label: string | null;
}

interface PaperTypesManagerProps {
  initialData: PaperTypeRow[];
  canManage: boolean;
}

export function PaperTypesManager({ initialData, canManage }: PaperTypesManagerProps) {
  const [rows, setRows] = React.useState(initialData);
  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editLabel, setEditLabel] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const reload = async () => setRows((await getPaperTypeOptions()) as PaperTypeRow[]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await createPaperTypeOption(name, label);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Added paper type "${name.trim().toUpperCase()}".`);
      setName("");
      setLabel("");
      await reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to add paper type");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (row: PaperTypeRow) => {
    setEditingId(row.id);
    setEditName(row.name);
    setEditLabel(row.label || "");
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    try {
      const res = await updatePaperTypeOption(id, editName, editLabel);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Paper type updated — existing orders/stock at that value were kept in sync.");
      setEditingId(null);
      await reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to update paper type");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (row: PaperTypeRow) => {
    if (!confirm(`Delete the paper type "${row.name}"?`)) return;
    setBusyId(row.id);
    try {
      const res = await deletePaperTypeOption(row.id);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Paper type deleted.");
      await reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete paper type");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 font-sans pb-16 max-w-2xl">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
          <Layers className="h-7 w-7 text-sky-500" />
          Paper Types
        </h1>
        <p className="text-xs text-slate-500 font-medium">
          The paper type values offered on Sales Order lines and Inventory Stock. Renaming one here
          updates every existing order/stock row using it; deleting one is blocked while anything
          still references it.
        </p>
      </div>

      {canManage && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.03)] p-4 flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1 flex-1 min-w-[160px]">
            <label className="text-[11px] font-bold text-slate-600">Value (stored) *</label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. RECYCLED"
              className="h-9 rounded-xl text-sm font-mono uppercase"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[160px]">
            <label className="text-[11px] font-bold text-slate-600">Display Label (optional)</label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Recycled"
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
            No paper types yet. Add the grades your mill produces above (e.g. NATURAL, BY).
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
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8 flex-1 min-w-[120px] rounded-lg text-xs font-mono uppercase"
                    />
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Display label"
                      className="h-8 flex-1 min-w-[120px] rounded-lg text-xs"
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
                    <span className="font-mono font-bold text-sm text-slate-900">{row.name}</span>
                    {row.label && row.label !== row.name && (
                      <span className="text-xs text-slate-400">({row.label})</span>
                    )}
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
