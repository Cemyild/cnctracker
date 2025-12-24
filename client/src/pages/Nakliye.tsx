import { useState, useEffect } from "react";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Database, FileSpreadsheet, RefreshCcw, Save, Trash2, History, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Nakliye() {
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [extractedData, setExtractedData] = useState<any[]>([]);
    const [savedInvoices, setSavedInvoices] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();

    // Fetch saved invoices on mount and setup polling
    useEffect(() => {
        fetchSavedInvoices();

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
                                {savedInvoices.length} Toplam Kayıt
                            </div>
                        </div>
                        <div className="relative overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow>
                                        <TableHead className="font-bold py-4">Fatura No</TableHead>
                                        <TableHead className="font-bold py-4">Tarih</TableHead>
                                        <TableHead className="font-bold py-4">Mal/Hizmet</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Miktar</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Birim Fiyat</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Tutar</TableHead>
                                        <TableHead className="font-bold py-4 text-right">KDV</TableHead>
                                        <TableHead className="font-bold py-4 text-right">KDV Tevkifat</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Vergili Toplam</TableHead>
                                        <TableHead className="font-bold py-4 text-right">Genel Toplam</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {savedInvoices.length > 0 ? (
                                        savedInvoices.map((inv) => (
                                            <TableRow key={inv.id} className="hover:bg-primary/5 transition-colors border-border/40">
                                                <TableCell className="font-bold text-primary">{inv.faturaNo || "N/A"}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">{inv.faturaTarihi || "-"}</TableCell>
                                                <TableCell className="font-medium max-w-[200px] truncate">{inv.malHizmet || "-"}</TableCell>
                                                <TableCell className="text-right font-mono">{inv.miktar || "0"}</TableCell>
                                                <TableCell className="text-right font-mono text-muted-foreground">{inv.birimFiyat || "0"}</TableCell>
                                                <TableCell className="text-right font-bold">{inv.malHizmetToplamTutarı || "0"}</TableCell>
                                                <TableCell className="text-right text-muted-foreground">{inv.kdvTutarı || "0"}</TableCell>
                                                <TableCell className="text-right text-orange-600/80">{inv.hesaplananKdvTevkifat20 || "0"}</TableCell>
                                                <TableCell className="text-right text-muted-foreground">{inv.vergilerDahilToplamTutar || "0"}</TableCell>
                                                <TableCell className="text-right font-black text-foreground">{inv.odenecekTutar || "0"}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-40 text-center text-muted-foreground">
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
        </div>
    );
}
