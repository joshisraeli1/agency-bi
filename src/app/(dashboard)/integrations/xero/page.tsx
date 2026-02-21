"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Loader2,
  File,
} from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";

interface UploadResult {
  success: boolean;
  imported: number;
  clientsCreated: number;
  clientsMatched: number;
  errors: string[];
}

interface UploadCardState {
  file: File | null;
  preview: Record<string, string>[];
  headers: string[];
  uploading: boolean;
  result: UploadResult | null;
  parseError: string | null;
}

const initialCardState: UploadCardState = {
  file: null,
  preview: [],
  headers: [],
  uploading: false,
  result: null,
  parseError: null,
};

export default function XeroIntegrationPage() {
  const [invoiceState, setInvoiceState] =
    useState<UploadCardState>(initialCardState);
  const [expenseState, setExpenseState] =
    useState<UploadCardState>(initialCardState);
  const [dataCounts, setDataCounts] = useState<{
    invoices: number;
    expenses: number;
    total: number;
  } | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);

  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const expenseInputRef = useRef<HTMLInputElement>(null);

  // Load existing data counts on mount
  useEffect(() => {
    async function loadCounts() {
      try {
        const res = await fetch("/api/integrations/xero/counts");
        if (res.ok) {
          const data = await res.json();
          setDataCounts(data);
        }
      } catch {
        // Counts unavailable
      } finally {
        setCountsLoading(false);
      }
    }
    loadCounts();
  }, []);

  const handleFileSelect = useCallback(
    (
      type: "invoices" | "expenses",
      setter: React.Dispatch<React.SetStateAction<UploadCardState>>
    ) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setter((prev) => ({
          ...prev,
          file,
          result: null,
          parseError: null,
          preview: [],
          headers: [],
        }));

        Papa.parse(file, {
          header: true,
          preview: 5,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0) {
              setter((prev) => ({
                ...prev,
                parseError: `CSV parse error: ${results.errors[0].message}`,
              }));
              return;
            }

            const headers = results.meta.fields || [];
            const rows = results.data as Record<string, string>[];

            setter((prev) => ({
              ...prev,
              headers,
              preview: rows,
              parseError: null,
            }));
          },
          error: (error) => {
            setter((prev) => ({
              ...prev,
              parseError: `Failed to parse CSV: ${error.message}`,
            }));
          },
        });
      },
    []
  );

  const handleUpload = useCallback(
    async (
      type: "invoices" | "expenses",
      state: UploadCardState,
      setter: React.Dispatch<React.SetStateAction<UploadCardState>>
    ) => {
      if (!state.file) return;

      setter((prev) => ({ ...prev, uploading: true, result: null }));

      try {
        const formData = new FormData();
        formData.append("file", state.file);
        formData.append("type", type);

        const res = await fetch("/api/integrations/xero/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (res.ok) {
          setter((prev) => ({
            ...prev,
            uploading: false,
            result: {
              success: true,
              imported: data.imported ?? 0,
              clientsCreated: data.clients?.created ?? 0,
              clientsMatched: data.clients?.matched ?? 0,
              errors: data.errors ?? [],
            },
          }));

          // Refresh counts after successful upload
          try {
            const countsRes = await fetch("/api/integrations/xero/counts");
            if (countsRes.ok) {
              const countsData = await countsRes.json();
              setDataCounts(countsData);
            }
          } catch {
            // Counts refresh failed silently
          }
        } else {
          setter((prev) => ({
            ...prev,
            uploading: false,
            result: {
              success: false,
              imported: 0,
              clientsCreated: 0,
              clientsMatched: 0,
              errors: [data.error || "Upload failed"],
            },
          }));
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Upload request failed";
        setter((prev) => ({
          ...prev,
          uploading: false,
          result: {
            success: false,
            imported: 0,
            clientsCreated: 0,
            clientsMatched: 0,
            errors: [msg],
          },
        }));
      }
    },
    []
  );

  function resetCard(
    setter: React.Dispatch<React.SetStateAction<UploadCardState>>,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) {
    setter(initialCardState);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function renderUploadCard(
    type: "invoices" | "expenses",
    title: string,
    description: string,
    state: UploadCardState,
    setter: React.Dispatch<React.SetStateAction<UploadCardState>>,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) {
    return (
      <Card className="flex-1">
        <CardHeader>
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File input */}
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelect(type, setter)}
          />

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={state.uploading}
            >
              <File className="mr-2 h-4 w-4" />
              Choose CSV File
            </Button>
            {state.file && (
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                {state.file.name}
              </span>
            )}
          </div>

          {/* Parse error */}
          {state.parseError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{state.parseError}</AlertDescription>
            </Alert>
          )}

          {/* CSV Preview */}
          {state.preview.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Preview (first {state.preview.length} rows)
              </p>
              <div className="rounded-md border overflow-auto max-h-52">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {state.headers.map((header) => (
                        <TableHead
                          key={header}
                          className="text-xs py-1 px-2 whitespace-nowrap"
                        >
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.preview.map((row, idx) => (
                      <TableRow key={idx}>
                        {state.headers.map((header) => (
                          <TableCell
                            key={header}
                            className="text-xs py-1 px-2 whitespace-nowrap"
                          >
                            {row[header] || "-"}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Upload button */}
          {state.file && !state.parseError && (
            <Button
              onClick={() => handleUpload(type, state, setter)}
              disabled={state.uploading || state.preview.length === 0}
              className="w-full"
            >
              {state.uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload &amp; Import
                </>
              )}
            </Button>
          )}

          {/* Upload results */}
          {state.result && (
            <div className="space-y-2">
              {state.result.success ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium text-green-600">
                        Import complete
                      </p>
                      <ul className="text-sm space-y-0.5">
                        <li>
                          {state.result.imported} record
                          {state.result.imported !== 1 ? "s" : ""} imported
                        </li>
                        <li>
                          {state.result.clientsMatched} client
                          {state.result.clientsMatched !== 1 ? "s" : ""} matched,{" "}
                          {state.result.clientsCreated} created
                        </li>
                      </ul>
                      {state.result.errors.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-amber-600">
                            {state.result.errors.length} warning
                            {state.result.errors.length !== 1 ? "s" : ""}:
                          </p>
                          <ul className="text-xs text-amber-600 list-disc list-inside">
                            {state.result.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-medium">Import failed</p>
                      <ul className="text-sm list-disc list-inside">
                        {state.result.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => resetCard(setter, inputRef)}
                className="w-full"
              >
                Upload Another File
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/integrations">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Xero Import</h1>
          <p className="text-muted-foreground mt-1">
            Upload CSV exports from Xero to import invoices and expenses.
          </p>
        </div>
      </div>

      {/* Section 1: CSV Upload */}
      <div>
        <h2 className="text-xl font-semibold mb-4">CSV Upload</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderUploadCard(
            "invoices",
            "Upload Invoices",
            "Import accounts receivable invoices from a Xero CSV export",
            invoiceState,
            setInvoiceState,
            invoiceInputRef
          )}
          {renderUploadCard(
            "expenses",
            "Upload Expenses",
            "Import expense transactions from a Xero CSV export",
            expenseState,
            setExpenseState,
            expenseInputRef
          )}
        </div>
      </div>

      <Separator />

      {/* Section 2: Data Preview */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Imported Data</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invoices</CardTitle>
              <CardDescription>
                Xero-sourced invoice records in the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {countsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {dataCounts?.invoices ?? 0}
                  </span>
                  <Badge variant="secondary">Xero</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Expenses</CardTitle>
              <CardDescription>
                Xero-sourced expense records in the database
              </CardDescription>
            </CardHeader>
            <CardContent>
              {countsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {dataCounts?.expenses ?? 0}
                  </span>
                  <Badge variant="secondary">Xero</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Total Records</CardTitle>
              <CardDescription>
                All financial records imported from Xero
              </CardDescription>
            </CardHeader>
            <CardContent>
              {countsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {dataCounts?.total ?? 0}
                  </span>
                  <Link href="/financials?source=xero">
                    <Button variant="outline" size="sm">
                      View All
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
