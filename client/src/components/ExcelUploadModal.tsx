import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Upload,
  UploadCloud,
  FileSpreadsheet,
  Loader2,
  Eye,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Download,
  FileDown,
  X,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const aylar = [
  { value: "ocak", label: "Ocak" },
  { value: "subat", label: "Şubat" },
  { value: "mart", label: "Mart" },
  { value: "nisan", label: "Nisan" },
  { value: "mayis", label: "Mayıs" },
  { value: "haziran", label: "Haziran" },
  { value: "temmuz", label: "Temmuz" },
  { value: "agustos", label: "Ağustos" },
  { value: "eylul", label: "Eylül" },
  { value: "ekim", label: "Ekim" },
  { value: "kasim", label: "Kasım" },
  { value: "aralik", label: "Aralık" },
];

const currentYear = new Date().getFullYear();
const yillar = Array.from({ length: 5 }, (_, i) => currentYear - i);

const EXPECTED_HEADERS = [
  "FİRMA ÜNVAN",
  "FATURA NO",
  "FATURA TARİHİ",
  "DOSYA NO",
  "REJİM",
  "GÜMRÜK",
  "TESCİL TARİHİ",
  "TESCİL NO",
  "FATURAYI KESEN",
  "DOVİZ",
  "KUR",
  "MAL BEDELİ",
  "TOP KDV TUTAR",
  "TOP FATURA TUTAR",
  "TİP",
  "GİRİŞ ELEMANI",
];

type TipKey =
  | "İthalat"
  | "İhracat"
  | "Transit"
  | "Serbest B. Giriş"
  | "Serbest B. Çıkış"
  | "Diğer";

const TIP_ORDER: TipKey[] = [
  "İthalat",
  "İhracat",
  "Transit",
  "Serbest B. Giriş",
  "Serbest B. Çıkış",
  "Diğer",
];

function mapTip(raw: unknown): TipKey {
  if (raw === null || raw === undefined) return "Diğer";
  const v = String(raw).trim().toUpperCase();
  if (v === "") return "Diğer";
  if (v === "T" || v === "İTHALAT" || v === "ITHALAT") return "İthalat";
  if (v === "H" || v === "İHRACAT" || v === "IHRACAT") return "İhracat";
  if (v === "@" || v === "TRANSİT" || v === "TRANSIT") return "Transit";
  if (v === "A") return "Serbest B. Giriş";
  if (v === "B") return "Serbest B. Çıkış";
  return "Diğer";
}

function isDateParseable(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") {
    // XLSX.SSF is not in @types/xlsx for some versions; fall back to any.
    const ssf = (XLSX as any).SSF;
    if (ssf && typeof ssf.parse_date_code === "function") {
      const parsed = ssf.parse_date_code(value);
      if (
        parsed &&
        typeof parsed.y === "number" &&
        typeof parsed.m === "number" &&
        typeof parsed.d === "number" &&
        parsed.y > 0
      ) {
        return true;
      }
    }
    return false;
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (/^(\d{4})-(\d{1,2})-(\d{1,2})/.test(s)) return true;
    if (/^(\d{1,2})[./](\d{1,2})[./](\d{4})/.test(s)) return true;
    return false;
  }
  return false;
}

interface PreviewData {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  datelessRows: number;
  missingHeaders: string[];
  allHeaders: string[];
  tipCounts: Record<TipKey, number>;
  sampleRows: Array<{
    firma: string;
    faturaNo: string;
    malBedeli: unknown;
    kdv: unknown;
  }>;
}

function suggestHeader(target: string, candidates: string[]): string | null {
  if (!candidates.length) return null;
  const norm = (s: string) =>
    s.toLocaleLowerCase("tr-TR")
     .replace(/[\s_\-./]+/g, "")
     .replace(/[ıİiI]/g, "i");
  const t = norm(target);
  // Exact normalized match wins.
  for (const c of candidates) if (norm(c) === t) return c;
  // Otherwise prefer a candidate that contains the target's normalized form, or vice versa.
  for (const c of candidates) {
    const n = norm(c);
    if (n.includes(t) || t.includes(n)) return c;
  }
  return null;
}

async function parseExcelPreview(file: File): Promise<PreviewData> {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Çalışma sayfası bulunamadı");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Array<
    Record<string, unknown>
  >;
  const headerMatrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  }) as unknown[][];
  const headers = (headerMatrix[0] ?? []).map((h) =>
    h === null || h === undefined ? "" : String(h)
  );

  const missingHeaders = EXPECTED_HEADERS.filter(
    (h) => !headers.includes(h)
  );

  const allHeaders = Array.from(
    new Set(headers.filter((h) => h && h.trim().length > 0))
  );

  const tipCounts: Record<TipKey, number> = {
    "İthalat": 0,
    "İhracat": 0,
    "Transit": 0,
    "Serbest B. Giriş": 0,
    "Serbest B. Çıkış": 0,
    "Diğer": 0,
  };

  let validRows = 0;
  let skippedRows = 0;
  let datelessRows = 0;
  const sampleRows: PreviewData["sampleRows"] = [];

  for (const r of rows) {
    const firma = r["FİRMA ÜNVAN"];
    const faturaNo = r["FATURA NO"];
    const hasFirma =
      firma !== null && firma !== undefined && String(firma).trim() !== "";
    const hasFaturaNo =
      faturaNo !== null &&
      faturaNo !== undefined &&
      String(faturaNo).trim() !== "";

    if (!hasFirma && !hasFaturaNo) {
      skippedRows += 1;
      continue;
    }

    validRows += 1;
    tipCounts[mapTip(r["TİP"])] += 1;

    if (!isDateParseable(r["FATURA TARİHİ"])) {
      datelessRows += 1;
    }

    if (sampleRows.length < 5) {
      sampleRows.push({
        firma: hasFirma ? String(firma) : "",
        faturaNo: hasFaturaNo ? String(faturaNo) : "",
        malBedeli: r["MAL BEDELİ"],
        kdv: r["TOP KDV TUTAR"],
      });
    }
  }

  return {
    totalRows: rows.length,
    validRows,
    skippedRows,
    datelessRows,
    missingHeaders,
    allHeaders,
    tipCounts,
    sampleRows,
  };
}

function formatNumberCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress: (pct: number) => void
): Promise<{ status: number; ok: boolean; body: any }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      let body: any = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = xhr.responseText;
      }
      resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, body });
    };
    xhr.onerror = () => reject(new Error("Ağ hatası"));
    xhr.onabort = () => reject(new Error("İptal edildi"));
    xhr.send(formData);
  });
}

// Format an arbitrary date value to dd/mm/yyyy without using Date parsing where possible.
function formatExistingDate(ud: string | Date | null | undefined): string {
  if (!ud) return "—";
  // If it looks like YYYY-MM-DD already, format directly without timezone math.
  if (typeof ud === "string") {
    const m = ud.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      return `${m[3].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[1]}`;
    }
  }
  const d = new Date(ud as any);
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

export interface ExcelUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  uploadUrl?: string;
  title?: string;
  description?: string;
  hideDateSelectors?: boolean;
}

type MultiFileEntry =
  | {
      kind: "ok";
      filename: string;
      eklenen: number;
      atlanan: number;
      tarihsiz: number;
      skippedCount: number;
      skippedRows: any[];
    }
  | {
      kind: "duplicate";
      filename: string;
      existing: {
        filename: string;
        uploadDate: string | Date | null;
        recordCount: number | null;
      };
    }
  | { kind: "error"; filename: string; error: string };

type MultiPreviewData = {
  fileCount: number;
  totalRows: number;
  validRows: number;
  skippedRows: number;
  datelessRows: number;
  missingHeaders: string[];
  allHeaders: string[];
  tipCounts: Record<TipKey, number>;
  perFile: Array<{
    filename: string;
    totalRows: number;
    validRows: number;
  }>;
};


export function ExcelUploadModal({
  open,
  onOpenChange,
  onSuccess,
  uploadUrl = "/api/gumruk/yukle",
  title = "Excel Yükle",
  description = "Gümrük verilerini içeren Excel dosyasını yükleyin",
  hideDateSelectors = false
}: ExcelUploadModalProps) {
  const [step, setStep] = useState<"select" | "preview" | "result">("select");
  const [selectedAy, setSelectedAy] = useState<string>("");
  const [selectedYil, setSelectedYil] = useState<string>(String(currentYear));
  const [isBulk, setIsBulk] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [multiPreview, setMultiPreview] = useState<MultiPreviewData | null>(null);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [multiResults, setMultiResults] = useState<MultiFileEntry[] | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Auto-suggest header mapping when preview loads.
  useEffect(() => {
    const missing = preview?.missingHeaders ?? multiPreview?.missingHeaders ?? [];
    const all = preview?.allHeaders ?? multiPreview?.allHeaders ?? [];
    if (!missing.length || !all.length) return;
    setHeaderMapping((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const m of missing) {
        if (next[m]) continue;
        const guess = suggestHeader(m, all);
        if (guess) {
          next[m] = guess;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [preview, multiPreview]);

  const isValidExcelName = (name: string): boolean => {
    const lower = name.toLowerCase();
    return lower.endsWith(".xlsx") || lower.endsWith(".xls");
  };

  const acceptFiles = (incoming: FileList | File[] | null | undefined) => {
    if (!incoming) return;
    const arr = Array.from(incoming as ArrayLike<File>);
    if (arr.length === 0) return;
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of arr) {
      if (isValidExcelName(f.name)) {
        accepted.push(f);
      } else {
        rejected.push(f.name);
      }
    }
    if (rejected.length > 0) {
      toast({
        title: "Hata",
        description: `Geçersiz dosya: ${rejected.join(", ")} (.xlsx veya .xls olmalı)`,
        variant: "destructive",
      });
    }
    if (accepted.length === 0) return;
    setFiles((prev) => {
      // dedupe by name + size + lastModified
      const key = (f: File) => `${f.name}__${f.size}__${f.lastModified}`;
      const seen = new Set(prev.map(key));
      const merged = [...prev];
      for (const f of accepted) {
        if (!seen.has(key(f))) {
          merged.push(f);
          seen.add(key(f));
        }
      }
      return merged;
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFiles(e.target.files);
    // allow re-selecting the same file after removal
    if (e.target) e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    acceptFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleDropZoneKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFilePicker();
    }
  };

  const removeFileAt = (index: number, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleIncele = async () => {
    const needsDates = !hideDateSelectors && !isBulk;
    if ((needsDates && (!selectedAy || !selectedYil)) || files.length === 0) {
      toast({
        title: "Hata",
        description: "Lütfen tüm alanları doldurun ve dosya seçin",
        variant: "destructive",
      });
      return;
    }

    setIsParsing(true);
    try {
      if (files.length === 1) {
        const result = await parseExcelPreview(files[0]);
        setPreview(result);
        setMultiPreview(null);
        setStep("preview");
      } else {
        const results = await Promise.all(files.map((f) => parseExcelPreview(f)));
        const totalRows = results.reduce((s, r) => s + r.totalRows, 0);
        const validRows = results.reduce((s, r) => s + r.validRows, 0);
        const skippedRows = results.reduce((s, r) => s + r.skippedRows, 0);
        const datelessRows = results.reduce((s, r) => s + r.datelessRows, 0);
        const missingSet = new Set<string>();
        for (const r of results) for (const h of r.missingHeaders) missingSet.add(h);
        const allHeadersSet = new Set<string>();
        for (const r of results) for (const h of r.allHeaders) allHeadersSet.add(h);
        const tipCounts: Record<TipKey, number> = {
          "İthalat": 0,
          "İhracat": 0,
          "Transit": 0,
          "Serbest B. Giriş": 0,
          "Serbest B. Çıkış": 0,
          "Diğer": 0,
        };
        for (const r of results) {
          for (const k of TIP_ORDER) tipCounts[k] += r.tipCounts[k];
        }
        const perFile = results.map((r, idx) => ({
          filename: files[idx].name,
          totalRows: r.totalRows,
          validRows: r.validRows,
        }));
        setMultiPreview({
          fileCount: files.length,
          totalRows,
          validRows,
          skippedRows,
          datelessRows,
          missingHeaders: Array.from(missingSet),
          allHeaders: Array.from(allHeadersSet),
          tipCounts,
          perFile,
        });
        setPreview(null);
        setStep("preview");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bilinmeyen hata";
      toast({
        title: "Hata",
        description: `Dosya okunamadı: ${message}`,
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const buildFormDataFor = (file: File, force: boolean): FormData => {
    const formData = new FormData();
    formData.append("excel", file);
    if (!hideDateSelectors && !isBulk) {
      formData.append("ay", selectedAy);
      formData.append("yil", selectedYil);
    } else if (!hideDateSelectors && isBulk) {
      formData.append("bulk", "true");
    }
    if (force) {
      formData.append("force", "true");
    }
    if (Object.keys(headerMapping).length > 0) {
      formData.append("headerMapping", JSON.stringify(headerMapping));
    }
    return formData;
  };

  const handleUpload = async (force: boolean = false) => {
    if (files.length === 0) return;
    const file = files[0];

    setUploadProgress(0);
    setIsUploading(true);

    const formData = buildFormDataFor(file, force);

    try {
      const { status, ok, body: result } = await uploadWithProgress(
        uploadUrl,
        formData,
        setUploadProgress
      );

      // 409 — Mükerrer dosya tespit edildi, kullanıcıya sor
      if (status === 409 && result?.duplicate) {
        const dateStr = formatExistingDate(result.existing?.uploadDate);
        const fname = result.existing?.filename ?? "";
        const recCount = result.existing?.recordCount ?? 0;
        const confirmed = window.confirm(
          `Bu dosya daha önce ${dateStr} tarihinde "${fname}" adıyla yüklenmiş (${recCount} kayıt).\nYine de yüklemek istiyor musunuz?`
        );
        if (confirmed) {
          setIsUploading(false);
          setUploadProgress(0);
          await handleUpload(true);
          return;
        } else {
          // Kullanıcı vazgeçti; preview adımında bırak
          setIsUploading(false);
          setUploadProgress(0);
          return;
        }
      }

      if (ok) {
        const description = result.atlanan > 0
          ? `${result.eklenen} yeni kayıt eklendi, ${result.atlanan} mevcut kayıt atlandı`
          : `${result.eklenen} kayıt başarıyla eklendi`;
        toast({
          title: "Başarılı",
          description,
        });
        onSuccess();
        setUploadResult(result);
        setStep("result");
      } else {
        toast({
          title: "Hata",
          description: result?.error || "Yükleme sırasında bir hata oluştu",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Hata",
        description: "Sunucu ile bağlantı kurulamadı",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleMultiFileUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setCurrentUploadIndex(0);

    const results: MultiFileEntry[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentUploadIndex(i);
      setUploadProgress(0);

      try {
        const formData = buildFormDataFor(file, false);
        const { status, ok, body } = await uploadWithProgress(
          uploadUrl,
          formData,
          setUploadProgress
        );

        if (status === 409 && body?.duplicate) {
          results.push({
            kind: "duplicate",
            filename: file.name,
            existing: {
              filename: body.existing?.filename ?? "",
              uploadDate: body.existing?.uploadDate ?? null,
              recordCount: body.existing?.recordCount ?? null,
            },
          });
          continue;
        }

        if (ok) {
          results.push({
            kind: "ok",
            filename: file.name,
            eklenen: typeof body?.eklenen === "number" ? body.eklenen : 0,
            atlanan: typeof body?.atlanan === "number" ? body.atlanan : 0,
            tarihsiz: typeof body?.tarihsiz === "number" ? body.tarihsiz : 0,
            skippedCount:
              typeof body?.skippedCount === "number" ? body.skippedCount : 0,
            skippedRows: Array.isArray(body?.skippedRows) ? body.skippedRows : [],
          });
        } else {
          results.push({
            kind: "error",
            filename: file.name,
            error: body?.error || "Bilinmeyen hata",
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
        results.push({
          kind: "error",
          filename: file.name,
          error: `Sunucu ile bağlantı kurulamadı: ${msg}`,
        });
      }
    }

    setMultiResults(results);
    setIsUploading(false);
    setUploadProgress(0);
    setCurrentUploadIndex(null);
    onSuccess();
    setStep("result");
  };

  const handleConfirmUpload = () => {
    if (files.length <= 1) {
      handleUpload(false);
    } else {
      handleMultiFileUpload();
    }
  };

  const handleDownloadTemplate = () => {
    try {
      const ws = XLSX.utils.aoa_to_sheet([EXPECTED_HEADERS]);
      ws["!cols"] = EXPECTED_HEADERS.map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Gümrük");
      XLSX.writeFile(wb, "gumruk-sablon.xlsx");
    } catch (e) {
      toast({
        title: "Hata",
        description: "Şablon oluşturulamadı",
        variant: "destructive",
      });
    }
  };

  const handleDownloadSkipped = () => {
    const skipped = uploadResult?.skippedRows ?? [];
    if (!skipped.length) return;
    const flat = skipped.map((s: any) => ({
      Sebep: s.reason,
      Ay: s.ay ?? "",
      Yıl: s.yil ?? "",
      ...(s.row ?? {}),
    }));
    const ws = XLSX.utils.json_to_sheet(flat);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atlananlar");
    XLSX.writeFile(wb, `atlanan-satirlar-${Date.now()}.xlsx`);
  };

  const handleDownloadMultiSkipped = () => {
    if (!multiResults) return;
    const wb = XLSX.utils.book_new();
    const usedNames = new Set<string>();
    let any = false;
    for (const r of multiResults) {
      if (r.kind !== "ok") continue;
      if (!r.skippedRows || r.skippedRows.length === 0) continue;
      const flat = r.skippedRows.map((s: any) => ({
        Dosya: r.filename,
        Sebep: s.reason,
        Ay: s.ay ?? "",
        Yıl: s.yil ?? "",
        ...(s.row ?? {}),
      }));
      // Excel sheet names are limited to 31 chars and have invalid chars
      let base = r.filename.replace(/\.(xlsx|xls)$/i, "");
      base = base.replace(/[\\/?*\[\]:]/g, "_").slice(0, 28);
      let name = base || "Dosya";
      let suffix = 2;
      while (usedNames.has(name)) {
        const candidate = `${base}_${suffix}`.slice(0, 31);
        name = candidate;
        suffix += 1;
      }
      usedNames.add(name);
      const ws = XLSX.utils.json_to_sheet(flat);
      XLSX.utils.book_append_sheet(wb, ws, name);
      any = true;
    }
    if (!any) return;
    XLSX.writeFile(wb, `atlanan-satirlar-toplu-${Date.now()}.xlsx`);
  };

  const resetForm = () => {
    setSelectedAy("");
    setSelectedYil(String(currentYear));
    setFiles([]);
    setIsBulk(false);
    setPreview(null);
    setMultiPreview(null);
    setUploadResult(null);
    setMultiResults(null);
    setCurrentUploadIndex(null);
    setUploadProgress(0);
    setHeaderMapping({});
    setStep("select");
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const inceleDisabled =
    ((!hideDateSelectors && !isBulk) && (!selectedAy || !selectedYil)) ||
    files.length === 0 ||
    isParsing;

  // Aggregated stats for the multi-file result step
  const multiStats = (() => {
    if (!multiResults) {
      return {
        total: 0,
        ok: 0,
        duplicate: 0,
        error: 0,
        eklenen: 0,
        atlanan: 0,
        hasAnySkipped: false,
      };
    }
    let ok = 0;
    let duplicate = 0;
    let error = 0;
    let eklenen = 0;
    let atlanan = 0;
    let hasAnySkipped = false;
    for (const r of multiResults) {
      if (r.kind === "ok") {
        ok += 1;
        eklenen += r.eklenen;
        atlanan += r.atlanan;
        if (r.skippedCount > 0 && r.skippedRows.length > 0) hasAnySkipped = true;
      } else if (r.kind === "duplicate") {
        duplicate += 1;
      } else {
        error += 1;
      }
    }
    return {
      total: multiResults.length,
      ok,
      duplicate,
      error,
      eklenen,
      atlanan,
      hasAnySkipped,
    };
  })();

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? description
              : step === "preview"
              ? "Yükleme öncesi dosya önizlemesi"
              : "Yükleme sonucu"}
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <>
            <div className="space-y-4 py-4">
              {uploadUrl === "/api/gumruk/yukle" && (
                <div className="flex items-center justify-between gap-2 pb-1">
                  <div className="text-xs text-muted-foreground">
                    Doğru kolon başlıklarını içeren boş şablonu indirip doldurabilirsiniz.
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadTemplate}
                  >
                    <FileDown className="w-4 h-4 mr-2" />
                    Şablon İndir
                  </Button>
                </div>
              )}
              {!hideDateSelectors && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="bulk-mode"
                      checked={isBulk}
                      onCheckedChange={(checked) => setIsBulk(checked as boolean)}
                    />
                    <Label htmlFor="bulk-mode" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Dosya tüm yılı içeriyor (Otomatik Tarih)
                    </Label>
                  </div>

                  {!isBulk && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="ay">Ay</Label>
                        <Select value={selectedAy} onValueChange={setSelectedAy}>
                          <SelectTrigger id="ay" data-testid="select-ay">
                            <SelectValue placeholder="Ay seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {aylar.map((ay) => (
                              <SelectItem key={ay.value} value={ay.value}>
                                {ay.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="yil">Yıl</Label>
                        <Select value={selectedYil} onValueChange={setSelectedYil}>
                          <SelectTrigger id="yil" data-testid="select-yil">
                            <SelectValue placeholder="Yıl seçin" />
                          </SelectTrigger>
                          <SelectContent>
                            {yillar.map((yil) => (
                              <SelectItem key={yil} value={String(yil)}>
                                {yil}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="excel">Excel Dosyası</Label>
                <input
                  ref={fileInputRef}
                  id="excel"
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-excel"
                />
                {files.length === 0 && (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={openFilePicker}
                    onKeyDown={handleDropZoneKeyDown}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={handleDragLeave}
                    aria-label="Excel dosyasını seçmek veya sürüklemek için tıklayın"
                    data-testid="dropzone-excel"
                    className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-4 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                      isDragOver
                        ? "border-primary bg-muted/50"
                        : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30"
                    }`}
                  >
                    <UploadCloud className="w-8 h-8 text-muted-foreground" />
                    <div className="text-sm font-medium">
                      Excel dosyasını buraya sürükleyin
                    </div>
                    <div className="text-xs text-muted-foreground">
                      veya seçmek için tıklayın (.xlsx, .xls)
                    </div>
                  </div>
                )}

                {files.length === 1 && (
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileSpreadsheet className="w-8 h-8 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate" title={files[0].name}>
                          {files[0].name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(files[0].size)}
                        </div>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => removeFileAt(0, e)}
                      data-testid="button-remove-file"
                      className="shrink-0"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Kaldır
                    </Button>
                  </div>
                )}

                {files.length >= 2 && (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`rounded-md border ${
                      isDragOver ? "border-primary bg-muted/40" : "bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b text-xs text-muted-foreground">
                      <span>{files.length} dosya seçildi</span>
                    </div>
                    <ul className="divide-y">
                      {files.map((f, idx) => (
                        <li
                          key={`${f.name}-${f.size}-${f.lastModified}-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileSpreadsheet className="w-4 h-4 text-primary shrink-0" />
                            <div className="min-w-0">
                              <div
                                className="text-sm font-medium truncate"
                                title={f.name}
                              >
                                {truncate(f.name, 60)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatFileSize(f.size)}
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => removeFileAt(idx, e)}
                            data-testid={`button-remove-file-${idx}`}
                            className="shrink-0"
                          >
                            <X className="w-4 h-4" />
                            <span className="sr-only">Kaldır</span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                    <div className="px-3 py-2 border-t">
                      <button
                        type="button"
                        onClick={openFilePicker}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        data-testid="button-add-more-files"
                      >
                        <Plus className="w-3 h-3" />
                        Dosya ekle
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  resetForm();
                }}
                disabled={isParsing}
              >
                İptal
              </Button>
              <Button
                onClick={handleIncele}
                disabled={inceleDisabled}
                data-testid="button-incele"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Dosya okunuyor…
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    İncele
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              {/* Single-file preview path (unchanged) */}
              {files.length === 1 && preview && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      Toplam satır: {preview.totalRows}
                    </Badge>
                    <Badge variant="default">
                      Geçerli satır: {preview.validRows}
                    </Badge>
                    <Badge variant="outline">
                      Atlanacak satır: {preview.skippedRows}
                    </Badge>
                    {isBulk && (
                      <Badge variant="destructive">
                        Tarihsiz satır: {preview.datelessRows}
                      </Badge>
                    )}
                  </div>

                  {preview.missingHeaders.length > 0 ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="mb-2 font-medium">
                          Eksik kolonlar tespit edildi
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {preview.missingHeaders.map((h) => (
                            <Badge key={h} variant="destructive">
                              {h}
                            </Badge>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Tüm kolonlar mevcut
                    </div>
                  )}

                  {preview.missingHeaders.length > 0 && preview.allHeaders.length > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4" />
                        Kolon Eşleştirme
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Excel dosyanızda farklı isimle bulunan kolonları aşağıdan eşleştirebilirsiniz.
                        "Atla" seçilirse o kolon boş bırakılır.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {preview.missingHeaders.map((target) => (
                          <div key={target} className="flex items-center gap-2">
                            <span className="text-xs font-mono w-44 shrink-0 truncate" title={target}>
                              {target}
                            </span>
                            <Select
                              value={headerMapping[target] ?? "__skip__"}
                              onValueChange={(v) =>
                                setHeaderMapping((prev) => {
                                  const next = { ...prev };
                                  if (v === "__skip__") delete next[target];
                                  else next[target] = v;
                                  return next;
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Atla" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">Atla</SelectItem>
                                {preview.allHeaders
                                  .filter((h) => h && h.trim().length > 0)
                                  .map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {preview.validRows > 0 && (
                    <div className="text-sm">
                      <span className="font-medium mr-2">TİP dağılımı:</span>
                      {TIP_ORDER.filter((k) => preview.tipCounts[k] > 0)
                        .map((k) => `${k}: ${preview.tipCounts[k]}`)
                        .join(" · ") || "—"}
                    </div>
                  )}

                  {preview.sampleRows.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        İlk {preview.sampleRows.length} satır önizlemesi
                      </div>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Firma</TableHead>
                              <TableHead>Fatura No</TableHead>
                              <TableHead className="text-right">
                                Mal Bedeli
                              </TableHead>
                              <TableHead className="text-right">
                                KDV
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preview.sampleRows.map((row, idx) => (
                              <TableRow key={idx}>
                                <TableCell>
                                  {row.firma ? truncate(row.firma, 30) : "—"}
                                </TableCell>
                                <TableCell>
                                  {row.faturaNo || "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatNumberCell(row.malBedeli)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatNumberCell(row.kdv)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Multi-file preview path */}
              {files.length >= 2 && multiPreview && (
                <>
                  <div className="text-sm font-medium">
                    {multiPreview.fileCount} dosya seçildi
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">
                      Toplam satır: {multiPreview.totalRows}
                    </Badge>
                    <Badge variant="default">
                      Geçerli satır: {multiPreview.validRows}
                    </Badge>
                    <Badge variant="outline">
                      Atlanacak satır: {multiPreview.skippedRows}
                    </Badge>
                    {isBulk && (
                      <Badge variant="destructive">
                        Tarihsiz satır: {multiPreview.datelessRows}
                      </Badge>
                    )}
                  </div>

                  {multiPreview.missingHeaders.length > 0 ? (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="mb-2 font-medium">
                          Eksik kolonlar tespit edildi (en az bir dosyada)
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {multiPreview.missingHeaders.map((h) => (
                            <Badge key={h} variant="destructive">
                              {h}
                            </Badge>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Tüm kolonlar mevcut
                    </div>
                  )}

                  {multiPreview.missingHeaders.length > 0 && multiPreview.allHeaders.length > 0 && (
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <div className="text-sm font-medium flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4" />
                        Kolon Eşleştirme
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Excel dosyanızda farklı isimle bulunan kolonları aşağıdan eşleştirebilirsiniz.
                        "Atla" seçilirse o kolon boş bırakılır.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {multiPreview.missingHeaders.map((target) => (
                          <div key={target} className="flex items-center gap-2">
                            <span className="text-xs font-mono w-44 shrink-0 truncate" title={target}>
                              {target}
                            </span>
                            <Select
                              value={headerMapping[target] ?? "__skip__"}
                              onValueChange={(v) =>
                                setHeaderMapping((prev) => {
                                  const next = { ...prev };
                                  if (v === "__skip__") delete next[target];
                                  else next[target] = v;
                                  return next;
                                })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Atla" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__skip__">Atla</SelectItem>
                                {multiPreview.allHeaders
                                  .filter((h) => h && h.trim().length > 0)
                                  .map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {multiPreview.validRows > 0 && (
                    <div className="text-sm">
                      <span className="font-medium mr-2">TİP dağılımı:</span>
                      {TIP_ORDER.filter((k) => multiPreview.tipCounts[k] > 0)
                        .map((k) => `${k}: ${multiPreview.tipCounts[k]}`)
                        .join(" · ") || "—"}
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Dosya bazında özet</div>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Dosya</TableHead>
                            <TableHead className="text-right">
                              Toplam satır
                            </TableHead>
                            <TableHead className="text-right">
                              Geçerli satır
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {multiPreview.perFile.map((pf, idx) => (
                            <TableRow key={`${pf.filename}-${idx}`}>
                              <TableCell title={pf.filename}>
                                {truncate(pf.filename, 50)}
                              </TableCell>
                              <TableCell className="text-right">
                                {pf.totalRows}
                              </TableCell>
                              <TableCell className="text-right">
                                {pf.validRows}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {isUploading && (
              <div className="space-y-1 px-1 pb-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {files.length > 1 && currentUploadIndex !== null
                      ? `Yükleniyor… (${currentUploadIndex + 1}/${files.length})`
                      : "Yükleniyor…"}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("select");
                  setPreview(null);
                  setMultiPreview(null);
                }}
                disabled={isUploading}
                data-testid="button-geri"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Geri
              </Button>
              <Button
                onClick={handleConfirmUpload}
                disabled={isUploading || files.length === 0}
                data-testid="button-upload"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Yükleniyor…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Onayla ve Yükle
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "result" && !multiResults && (
          <>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="rounded-md border p-4 bg-green-50 dark:bg-green-950/20">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                  <CheckCircle2 className="h-5 w-5" />
                  Yükleme Tamamlandı
                </div>
                {uploadResult?.message && (
                  <p className="text-sm text-muted-foreground mt-2">
                    {uploadResult.message}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {uploadResult?.eklenen !== undefined && (
                  <Badge className="bg-green-600 hover:bg-green-600">
                    Eklenen: {uploadResult.eklenen}
                  </Badge>
                )}
                {uploadResult?.atlanan !== undefined && (
                  <Badge variant="secondary">
                    Mükerrer atlanan: {uploadResult.atlanan}
                  </Badge>
                )}
                {uploadResult?.tarihsiz !== undefined &&
                  uploadResult.tarihsiz > 0 && (
                    <Badge variant="outline">
                      Tarihsiz atlanan: {uploadResult.tarihsiz}
                    </Badge>
                  )}
                {uploadResult?.toplam !== undefined && (
                  <Badge variant="default">
                    Toplam: {uploadResult.toplam}
                  </Badge>
                )}
              </div>

              {uploadResult?.skippedCount !== undefined &&
                uploadResult.skippedCount > 0 &&
                Array.isArray(uploadResult?.skippedRows) &&
                uploadResult.skippedRows.length > 0 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      <div className="mb-2">
                        {uploadResult.skippedCount} satır atlandı. Aşağıdaki
                        butonla detaylı raporu Excel olarak indirebilirsiniz.
                      </div>
                      {uploadResult.skippedCount >
                        uploadResult.skippedRows.length && (
                        <div className="text-xs text-muted-foreground mb-2">
                          Not: ilk {uploadResult.skippedRows.length} satır
                          gösteriliyor.
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadSkipped}
                        data-testid="button-download-skipped"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Atlananları İndir (.xlsx)
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  resetForm();
                }}
                data-testid="button-result-close"
              >
                Kapat
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "result" && multiResults && (
          <>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="rounded-md border p-4 bg-green-50 dark:bg-green-950/20">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium">
                  <CheckCircle2 className="h-5 w-5" />
                  Toplu Yükleme Tamamlandı
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="default">
                  Toplam dosya: {multiStats.total}
                </Badge>
                <Badge className="bg-green-600 hover:bg-green-600">
                  Başarılı: {multiStats.ok}
                </Badge>
                <Badge variant="secondary">
                  Mükerrer dosya: {multiStats.duplicate}
                </Badge>
                {multiStats.error > 0 && (
                  <Badge variant="destructive">
                    Hatalı: {multiStats.error}
                  </Badge>
                )}
                <Badge variant="outline">
                  Toplam eklenen satır: {multiStats.eklenen}
                </Badge>
                <Badge variant="outline">
                  Toplam mükerrer satır: {multiStats.atlanan}
                </Badge>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dosya Adı</TableHead>
                      <TableHead>Durum</TableHead>
                      <TableHead className="text-right">Eklenen</TableHead>
                      <TableHead className="text-right">Atlanan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {multiResults.map((r, idx) => (
                      <TableRow key={`${r.filename}-${idx}`}>
                        <TableCell title={r.filename}>
                          {truncate(r.filename, 50)}
                        </TableCell>
                        <TableCell>
                          {r.kind === "ok" && (
                            <span className="text-green-700 dark:text-green-400">
                              Başarılı
                            </span>
                          )}
                          {r.kind === "duplicate" && (
                            <span className="text-amber-700 dark:text-amber-400">
                              Mükerrer (önceden yüklenmiş
                              {r.existing.uploadDate
                                ? ` — ${formatExistingDate(r.existing.uploadDate)}`
                                : ""}
                              )
                            </span>
                          )}
                          {r.kind === "error" && (
                            <span className="text-red-700 dark:text-red-400">
                              Hata: {r.error}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.kind === "ok" ? r.eklenen : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {r.kind === "ok" ? r.atlanan : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {multiStats.hasAnySkipped && (
                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownloadMultiSkipped}
                    data-testid="button-download-multi-skipped"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Atlanan satırları indir (.xlsx)
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  resetForm();
                }}
                data-testid="button-result-close"
              >
                Kapat
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
