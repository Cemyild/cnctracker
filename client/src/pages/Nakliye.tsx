import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, RefreshCcw, Save, Trash2, X, ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronsUpDown, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatCurrencyFull } from "@/lib/utils";

export default function Nakliye() {
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [extractedData, setExtractedData] = useState<any[]>([]);
    const [savedInvoices, setSavedInvoices] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [matching, setMatching] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
    const [customers, setCustomers] = useState<string[]>([]);

    // Date Filter State
    const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });

    // Modal Edit States
    const [editMusteri, setEditMusteri] = useState("");
    const [editKonteynerler, setEditKonteynerler] = useState("");
    const [openCombobox, setOpenCombobox] = useState(false);
    const [updating, setUpdating] = useState(false);

    const { toast } = useToast();

    // Helper to format currency
    const formatCurrency = (val: number | string | null | undefined) => {
        if (val === null || val === undefined) return "-";
        const num = typeof val === "string" ? parseFloat(val) : val;
        if (isNaN(num)) return "-";
        return new Intl.NumberFormat("tr-TR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num);
    };

    // Helper to format date
    const formatDate = (dateStr: string | null | undefined) => {
        if (!dateStr) return "-";
        try {
            // Check if standard YYYY-MM-DD format
            if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [year, month, day] = dateStr.split('-');
                return `${day}.${month}.${year}`;
            }
            return new Date(dateStr).toLocaleDateString("tr-TR");
        } catch (e) {
            return dateStr;
        }
    };

    // Helper to extract Container or Reference number
    const extractContainerRef = (text: string | null | undefined, returnAll: boolean = false) => {
        if (!text) return returnAll ? [] : "-";
        // Look for common patterns:
        // 1. Container: 4 letters + 6 or 7 digits (e.g., GAOU6046289)

        const containerRegex = /\b[A-Z]{4}\s*\d{6,7}\b/g;
        const matches = text.match(containerRegex);

        if (matches && matches.length > 0) {
            const uniqueMatches = Array.from(new Set(matches)); // Remove duplicates
            return returnAll ? uniqueMatches : uniqueMatches[0];
        }

        return returnAll ? [] : "-";
    };

    // Helper to find customer name in description
    const extractCustomer = (text: string | null | undefined) => {
        if (!text || customers.length === 0) return "-";

        const textLower = text.toLocaleLowerCase('tr');

        // Words to ignore in COMPANY NAMES (Suffixes & Locations)
        // Ignoring cities prevents "BURSA İDEAL İSTİF" matching just because text contains "Bursa"
        const ignoredCompanyWords = [
            "ltd", "şti", "sti", "a.ş", "a.s", "as", "san", "tic", "ve", "iç", "dış",
            "ic", "dis", "sanayi", "ticaret", "limitet", "anonim", "şirketi", "sirketi",
            "gıda", "tekstil", "lojistik", "otomotiv", "inş", "ins", "yapı", "yapi",
            "nakliyat", "nak", "tür", "tur", "petrol", "kimya", "plastik", "ambalaj",
            "ith", "ihr", "tas", "taş", "group", "grup",
            "bursa", "gemlik", "istanbul", "ankara", "izmir", "kocaeli", "yalova", "türkiye", "turkiye"
        ];

        let bestMatch = { name: "-", score: 0 };

        customers.forEach(customer => {
            const customerLower = customer.toLocaleLowerCase('tr');

            // 1. Exact Substring Match (Highest priority if significant length)
            // But be careful: "E" matches "Empo".
            // So we skip really short exact matches to avoid noise, unless it's the whole text.
            if (textLower.includes(customerLower) && customerLower.length > 4) {
                // Base score 1000 + length
                const score = 1000 + customerLower.length;
                if (score > bestMatch.score) {
                    bestMatch = { name: customer, score };
                }
                return;
            }

            // 2. Token-Based Match with Word Boundaries
            // IMPORTANT: Do NOT split on hyphens here. Keep "DE-KA" as one token.
            const tokens = customerLower.split(/[\s\.,()\[\]]+/)
                .map(t => t.trim())
                .filter(t => t.length > 1) // Allow 2 letter words
                .filter(t => !ignoredCompanyWords.includes(t));

            if (tokens.length === 0) return;

            let hitCount = 0;
            let firstTokenMatched = false;
            let totalWeight = 0;
            let matchedWeight = 0;

            const escapeRegExp = (string: string) => {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            };

            tokens.forEach((token, index) => {
                // Give higher weight to earlier tokens
                const weight = index === 0 ? 2.0 : (index === 1 ? 1.5 : 1.0);
                totalWeight += weight;

                const escapedToken = escapeRegExp(token);

                // 1. Standard Match: \bTOKEN\b
                const regex = new RegExp(`\\b${escapedToken}\\b`, 'i');
                let matched = regex.test(textLower);

                // 2. Hyphen Flexibility (Only if standard match failed)
                // Scenario A: DB has "DE-KA", Text has "DEKA" or "DE KA"
                // Scenario B: DB has "DEKA", Text has "DE-KA"
                if (!matched) {
                    const cleanToken = token.replace(/-/g, ''); // "DE-KA" -> "DEKA"
                    const escapedCleanToken = escapeRegExp(cleanToken);

                    // Check "DEKA" match
                    if (cleanToken.length > 2 && new RegExp(`\\b${escapedCleanToken}\\b`, 'i').test(textLower)) {
                        matched = true;
                    }
                    // Check "DE KA" match (Space instead of hyphen)
                    else if (token.includes('-')) {
                        // No need to escape spacedToken parts again if we trust replace, but safer to re-escape?
                        // token "DE-KA" -> "DE KA".
                        // If token had ".", it would be "DE.KA" -> "DE KA" which is regex safeish but let's be strict.
                        // Actually better to just escape the raw parts.
                        const parts = token.split('-').map(p => escapeRegExp(p));
                        const pattern = parts.join('\\s+'); // Flexible whitespace instead of single space
                        if (new RegExp(`\\b${pattern}\\b`, 'i').test(textLower)) {
                            matched = true;
                        }
                    }
                    // Reverse check: DB "DEKA", Text "DE-KA"
                    // This is harder because 'token' is DEKA. We'd have to guess where to put hyphen or check all text words.
                    // But usually DB name is the "official" one.
                    // If DB is "DEKA KİMYA", and text has "DE-KA", it should match?
                    // Let's defer this specific reverse case unless needed, as "DEKA" usually matches "DEKA".
                    // If text is "DE-KA", \bDEKA\b generally fails.
                    // A simple workaround if token has no hyphen: check if text has token-with-hyphen?
                    // No, "D-EKA"? "DE-KA"? Too many permutations.
                    // Instead, strip hyphens from TEXT temporarily for a check?
                    else if (!token.includes('-')) {
                        // As a fallback for high-importance tokens (first one)
                        if (index === 0 && token.length > 3) {
                            // Try matching against text with hyphens removed? Too aggressive globally.
                            // Maybe checking if text contains "DE-KA" matching "DEKA"?
                            // Let's skip for now to avoid false positives.
                        }
                    }
                }

                if (matched) {
                    hitCount++;
                    matchedWeight += weight;
                    if (index === 0) firstTokenMatched = true;
                }
            });

            // 3. Special Manual Rules (Overrides)
            // Handle specific user-requested mappings
            if (hitCount === 0) { // Only check if no normal match found to save perf? Or always boost?

                // Rule 1: "Eny" in text -> "Enyteks" in DB
                // DB Customer must contain "enyteks"
                // Text must match "eny" word
                if (customerLower.includes("enyteks") && /\beny\b/i.test(textLower)) {
                    hitCount = 10; // High score force
                    matchedWeight = 10;
                    firstTokenMatched = true;
                }

                // Rule 2: "Iber Yarns" in text -> "Iberyarns" in DB
                if (customerLower.includes("iberyarns")) {
                    // Check "iber yarns" or "iber"
                    if (/\biber\s*yarns\b/i.test(textLower) || /\biber\b/i.test(textLower)) {
                        hitCount = 10;
                        matchedWeight = 10;
                        firstTokenMatched = true;
                    }
                }
            }

            const ratio = matchedWeight / totalWeight;

            // Decision Logic
            let isValid = false;

            if (tokens.length === 1) {
                // Single word company (e.g. "Borusan"). Must exact match.
                if (ratio === 1) isValid = true;
            } else {
                // Multi word.
                // If First Token Matched (Brand): Allow lower threshold (e.g. 0.4)
                // "KOM-SER KOMPRESÖR..." -> KOM-SER matches. Weight 2. Total Weight ~5.5. Ratio ~0.36.
                // Maybe 0.4 is still too high for long names.
                // Let's use Hit Count logic combined.

                if (firstTokenMatched && matchedWeight >= 2.0) isValid = true; // First word is key
                else if (ratio >= 0.5) isValid = true; // General good match
            }

            if (isValid) {
                // Score prioritization
                const score = (matchedWeight * 100) + (hitCount * 10);
                if (score > bestMatch.score) {
                    bestMatch = { name: customer, score };
                }
            }
        });

        return bestMatch.name !== "-" ? bestMatch.name : "-";
    };

    // Fetch saved invoices and customers on mount and setup polling
    useEffect(() => {
        fetchSavedInvoices();
        fetchCustomers();

        // Listen for new invoices (automated Gmail processing) via polling
        const interval = setInterval(() => {
            fetchSavedInvoices();
        }, 10000); // Every 10 seconds

        return () => clearInterval(interval);
    }, []);

    const fetchSavedInvoices = async () => {
        try {
            const response = await fetch("/api/nakliye");
            if (response.ok) {
                const data = await response.json();
                setSavedInvoices(data);
            }
        } catch (error) {
            console.error("Fetch saved invoices error:", error);
        }
    };

    const fetchCustomers = async () => {
        try {
            const response = await fetch("/api/gumruk/tum-firmalar");
            if (response.ok) {
                const data = await response.json();
                setCustomers(data);
            }
        } catch (error) {
            console.error("Fetch customers error:", error);
        }
    };

    // State management for Modal Fields
    useEffect(() => {
        if (selectedInvoice) {
            // Customer: Use stored value if available, else extract
            const initialMusteri = selectedInvoice.musteri || extractCustomer(selectedInvoice.malHizmet);
            setEditMusteri(initialMusteri === "-" ? "" : initialMusteri);

            // Container: Use stored value if available, else extract all found
            const initialKont = selectedInvoice.konteynerler;
            if (initialKont) {
                setEditKonteynerler(initialKont);
            } else {
                const extracted = extractContainerRef(selectedInvoice.malHizmet, true) as string[];
                setEditKonteynerler(extracted.join(", "));
            }
        }
    }, [selectedInvoice, customers]); // Add customers to dept if extraction depends on it

    const handleUpdate = async () => {
        if (!selectedInvoice) return;

        setUpdating(true);
        try {
            const response = await fetch(`/api/nakliye/${selectedInvoice.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    musteri: editMusteri,
                    konteynerler: editKonteynerler
                })
            });

            if (response.ok) {
                const updated = await response.json();
                toast({ title: "Güncellendi", description: "Fatura bilgileri güncellendi." });

                // Update local state
                setSavedInvoices(prev => prev.map(inv =>
                    inv.id === selectedInvoice.id ? { ...inv, musteri: editMusteri, konteynerler: editKonteynerler } : inv
                ));

                // Update selectedInvoice
                setSelectedInvoice((prev: any) => ({ ...prev, musteri: editMusteri, konteynerler: editKonteynerler }));
            } else {
                throw new Error("Güncelleme başarısız");
            }
        } catch (error) {
            console.error("Update error:", error);
            toast({ variant: "destructive", title: "Hata", description: "Güncelleme yapılamadı." });
        } finally {
            setUpdating(false);
        }
    };

    // Local Proxy URL (handles the n8n request server-side to bypass CORS)
    const PROXY_URL = "/api/proxy/nakliye-upload";

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        setSuccess(false);
        setExtractedData([]);

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append("file", files[i]);
        }

        try {
            console.log(`CLIENT: Sending ${files.length} files in a single batch to proxy...`);
            const response = await fetch(PROXY_URL, {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                const result = await response.json();
                console.log("CLIENT: Batch upload success data:", result);

                let processedData = [];
                if (result.dataType === "xlsx_parsed") {
                    processedData = result.data || [];
                } else if (Array.isArray(result)) {
                    processedData = result.map(item => {
                        if (item.output && typeof item.output === 'object' && !Array.isArray(item.output)) return item.output;
                        if (item.data && typeof item.data === 'object' && !Array.isArray(item.data)) return item.data;
                        return item;
                    });
                } else if (result.data && Array.isArray(result.data)) {
                    processedData = result.data;
                } else if (result.output && typeof result.output === 'object') {
                    processedData = [result.output];
                } else {
                    processedData = [result];
                }

                setExtractedData(processedData);
                setSuccess(true);
                toast({
                    title: "İşlem Tamamlandı",
                    description: `${files.length} belge tek bir paket olarak işlendi.`,
                });
            } else {
                console.error("CLIENT: Batch upload failed");
                throw new Error("Batch request failed");
            }
        } catch (error) {
            console.error("CLIENT: Critical error during batch upload:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: "Belgeler gönderilirken bir hata oluştu.",
            });
        } finally {
            setUploading(false);
        }
    };

    const handleSaveToSystem = async () => {
        if (extractedData.length === 0) return;

        setSaving(true);
        try {
            const response = await fetch("/api/nakliye/kaydet", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(extractedData),
            });

            if (response.ok) {
                toast({
                    title: "Başarılı",
                    description: "Tüm veriler veritabanına kaydedildi.",
                });
                setSuccess(false);
                setExtractedData([]);
                fetchSavedInvoices(); // Refresh the list
            } else {
                throw new Error("Kaydetme işlemi başarısız");
            }
        } catch (error) {
            console.error("Save error:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: "Veriler kaydedilirken bir sorun oluştu.",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleMatchWithGumruk = async () => {
        if (savedInvoices.length === 0) {
            toast({ variant: "destructive", title: "Hata", description: "Eşleştirilecek kayıt bulunamadı." });
            return;
        }

        setMatching(true);
        try {
            const response = await fetch("/api/nakliye/eslestir", {
                method: "POST",
            });

            if (response.ok) {
                const result = await response.json();
                toast({
                    title: "Eşleştirme Tamamlandı",
                    description: `${result.totalScanned} kayıttan ${result.matchCount} tanesi Gümrük verileriyle eşleşti.`,
                });
                fetchSavedInvoices(); // Refresh to see new data
            } else {
                throw new Error("Eşleştirme başarısız");
            }
        } catch (error) {
            console.error("Matching error:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: "Eşleştirme işlemi sırasında hata oluştu.",
            });
        } finally {
            setMatching(false);
        }
    };

    const handleDeleteInvoice = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Bu faturayı silmek istediğinize emin misiniz?")) return;

        try {
            const response = await fetch(`/api/nakliye/${id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                toast({
                    title: "Silindi",
                    description: "Fatura başarıyla silindi.",
                });
                fetchSavedInvoices();
                if (selectedInvoice?.id === id) setSelectedInvoice(null);
            } else {
                throw new Error("Silme başarısız");
            }
        } catch (error) {
            console.error("Delete error:", error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: "Silme işlemi sırasında hata oluştu.",
            });
        }
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredInvoices = savedInvoices.filter(invoice => {
        if (!dateRange.start && !dateRange.end) return true;

        const invoiceDate = new Date(invoice.faturaTarihi);
        const start = dateRange.start ? new Date(dateRange.start) : null;
        const end = dateRange.end ? new Date(dateRange.end) : null;

        if (start && invoiceDate < start) return false;
        if (end && invoiceDate > end) return false;

        return true;
    });

    const sortedInvoices = [...filteredInvoices].sort((a, b) => {
        if (!sortConfig) return 0;

        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortConfig.direction === 'asc'
                ? aValue.localeCompare(bValue, 'tr')
                : bValue.localeCompare(aValue, 'tr');
        }

        return sortConfig.direction === 'asc'
            ? (aValue > bValue ? 1 : -1)
            : (aValue < bValue ? 1 : -1);
    });

    const resetView = () => {
        setSuccess(false);
        setExtractedData([]);
        setUploading(false);
    };

    // Bir faturanın konteyner adedi: kayıtlı konteynerler alanı varsa ondan, yoksa
    // mal/hizmet metninden regex ile çıkarılan benzersiz konteyner sayısı.
    const containerCount = (inv: any): number => {
        if (inv.konteynerler) {
            return String(inv.konteynerler).split(",").map((s: string) => s.trim()).filter(Boolean).length;
        }
        const extracted = extractContainerRef(inv.malHizmet, true) as string[];
        return extracted.length;
    };

    // ===== Türetilmiş KPI'lar + müşteri ciro payı (filtreli kayıtlardan) =====
    const yil = new Date().getFullYear();
    const num = (v: any) => {
        const n = typeof v === "string" ? parseFloat(v) : v;
        return Number.isFinite(n) ? n : 0;
    };

    const kpis = useMemo(() => {
        const adet = filteredInvoices.length;
        const navlun = filteredInvoices.reduce((a, inv) => a + num(inv.malHizmetToplamTutarı), 0);
        const kdv = filteredInvoices.reduce((a, inv) => a + num(inv.kdvTutarı), 0);
        const konteyner = filteredInvoices.reduce((a, inv) => a + containerCount(inv), 0);
        const ort = adet > 0 ? navlun / adet : 0;
        return [
            { label: "Toplam Fatura", value: String(adet), sub: `${yil} kümülatif`, color: "#0ea5e9" },
            { label: "Toplam Navlun", value: formatCurrencyFull(navlun), sub: "mal hizmet toplamı", color: "#0f766e" },
            { label: "KDV", value: formatCurrencyFull(kdv), sub: "hesaplanan", color: "#7c3aed" },
            { label: "Konteyner", value: String(konteyner), sub: "taşınan toplam", color: "#d97706" },
            { label: "Ort. Fatura", value: formatCurrencyFull(ort), sub: "fatura başına", color: "#10b981" },
        ];
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredInvoices, customers]);

    const topMusteri = useMemo(() => {
        const map = new Map<string, number>();
        filteredInvoices.forEach((inv) => {
            const name = inv.musteri || extractCustomer(inv.malHizmet);
            if (!name || name === "-") return;
            map.set(name, (map.get(name) || 0) + num(inv.odenecekTutar));
        });
        const arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }));
        arr.sort((a, b) => b.value - a.value);
        const top = arr.slice(0, 5);
        const max = Math.max(...top.map((t) => t.value), 1);
        return top.map((t) => ({ ...t, w: Math.round((t.value / max) * 100) }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filteredInvoices, customers]);

    // Sıralanabilir tablo başlığı yardımcı bileşeni
    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig?.key !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
        return sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />;
    };

    return (
        <div className="min-h-full bg-slate-50 dark:bg-background">
            <div className="px-6 pb-12 lg:px-8">
                {/* ===== STICKY HEADER ===== */}
                <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
                    <div className="flex flex-wrap items-end justify-between gap-4 pb-3.5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                                <Truck className="h-[22px] w-[22px]" strokeWidth={1.9} />
                            </div>
                            <div>
                                <h1 className="text-[21px] font-extrabold tracking-tight">Nakliye</h1>
                                <p className="mt-0.5 text-[12.5px] text-muted-foreground">Navlun faturaları ve konteyner takibi · <strong className="text-foreground/80">{yil}</strong></p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                variant="outline"
                                className="h-[38px] gap-2 font-semibold"
                                onClick={handleMatchWithGumruk}
                                disabled={matching || uploading}
                            >
                                {matching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                                {matching ? "Eşleşiyor..." : "Gümrük ile Eşleştir"}
                            </Button>

                            <input
                                type="file"
                                id="nakliye-upload-compact"
                                className="hidden"
                                onChange={handleFileUpload}
                                multiple
                                disabled={uploading}
                                accept=".pdf,.jpg,.jpeg,.png"
                            />
                            <Button asChild className="h-[38px] gap-2 font-semibold" disabled={uploading}>
                                <label htmlFor="nakliye-upload-compact" className="cursor-pointer">
                                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    {uploading ? "Analiz Ediliyor..." : "Fatura Yükle"}
                                </label>
                            </Button>
                        </div>
                    </div>
                </div>

                {/* ===== 5 KPI (accent-bar) ===== */}
                <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
                    {kpis.map((k) => (
                        <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                            <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide leading-tight text-muted-foreground">{k.label}</div>
                            <div className="mt-2 pl-2 text-[21px] font-extrabold tracking-tight tabular-nums">{k.value}</div>
                            <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
                        </div>
                    ))}
                </div>

                {/* ===== Extraction Preview (geçici) ===== */}
                {extractedData.length > 0 && (
                    <div className="mt-4 overflow-hidden rounded-[14px] border-2 border-sky-300 bg-sky-50/60 duration-500 animate-in fade-in slide-in-from-top-4 dark:bg-sky-950/20">
                        <div className="flex items-center justify-between border-b border-sky-200 bg-sky-100/60 px-5 py-3.5 dark:bg-sky-950/30">
                            <div className="flex items-center gap-2.5">
                                <FileSpreadsheet className="h-5 w-5 text-sky-600" />
                                <h3 className="font-extrabold text-sky-700 dark:text-sky-300">Yeni Ayıklanan Veriler (Onay Bekliyor)</h3>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={resetView} disabled={saving}>İptal</Button>
                                <Button size="sm" className="gap-2 bg-emerald-600 font-bold hover:bg-emerald-700" onClick={handleSaveToSystem} disabled={saving}>
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                    Sisteme Kaydet
                                </Button>
                            </div>
                        </div>
                        <div className="max-h-[300px] overflow-auto">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                                    <TableRow className="hover:bg-transparent">
                                        {Object.keys(extractedData[0] || {}).map((key) => (
                                            <TableHead key={key} className="py-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{key}</TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {extractedData.map((row, idx) => (
                                        <TableRow key={idx}>
                                            {Object.values(row).map((val: any, vIdx) => (
                                                <TableCell key={vIdx} className="py-2 text-sm">
                                                    {typeof val === 'object' && val !== null ? JSON.stringify(val) : (val?.toString() || "-")}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}

                {/* ===== Navlun Faturaları (tam genişlik) ===== */}
                <div className="mt-4 overflow-hidden rounded-[14px] border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                        <h3 className="text-[15px] font-bold">Navlun Faturaları</h3>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="startDate" className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Başlangıç</Label>
                                <Input id="startDate" type="date" className="h-8 w-[140px] text-xs" value={dateRange.start} onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="endDate" className="whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Bitiş</Label>
                                <Input id="endDate" type="date" className="h-8 w-[140px] text-xs" value={dateRange.end} onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
                            </div>
                            {(dateRange.start || dateRange.end) && (
                                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => setDateRange({ start: "", end: "" })}>
                                    <X className="mr-1 h-3 w-3" /> Filtreyi Temizle
                                </Button>
                            )}
                            <span className="text-xs text-muted-foreground">{sortedInvoices.length} kayıt</span>
                        </div>
                    </div>

                    {/* Kaydırma kabı dış div; iç Table sarmalayıcısı overflow-visible olmalı,
                        aksi halde sticky başlık iç (hiç kaymayan) kaba göre çözülür ve yapışmaz. */}
                    <div className="max-h-[calc(100vh-320px)] overflow-auto [&>div]:overflow-visible">
                        <Table className="w-full whitespace-nowrap text-[12.5px]">
                            <TableHeader className="sticky top-0 z-[5] bg-slate-50 dark:bg-muted">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="h-9 cursor-pointer select-none px-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition-colors hover:text-foreground" onClick={() => handleSort('faturaNo')}>
                                        <div className="flex items-center gap-1.5">Fatura No <SortIcon column="faturaNo" /></div>
                                    </TableHead>
                                    <TableHead className="h-9 cursor-pointer select-none px-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 transition-colors hover:text-foreground" onClick={() => handleSort('faturaTarihi')}>
                                        <div className="flex items-center gap-1.5">Tarih <SortIcon column="faturaTarihi" /></div>
                                    </TableHead>
                                    <TableHead className="h-9 px-2.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Mal/Hizmet</TableHead>
                                    <TableHead className="h-9 px-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#0284c7" }}>Konteyner/Ref.</TableHead>
                                    <TableHead className="h-9 px-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#7c3aed" }}>Dosya No</TableHead>
                                    <TableHead className="h-9 px-2.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "#059669" }}>Müşteri</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Miktar</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Birim Fiyat</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Tutar</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">KDV</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Tevkifat</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Vergili Top.</TableHead>
                                    <TableHead className="h-9 px-2.5 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Genel Toplam</TableHead>
                                    <TableHead className="h-9 w-[40px] px-1.5"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedInvoices.length > 0 ? (
                                    sortedInvoices.map((inv) => (
                                        <TableRow key={inv.id} className="cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                                            <TableCell className="px-2.5 py-1.5 font-bold tabular-nums" style={{ color: "#0284c7" }}>{inv.faturaNo || "N/A"}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 tabular-nums text-muted-foreground">{formatDate(inv.faturaTarihi)}</TableCell>
                                            <TableCell className="max-w-[240px] truncate px-2.5 py-1.5 font-medium" title={inv.malHizmet || undefined}>{inv.malHizmet || "-"}</TableCell>
                                            <TableCell className="max-w-[150px] truncate px-2.5 py-1.5 font-mono text-[12px] font-medium" style={{ color: "#0284c7" }} title={inv.konteynerler || undefined}>{inv.konteynerler || extractContainerRef(inv.malHizmet)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 font-bold" style={{ color: "#7c3aed" }}>{inv.ilgiliDosyaNo || "-"}</TableCell>
                                            <TableCell className="max-w-[170px] truncate px-2.5 py-1.5 font-medium" style={{ color: "#059669" }} title={inv.musteri || undefined}>{inv.musteri || extractCustomer(inv.malHizmet)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-mono tabular-nums">{formatCurrency(inv.miktar)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-mono tabular-nums text-muted-foreground">{formatCurrency(inv.birimFiyat)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-bold tabular-nums">{formatCurrency(inv.malHizmetToplamTutarı)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrency(inv.kdvTutarı)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums" style={{ color: "#d97706" }}>{formatCurrency(inv.hesaplananKdvTevkifat20)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{formatCurrency(inv.vergilerDahilToplamTutar)}</TableCell>
                                            <TableCell className="px-2.5 py-1.5 text-right font-black tabular-nums text-foreground">{formatCurrency(inv.odenecekTutar)}</TableCell>
                                            <TableCell className="px-1.5 py-1 text-center">
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={(e) => handleDeleteInvoice(inv.id, e)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={14} className="h-40 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <AlertCircle className="h-10 w-10 opacity-20" />
                                                <p>Henüz kayıtlı fatura bulunamadı.</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* ===== En Çok Navlun · Müşteri (tablonun altında, tam genişlik) ===== */}
                <div className="mt-4 rounded-[14px] border bg-card p-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-[15px] font-bold">En Çok Navlun · Müşteri</h3>
                        <p className="text-xs text-muted-foreground">{yil} toplam ciro payı</p>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                        {topMusteri.length === 0 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">Henüz veri yok</div>
                        )}
                        {topMusteri.map((m) => (
                            <div key={m.name} className="min-w-0">
                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-[12.5px] font-semibold text-foreground/80" title={m.name}>{m.name}</span>
                                    <span className="flex-shrink-0 text-[12.5px] font-bold tabular-nums">{formatCurrencyFull(m.value)}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                                    <span className="block h-full rounded-full bg-sky-500" style={{ width: `${m.w}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ===== Fatura Detay Modalı (korundu) ===== */}
            <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <FileText className="h-5 w-5 text-sky-600" />
                            <span>Fatura Detayı</span>
                        </DialogTitle>
                    </DialogHeader>

                    {selectedInvoice && (
                        <div className="grid gap-6 py-4">
                            <div className="flex flex-col items-center justify-between gap-4 rounded-lg border bg-muted/30 p-4 sm:flex-row">
                                <div className="flex flex-col items-center gap-1 sm:items-start">
                                    <span className="text-xs font-bold uppercase text-muted-foreground">Fatura No</span>
                                    <span className="font-mono text-xl font-black tracking-tight" style={{ color: "#0284c7" }}>{selectedInvoice.faturaNo}</span>
                                </div>
                                <div className="hidden h-8 w-px bg-border sm:block"></div>
                                <div className="flex flex-col items-center gap-1 sm:items-end">
                                    <span className="text-xs font-bold uppercase text-muted-foreground">Tarih</span>
                                    <span className="font-mono text-xl font-bold tracking-tight">{formatDate(selectedInvoice.faturaTarihi)}</span>
                                </div>
                            </div>

                            {/* Matched Gumruk Info */}
                            {selectedInvoice.ilgiliDosyaNo && (
                                <div className="flex items-center justify-center rounded-lg border border-purple-200 bg-purple-50 p-3 text-center text-sm font-medium text-purple-800 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-purple-300">
                                    <CheckCircle2 className="mr-2 h-5 w-5 text-purple-600" />
                                    <span>
                                        {/* Format: 1-DOSYA NO, 2-FİRMA ÜNVAN, 3-GÜMRÜK, 4-DOVİZ KIYMETİ, 5-DOVİZ, 6-TESCİL NO, 7-TESCİL TARİHİ, 8-HOUSE NO */}
                                        {selectedInvoice.ilgiliDosyaNo} - {selectedInvoice.gumrukFirmaUnvan} - {selectedInvoice.gumrukAdi} - {selectedInvoice.gumrukDovizKiymeti} - {selectedInvoice.gumrukDovizCinsi} - {selectedInvoice.gumrukTescilNo} - {selectedInvoice.gumrukTescilTarihi} - {selectedInvoice.eslesenHouseNo}
                                    </span>
                                </div>
                            )}

                            {/* Editable Fields */}
                            <div className="grid grid-cols-1 gap-4 rounded-xl border bg-muted/10 p-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">Müşteri</Label>
                                    <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" role="combobox" aria-expanded={openCombobox} className="w-full justify-between font-normal">
                                                {editMusteri ? customers.find((c) => c === editMusteri) || editMusteri : "Müşteri Seçiniz..."}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0">
                                            <Command>
                                                <CommandInput placeholder="Müşteri ara..." />
                                                <CommandList>
                                                    <CommandEmpty>Müşteri bulunamadı.</CommandEmpty>
                                                    <CommandGroup>
                                                        {customers.map((customer) => (
                                                            <CommandItem
                                                                key={customer}
                                                                value={customer}
                                                                onSelect={(currentValue) => {
                                                                    setEditMusteri(currentValue === editMusteri ? "" : currentValue);
                                                                    setOpenCombobox(false);
                                                                }}
                                                            >
                                                                <Check className={cn("mr-2 h-4 w-4", editMusteri === customer ? "opacity-100" : "opacity-0")} />
                                                                {customer}
                                                            </CommandItem>
                                                        ))}
                                                    </CommandGroup>
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">Konteynerler</Label>
                                    <Input value={editKonteynerler} onChange={(e) => setEditKonteynerler(e.target.value)} placeholder="Konteyner no giriniz..." className="font-mono text-sm" />
                                    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <AlertCircle className="h-3 w-3" /> Birden fazla ise virgülle ayırın.
                                    </p>
                                </div>
                            </div>

                            {/* Full Description */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Mal/Hizmet Açıklaması</h4>
                                <div className="max-h-[300px] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/50 p-4 text-sm leading-relaxed">
                                    {selectedInvoice.malHizmet}
                                </div>
                            </div>

                            {/* Financial Summary */}
                            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Miktar:</span>
                                    <span className="font-mono font-medium tabular-nums">{formatCurrency(selectedInvoice.miktar)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Birim Fiyat:</span>
                                    <span className="font-mono font-medium tabular-nums">{formatCurrency(selectedInvoice.birimFiyat)}</span>
                                </div>
                                <div className="my-2 h-px bg-border/50" />
                                <div className="flex items-center justify-between">
                                    <span className="font-medium">Mal Hizmet Toplamı:</span>
                                    <span className="font-mono font-bold tabular-nums">{formatCurrency(selectedInvoice.malHizmetToplamTutarı)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">KDV Tutarı:</span>
                                    <span className="font-mono tabular-nums">{formatCurrency(selectedInvoice.kdvTutarı)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm" style={{ color: "#d97706" }}>
                                    <span>Tevkifat:</span>
                                    <span className="font-mono tabular-nums">{formatCurrency(selectedInvoice.hesaplananKdvTevkifat20)}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Vergili Toplam:</span>
                                    <span className="font-mono tabular-nums">{formatCurrency(selectedInvoice.vergilerDahilToplamTutar)}</span>
                                </div>
                                <div className="my-2 h-px bg-border" />
                                <div className="-mx-2 flex items-center justify-between rounded bg-sky-50 p-2 text-lg dark:bg-sky-950/20">
                                    <span className="font-bold" style={{ color: "#0284c7" }}>Genel Toplam:</span>
                                    <span className="font-mono font-black tabular-nums text-foreground">{formatCurrency(selectedInvoice.odenecekTutar)} TVL</span>
                                </div>
                            </div>
                            <DialogFooter className="mt-4 gap-2">
                                <Button variant="outline" onClick={() => setSelectedInvoice(null)} disabled={updating}>Vazgeç</Button>
                                <Button onClick={handleUpdate} disabled={updating}>
                                    {updating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Değişiklikleri Kaydet
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
