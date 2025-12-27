import { useState, useEffect } from "react";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Database, FileSpreadsheet, RefreshCcw, Save, Trash2, History, Plus, X, ArrowUpDown, ArrowUp, ArrowDown, Check, ChevronsUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function Nakliye() {
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [extractedData, setExtractedData] = useState<any[]>([]);
    const [savedInvoices, setSavedInvoices] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
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

    return (
        <div className="relative min-h-screen pb-20 overflow-x-hidden">
            <BackgroundPaths />

            <div className="relative z-10 p-4 lg:p-6 max-w-[1600px] mx-auto">
                {/* Compact Upload Bar */}
                <Card className="mb-6 bg-background/60 backdrop-blur-xl border-primary/20 shadow-xl rounded-2xl overflow-hidden border">
                    <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/20 rounded-xl shadow-inner border border-primary/20">
                                <Database className="w-5 h-5 text-primary" />
                            </div>
                            <span className="font-bold text-lg tracking-tight">Nakliye Paneli</span>
                        </div>

                        <div className="flex items-center gap-4 w-full md:w-auto">
                            <input
                                type="file"
                                id="nakliye-upload-compact"
                                className="hidden"
                                onChange={handleFileUpload}
                                multiple
                                disabled={uploading}
                                accept=".pdf,.jpg,.jpeg,.png"
                            />
                            <Button
                                asChild
                                variant={uploading ? "secondary" : "default"}
                                className={`h-12 px-6 rounded-xl font-bold transition-all ${uploading ? "animate-pulse" : "shadow-lg hover:shadow-primary/20"}`}
                                disabled={uploading}
                            >
                                <label htmlFor="nakliye-upload-compact" className="cursor-pointer flex items-center gap-2">
                                    {uploading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Analiz Ediliyor...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-5 h-5" />
                                            <span>Yeni Belgeleri Tara</span>
                                        </>
                                    )}
                                </label>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <div className="grid gap-6">
                    {/* Extraction Preview (Temporary) */}
                    {extractedData.length > 0 && (
                        <Card className="bg-primary/5 border-primary/30 shadow-2xl rounded-2xl overflow-hidden border-2 animate-in fade-in slide-in-from-top-4 duration-500">
                            <div className="p-4 border-b border-primary/20 flex items-center justify-between bg-primary/10">
                                <div className="flex items-center gap-3">
                                    <FileSpreadsheet className="w-5 h-5 text-primary" />
                                    <h3 className="font-extrabold text-primary">Yeni Ayıklanan Veriler (Onay Bekliyor)</h3>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={resetView} disabled={saving}>İptal</Button>
                                    <Button
                                        size="sm"
                                        className="bg-green-600 hover:bg-green-700 font-bold"
                                        onClick={handleSaveToSystem}
                                        disabled={saving}
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                        Sisteme Kaydet
                                    </Button>
                                </div>
                            </div>
                            <div className="max-h-[300px] overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                                        <TableRow>
                                            {Object.keys(extractedData[0] || {}).map((key) => (
                                                <TableHead key={key} className="text-xs font-bold uppercase py-2">{key}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {extractedData.map((row, idx) => (
                                            <TableRow key={idx} className="bg-background/40">
                                                {Object.values(row).map((val: any, vIdx) => (
                                                    <TableCell key={vIdx} className="text-sm py-2">
                                                        {typeof val === 'object' && val !== null ? JSON.stringify(val) : (val?.toString() || "-")}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </Card>
                    )}

                    {/* Saved Invoices List */}
                    <Card className="bg-background/40 backdrop-blur-xl border-border/50 shadow-2xl rounded-2xl overflow-hidden border">
                        <div className="p-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
                            <div className="flex items-center gap-3">
                                <History className="w-5 h-5 text-muted-foreground" />
                                <h3 className="text-xl font-bold">Kayıtlı Faturalar</h3>
                            </div>
                            <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-bold border border-primary/20">
                                {sortedInvoices.length} Toplam Kayıt
                            </div>
                        </div>

                        {/* Date Filter Bar */}
                        <div className="px-4 py-3 border-b border-border/50 bg-background/20 flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Label htmlFor="startDate" className="text-xs font-bold uppercase text-muted-foreground whitespace-nowrap">Başlangıç:</Label>
                                <Input
                                    id="startDate"
                                    type="date"
                                    className="h-8 w-[140px] text-xs"
                                    value={dateRange.start}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="endDate" className="text-xs font-bold uppercase text-muted-foreground whitespace-nowrap">Bitiş:</Label>
                                <Input
                                    id="endDate"
                                    type="date"
                                    className="h-8 w-[140px] text-xs"
                                    value={dateRange.end}
                                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                />
                            </div>
                            {(dateRange.start || dateRange.end) && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => setDateRange({ start: "", end: "" })}
                                >
                                    <X className="w-3 h-3 mr-1" /> Filtreyi Temizle
                                </Button>
                            )}
                        </div>

                        <div className="relative overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow>
                                        <TableHead
                                            className="font-bold py-4 cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => handleSort('faturaNo')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Fatura No
                                                {sortConfig?.key === 'faturaNo' ? (
                                                    sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                                                ) : (
                                                    <ArrowUpDown className="w-4 h-4 opacity-50" />
                                                )}
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="font-bold py-4 cursor-pointer hover:bg-muted/50 transition-colors"
                                            onClick={() => handleSort('faturaTarihi')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Tarih
                                                {sortConfig?.key === 'faturaTarihi' ? (
                                                    sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />
                                                ) : (
                                                    <ArrowUpDown className="w-4 h-4 opacity-50" />
                                                )}
                                            </div>
                                        </TableHead>
                                        <TableHead className="font-bold py-4">Mal/Hizmet</TableHead>
                                        <TableHead className="font-bold py-4 text-blue-600">Konteyner/Referans</TableHead>
                                        <TableHead className="font-bold py-4 text-green-600">Müşteri</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Miktar</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Birim Fiyat</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Tutar</TableHead>
                                        <TableHead className="font-bold py-4 text-right">KDV</TableHead>
                                        <TableHead className="font-bold py-4 text-right">KDV Tevkifat</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Vergili Toplam</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Genel Toplam</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedInvoices.length > 0 ? (
                                        sortedInvoices.map((inv) => (
                                            <TableRow
                                                key={inv.id}
                                                className="hover:bg-primary/5 transition-colors border-border/40 cursor-pointer"
                                                onClick={() => setSelectedInvoice(inv)}
                                            >
                                                <TableCell className="font-bold text-primary">{inv.faturaNo || "N/A"}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">{formatDate(inv.faturaTarihi)}</TableCell>
                                                <TableCell className="font-medium max-w-[200px] truncate">{inv.malHizmet || "-"}</TableCell>
                                                <TableCell className="font-mono text-blue-600 font-medium">{inv.konteynerler || extractContainerRef(inv.malHizmet)}</TableCell>
                                                <TableCell className="font-medium text-green-600 truncate max-w-[150px]">{inv.musteri || extractCustomer(inv.malHizmet)}</TableCell>
                                                <TableCell className="text-right font-mono">{formatCurrency(inv.miktar)}</TableCell>
                                                <TableCell className="text-right font-mono text-muted-foreground">{formatCurrency(inv.birimFiyat)}</TableCell>
                                                <TableCell className="text-right font-bold">{formatCurrency(inv.malHizmetToplamTutarı)}</TableCell>
                                                <TableCell className="text-right text-muted-foreground">{formatCurrency(inv.kdvTutarı)}</TableCell>
                                                <TableCell className="text-right text-orange-600/80">{formatCurrency(inv.hesaplananKdvTevkifat20)}</TableCell>
                                                <TableCell className="text-right text-muted-foreground">{formatCurrency(inv.vergilerDahilToplamTutar)}</TableCell>
                                                <TableCell className="text-right font-black text-foreground">{formatCurrency(inv.odenecekTutar)}</TableCell>
                                                <TableCell className="text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={(e) => handleDeleteInvoice(inv.id, e)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={11} className="h-40 text-center text-muted-foreground">
                                                <div className="flex flex-col items-center gap-2">
                                                    <AlertCircle className="w-10 h-10 opacity-20" />
                                                    <p>Henüz kayıtlı fatura bulunamadı.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Invoice Details Modal */}
            <Dialog open={!!selectedInvoice} onOpenChange={(open) => !open && setSelectedInvoice(null)}>
                <DialogContent className="max-w-2xl bg-card border-border/50 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <FileText className="w-5 h-5 text-primary" />
                            <span>Fatura Detayı</span>
                        </DialogTitle>
                    </DialogHeader>

                    {selectedInvoice && (
                        <div className="grid gap-6 py-4">
                            <div className="bg-muted/30 p-4 rounded-lg border border-border/50 flex flex-col sm:flex-row justify-between items-center gap-4">
                                <div className="flex flex-col items-center sm:items-start gap-1">
                                    <span className="text-xs font-bold text-muted-foreground uppercase">Fatura No</span>
                                    <span className="text-xl font-black font-mono text-primary tracking-tight">{selectedInvoice.faturaNo}</span>
                                </div>
                                <div className="h-8 w-px bg-border hidden sm:block"></div>
                                <div className="flex flex-col items-center sm:items-end gap-1">
                                    <span className="text-xs font-bold text-muted-foreground uppercase">Tarih</span>
                                    <span className="text-xl font-bold font-mono tracking-tight">{formatDate(selectedInvoice.faturaTarihi)}</span>
                                </div>
                            </div>

                            {/* Editable Fields */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/10 p-4 rounded-xl border border-border/50">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase text-muted-foreground">Müşteri</Label>
                                    <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={openCombobox}
                                                className="w-full justify-between font-normal"
                                            >
                                                {editMusteri
                                                    ? customers.find((c) => c === editMusteri) || editMusteri
                                                    : "Müşteri Seçiniz..."}
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
                                                                <Check
                                                                    className={cn(
                                                                        "mr-2 h-4 w-4",
                                                                        editMusteri === customer ? "opacity-100" : "opacity-0"
                                                                    )}
                                                                />
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
                                    <Input
                                        value={editKonteynerler}
                                        onChange={(e) => setEditKonteynerler(e.target.value)}
                                        placeholder="Konteyner no giriniz..."
                                        className="font-mono text-sm"
                                    />
                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> Birden fazla ise virgülle ayırın.
                                    </p>
                                </div>
                            </div>

                            {/* Full Description */}
                            <div className="space-y-2">
                                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Mal/Hizmet Açıklaması</h4>
                                <div className="p-4 bg-muted/50 rounded-lg text-sm leading-relaxed border border-border/50 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                                    {selectedInvoice.malHizmet}
                                </div>
                            </div>

                            {/* Financial Summary */}
                            <div className="bg-muted/30 rounded-lg p-4 border border-border/50 space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Miktar:</span>
                                    <span className="font-mono font-medium">{formatCurrency(selectedInvoice.miktar)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Birim Fiyat:</span>
                                    <span className="font-mono font-medium">{formatCurrency(selectedInvoice.birimFiyat)}</span>
                                </div>
                                <div className="h-px bg-border/50 my-2" />
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">Mal Hizmet Toplamı:</span>
                                    <span className="font-bold font-mono">{formatCurrency(selectedInvoice.malHizmetToplamTutarı)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">KDV Tutarı:</span>
                                    <span className="font-mono">{formatCurrency(selectedInvoice.kdvTutarı)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm text-orange-600">
                                    <span>Tevkifat:</span>
                                    <span className="font-mono">{formatCurrency(selectedInvoice.hesaplananKdvTevkifat20)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Vergili Toplam:</span>
                                    <span className="font-mono">{formatCurrency(selectedInvoice.vergilerDahilToplamTutar)}</span>
                                </div>
                                <div className="h-px bg-border my-2" />
                                <div className="flex justify-between items-center text-lg bg-primary/5 p-2 -mx-2 rounded">
                                    <span className="font-bold text-primary">Genel Toplam:</span>
                                    <span className="font-black font-mono text-foreground">{formatCurrency(selectedInvoice.odenecekTutar)} TVL</span>
                                </div>
                            </div>
                            <DialogFooter className="gap-2 mt-4">
                                <Button variant="outline" onClick={() => setSelectedInvoice(null)} disabled={updating}>Vazgeç</Button>
                                <Button onClick={handleUpdate} disabled={updating}>
                                    {updating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                    Değişiklikleri Kaydet
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div >
    );
}
