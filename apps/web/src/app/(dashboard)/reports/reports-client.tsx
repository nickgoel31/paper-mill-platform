"use client";

import * as React from "react";
import { Download, FileBarChart, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { downloadCsv, objectsToCsv } from "@/lib/csv";
import { getReportData } from "@/server/services/report-service";
import { REPORT_DEFINITIONS, ReportResult, ReportType } from "@/server/services/report-types";

interface Props {
  initialType: ReportType;
  initialData: ReportResult;
}

export function ReportsClient({ initialType, initialData }: Props) {
  const [reportType, setReportType] = React.useState<ReportType>(initialType);
  const [data, setData] = React.useState<ReportResult>(initialData);
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const definition = REPORT_DEFINITIONS.find((d) => d.type === reportType)!;

  const loadReport = React.useCallback(async (type: ReportType, from: string, to: string) => {
    setIsLoading(true);
    try {
      const result = await getReportData(type, {
        startDate: from || undefined,
        endDate: to || undefined,
      });
      setData(result);
    } catch (err: any) {
      toast.error(err.message || "Failed to load report");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleTypeChange = (value: string) => {
    const type = value as ReportType;
    setReportType(type);
    loadReport(type, dateFrom, dateTo);
  };

  const handleApplyRange = () => {
    loadReport(reportType, dateFrom, dateTo);
  };

  const handleExport = () => {
    const csv = objectsToCsv(data.rows, data.columns);
    const rangeLabel = dateFrom || dateTo ? `${dateFrom || "start"}_to_${dateTo || "today"}` : "all";
    downloadCsv(`${reportType}-report-${rangeLabel}.csv`, csv);
    toast.success("Report downloaded.");
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Report picker */}
        <div className="space-y-2">
          {REPORT_DEFINITIONS.map((def) => (
            <button
              key={def.type}
              onClick={() => handleTypeChange(def.type)}
              className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                reportType === def.type
                  ? "bg-[#161622] text-white border-[#161622]"
                  : "bg-white border-slate-100 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 font-semibold text-sm">
                <FileBarChart className="h-4 w-4 shrink-0" />
                {def.title}
              </div>
              <p
                className={`text-xs mt-1 ${
                  reportType === def.type ? "text-slate-300" : "text-slate-400"
                }`}
              >
                {def.description}
              </p>
            </button>
          ))}
        </div>

        {/* Report view */}
        <Card className="rounded-[26px] border-slate-100 shadow-sm">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold">{definition.title}</CardTitle>
              <CardDescription>{definition.description}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {definition.dated && (
                <>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 text-xs w-[150px]"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 text-xs w-[150px]"
                  />
                  <Button size="sm" disabled={isLoading} onClick={handleApplyRange} className="h-9 text-xs font-bold">
                    {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={isLoading || data.rows.length === 0}
                onClick={handleExport}
                className="h-9 text-xs font-bold gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    {data.columns.map((c) => (
                      <TableHead key={c.key}>{c.header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row, i) => (
                    <TableRow key={i}>
                      {data.columns.map((c) => (
                        <TableCell key={c.key} className="text-xs">
                          {String(row[c.key] ?? "")}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {data.rows.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={data.columns.length} className="text-center text-xs text-slate-400 py-8">
                        No data for this report in the selected range.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
