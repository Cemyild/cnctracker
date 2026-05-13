import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Upload, Search, FileSpreadsheet, ArrowRightLeft, Save, Trash2, Filter, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Link, MousePointerClick, Download } from "lucide-react";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils"; // Assuming this exists or I should use Intl directly
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type MatchStatus = 'matched' | 'amount_mismatch' | 'missing' | 'pending';

interface PolicyRow {
    id: number;
    policyNo: string;
    amount: number;
    raw: any;
    status: MatchStatus;
    matchDetails?: string;
    // New fields for DB
    brans?: string;
    sigortali?: string;
    tanzimTarihi?: string;
    netPrim?: number;
    brutPrim?: number;
    komisyon?: number;
    sigortaBedeli?: number;
}

interface CompanyData {
    policyFile: File | null;
    accountingFile: File | null;
    policies: PolicyRow[];
    accountingData: any[];
    isAnalyzed: boolean;
}

const COMPANIES = {
    MAPFRE: 'Mapfre',
    RAY: 'Ray Sigorta'
};

// Bu firmalar için kesilen poliçeler 0-değerli olduğundan muhasebede hiç
// görünmez; otomatik "EVET" sayılırlar. Yeni firma eklemek için sadece
// alt-kase, TR karaktersiz bir anahtar kelime ekle — substring eşleşir.
const AUTO_EVET_FIRMS_KEYWORDS = ["feka", "promedis"];

const normalizeFirmName = (s: any): string =>
    String(s || "")
        .toLowerCase()
        .replace(/ş/g, "s").replace(/ı/g, "i").replace(/ğ/g, "g")
        .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
        .replace(/[^a-z0-9]/g, "");

const isAutoEvetFirm = (sigortali: any): boolean => {
    const norm = normalizeFirmName(sigortali);
    return AUTO_EVET_FIRMS_KEYWORDS.some(k => norm.includes(k));
};

const AYLAR = [
    { value: "1", label: "Ocak" },
    { value: "2", label: "Şubat" },
    { value: "3", label: "Mart" },
    { value: "4", label: "Nisan" },
    { value: "5", label: "Mayıs" },
    { value: "6", label: "Haziran" },
    { value: "7", label: "Temmuz" },
    { value: "8", label: "Ağustos" },
    { value: "9", label: "Eylül" },
    { value: "10", label: "Ekim" },
    { value: "11", label: "Kasım" },
    { value: "12", label: "Aralık" }
];

const YILLAR = [2024, 2025, 2026];

export default function Sigorta() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [mainTab, setMainTab] = useState("ozet");
    
    const [selectedYear, setSelectedYear] = useState<number>(2025);
    const [selectedMonth, setSelectedMonth] = useState<string>("toplam");

    return (
        <div className="relative min-h-full">
            <BackgroundPaths />
            <div className="relative z-10 p-6 lg:p-8 space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Sigorta Yönetimi</h2>
                        <p className="text-muted-foreground mt-1">
                            Sigorta poliçeleri, mutabakat ve performans takibi.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                             <SelectTrigger className="w-[120px]">
                                 <SelectValue placeholder="Yıl" />
                             </SelectTrigger>
                             <SelectContent>
                                 {YILLAR.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                             </SelectContent>
                        </Select>
                        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                            <SelectTrigger className="w-[150px]">
                                <SelectValue placeholder="Ay" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="toplam">Tüm Yıl</SelectItem>
                                {AYLAR.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Tabs defaultValue="ozet" value={mainTab} onValueChange={setMainTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-4 max-w-[760px]">
                        <TabsTrigger value="ozet">Özet</TabsTrigger>
                        <TabsTrigger value="liste">Poliçe Listesi</TabsTrigger>
                        <TabsTrigger value="aging">Yaşlandırma</TabsTrigger>
                        <TabsTrigger value="yukleme">Veri Yükleme</TabsTrigger>
                    </TabsList>

                    <TabsContent value="ozet" className="mt-6">
                        <SigortaOzet yil={selectedYear} ay={selectedMonth} />
                    </TabsContent>

                    <TabsContent value="liste" className="mt-6">
                        <PoliceListesi yil={selectedYear} ay={selectedMonth} />
                    </TabsContent>

                    <TabsContent value="aging" className="mt-6">
                        <SigortaAging yil={selectedYear} ay={selectedMonth} />
                    </TabsContent>

                    <TabsContent value="yukleme" className="mt-6">
                        <VeriYukleme yil={selectedYear} globalAy={selectedMonth} />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 1. ÖZET TAB COMPONENT
// ---------------------------------------------------------------------------
function SigortaOzet({ yil, ay }: { yil: number, ay: string }) {
    const { data: ozet } = useQuery({
        queryKey: ['sigorta-ozet', yil],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/sigorta/ozet/${yil}`);
            return res.json();
        }
    });

    // Filter by month if selected
    const filteredOzet = ay === 'toplam' ? ozet : ozet?.filter((o: any) => o.ay === ay);

    const stats = filteredOzet?.reduce((acc: any, curr: any) => ({
        toplamPrim: acc.toplamPrim + (curr.toplamPrim || 0),
        toplamKomisyon: acc.toplamKomisyon + (curr.toplamKomisyon || 0),
        toplamBedel: acc.toplamBedel + (curr.toplamBedel || 0),
        policeSayisi: acc.policeSayisi + (curr.policeSayisi || 0),
        evetSayisi: acc.evetSayisi + (curr.evetSayisi || 0),
        tutarFarkiSayisi: acc.tutarFarkiSayisi + (curr.tutarFarkiSayisi || 0),
    }), { toplamPrim: 0, toplamKomisyon: 0, toplamBedel: 0, policeSayisi: 0, evetSayisi: 0, tutarFarkiSayisi: 0 })
    || { toplamPrim: 0, toplamKomisyon: 0, toplamBedel: 0, policeSayisi: 0, evetSayisi: 0, tutarFarkiSayisi: 0 };

    const dekontOrani = stats.policeSayisi > 0
        ? ((stats.evetSayisi / stats.policeSayisi) * 100).toFixed(1)
        : "0.0";

    const fmtPara = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n);

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Toplam Net Prim</CardTitle>
                        <Upload className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{fmtPara(stats.toplamPrim)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium">Toplam Komisyon</CardTitle>
                         <Upload className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                         <div className="text-2xl font-bold">{fmtPara(stats.toplamKomisyon)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Sigorta Bedeli (Risk)</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{fmtPara(stats.toplamBedel)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Poliçe Adedi</CardTitle>
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.policeSayisi}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {stats.evetSayisi} dekont • {stats.tutarFarkiSayisi} tutar farkı
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Dekont Oranı</CardTitle>
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">% {dekontOrani}</div>
                        <div className="text-xs text-muted-foreground mt-1">tahsil edilmiş</div>
                    </CardContent>
                </Card>
            </div>
            
            {/* Charts or Detailed Lists could go here */}
            {/* Companies Data Aggregated */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Şirket Bazlı Detay</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Şirket</TableHead>
                                    <TableHead className="text-right">Prim</TableHead>
                                    <TableHead className="text-right">Komisyon</TableHead>
                                    <TableHead className="text-right">Adet</TableHead>
                                    <TableHead className="text-right">Dekont %</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOzet?.reduce((acc: any[], curr: any) => {
                                    const existing = acc.find(x => x.sirket === curr.sirket);
                                    if (existing) {
                                        existing.toplamPrim += curr.toplamPrim;
                                        existing.toplamKomisyon += curr.toplamKomisyon;
                                        existing.policeSayisi += curr.policeSayisi;
                                        existing.evetSayisi += (curr.evetSayisi || 0);
                                    } else {
                                        acc.push({...curr, evetSayisi: curr.evetSayisi || 0});
                                    }
                                    return acc;
                                }, []).map((row: any) => {
                                    const pct = row.policeSayisi > 0 ? ((row.evetSayisi / row.policeSayisi) * 100).toFixed(0) : "0";
                                    return (
                                        <TableRow key={row.sirket}>
                                            <TableCell className="font-medium">{row.sirket}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(row.toplamPrim)}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(row.toplamKomisyon)}</TableCell>
                                            <TableCell className="text-right">{row.policeSayisi}</TableCell>
                                            <TableCell className="text-right">% {pct}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {(!filteredOzet || filteredOzet.length === 0) && (
                                     <TableRow><TableCell colSpan={5} className="text-center h-12">Veri yok</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// 2. POLİÇE LİSTESİ TAB COMPONENT
// ---------------------------------------------------------------------------
function PoliceListesi({ yil, ay }: { yil: number, ay: string }) {
    const [subTab, setSubTab] = useState("mapfre");
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'policeNo', direction: 'asc' });

    // Filters
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [sigortaliFilter, setSigortaliFilter] = useState("");
    const [bransFilter, setBransFilter] = useState("ALL");

    // Tıkla → eşleşen muhasebe kayıtlarını göster
    const [selectedPolicy, setSelectedPolicy] = useState<any | null>(null);
    const { data: matchedMuhasebe, isLoading: matchedLoading } = useQuery({
        queryKey: ['sigorta-muhasebe-by-police', selectedPolicy?.id],
        queryFn: async () => {
            if (!selectedPolicy?.id) return [];
            const res = await apiRequest("GET", `/api/sigorta/muhasebe/by-police/${selectedPolicy.id}`);
            return res.json();
        },
        enabled: !!selectedPolicy?.id,
    });

    const queryKey = ['sigorta-policeler', subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY, ay, yil];
    
    const { data: policeler, isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
             const companyName = subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY;
             let url = `/api/sigorta/policeler?sirket=${encodeURIComponent(companyName)}&yil=${yil}`;
             if (ay !== 'toplam') url += `&ay=${ay}`;
             const res = await apiRequest("GET", url);
             return res.json();
        }
    });

    const sortedPoliceler = useMemo(() => {
        if (!policeler) return [];
        let sorted = [...policeler];

        // 1. Filter (statü bazlı)
        if (statusFilter !== "ALL") {
            sorted = sorted.filter((p: any) => {
                if (statusFilter === "EVET") return p.dekontDurumu === "EVET";
                if (statusFilter === "TUTAR_FARKI") return p.dekontDurumu === "TUTAR FARKI";
                // HAYIR → EVET ve TUTAR FARKI dışındaki her şey (null/boş dahil)
                if (statusFilter === "HAYIR") return p.dekontDurumu !== "EVET" && p.dekontDurumu !== "TUTAR FARKI";
                return true;
            });
        }

        if (sigortaliFilter) {
            const search = sigortaliFilter.toLowerCase();
            sorted = sorted.filter((p: any) =>
                p.sigortali?.toLowerCase().includes(search) ||
                p.policeNo?.includes(search)
            );
        }

        if (bransFilter !== "ALL") {
            sorted = sorted.filter((p: any) => (p.brans || "").trim() === bransFilter);
        }

        // 2. Sort
        sorted.sort((a, b) => {
            if (sortConfig.key === 'policeNo') {
                // Try numeric sort if possible, else string
                const aNum = parseInt(a.policeNo.replace(/\D/g, ''));
                const bNum = parseInt(b.policeNo.replace(/\D/g, ''));
                if (!isNaN(aNum) && !isNaN(bNum)) {
                     return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
                }
                return sortConfig.direction === 'asc' 
                    ? a.policeNo.localeCompare(b.policeNo)
                    : b.policeNo.localeCompare(a.policeNo);
            }
            if (sortConfig.key === 'tanzimTarihi') {
                // Parse DD.MM.YYYY
                const parseDate = (d: string) => {
                    const parts = d.split('.');
                    if (parts.length !== 3) return 0;
                    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
                };
                const aTime = parseDate(a.tanzimTarihi || "");
                const bTime = parseDate(b.tanzimTarihi || "");
                return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
            }
            return 0;
        });
        return sorted;
    }, [policeler, sortConfig, statusFilter, sigortaliFilter, bransFilter]);

    const uniqueBranslar = useMemo(() => {
        if (!policeler) return [];
        const set = new Set<string>();
        for (const p of policeler) {
            const b = (p.brans || "").trim();
            if (b) set.add(b);
        }
        return Array.from(set).sort();
    }, [policeler]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4" />;
        if (sortConfig.direction === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
        return <ArrowDown className="ml-2 h-4 w-4" />;
    };

    const handleExport = async () => {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Poliçeler');
        const sirketName = subTab === 'mapfre' ? 'Mapfre' : 'Ray';

        // 1. Report Title (Merged Rows 1-3)
        worksheet.mergeCells('A1:I3');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `${sirketName} SİGORTA POLİÇE LİSTESİ - ${yil}`;
        titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FF2C3E50' } }; // Dark Blue-Grey
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        
        // 2. Define Headers (Row 4)
        const headerTerms = [
            { header: 'Branş', key: 'brans', width: 10 },
            { header: 'Poliçe No', key: 'policeNo', width: 25 },
            { header: 'Sigortalı', key: 'sigortali', width: 45 },
            { header: 'Tanzim Tarihi', key: 'tanzimTarihi', width: 16 },
            { header: 'Net Prim', key: 'netPrim', width: 18 },
            { header: 'Brüt Prim', key: 'brutPrim', width: 18 },
            { header: 'Komisyon', key: 'komisyon', width: 18 },
            { header: 'Sigorta Bedeli', key: 'sigortaBedeli', width: 22 },
            { header: 'Dekont', key: 'dekontDurumu', width: 15 },
        ];

        // We set proper keys/headers but we will manually style Row 4 as header
        worksheet.getRow(4).values = headerTerms.map(h => h.header);
        worksheet.columns = headerTerms.map(h => ({ key: h.key, width: h.width })); // Map column keys for data insertion

        const headerRow = worksheet.getRow(4);
        headerRow.height = 35;
        headerRow.eachCell((cell) => {
            cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }; // White Text
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1F4E78' } // Deep Blue Background
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = {
                bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } }, // White separator
                right: { style: 'thin', color: { argb: 'FF5DADE2' } } // Lighter blue separator
            };
        });

        // 3. Add Data with Zebra Striping
        let totalNet = 0, totalBrut = 0, totalKom = 0, totalBedel = 0;

        sortedPoliceler.forEach((p: any, index: number) => {
            // Calculate totals
            const net = parseFloat(p.netPrim) || 0;
            const brut = parseFloat(p.brutPrim) || 0;
            const kom = parseFloat(p.komisyon) || 0;
            const bedel = parseFloat(p.sigortaBedeli) || 0;
            
            totalNet += net;
            totalBrut += brut;
            totalKom += kom;
            totalBedel += bedel;

            const row = worksheet.addRow({
                brans: p.brans,
                policeNo: p.policeNo,
                sigortali: p.sigortali,
                tanzimTarihi: p.tanzimTarihi,
                netPrim: net,
                brutPrim: brut,
                komisyon: kom,
                sigortaBedeli: bedel,
                dekontDurumu: p.dekontDurumu === 'EVET' ? 'EVET' : (p.dekontDurumu === 'HAYIR' ? 'HAYIR' : 'HAYIR')
            });

            row.height = 24; // Comfortable height
            
            // Zebra Striping (Even rows get light background)
            if (index % 2 === 1) {
                row.eachCell({ includeEmpty: true }, (cell) => {
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF2F4F8' } // Very Light Blue-Grey
                    };
                });
            }

            // Cell Styles
            const centerCols = ['brans', 'tanzimTarihi'];
            const moneyCols = ['netPrim', 'brutPrim', 'komisyon', 'sigortaBedeli'];

            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                const colKey = headerTerms[colNumber - 1].key;
                
                cell.font = { name: 'Arial', size: 10, color: { argb: 'FF333333' } }; // Dark Grey Text
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'FFE5E8E8' } }, // Very subtle border
                    right: { style: 'dotted', color: { argb: 'FFE5E8E8' } }
                };
                
                // Alignment
                if (colKey === 'policeNo') {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' }; // Centered as requested
                    cell.font = { ...cell.font, bold: true };
                    (cell as any).ignoredErrors = { numberStoredAsText: true };
                } else if (colKey === 'brans') {
                    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                    (cell as any).ignoredErrors = { numberStoredAsText: true };
                } else if (centerCols.includes(colKey)) {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else if (moneyCols.includes(colKey)) {
                    cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    cell.numFmt = '#,##0.00 "₺"';
                    cell.font = { ...cell.font, name: 'Consolas' }; // Monospace for numbers looks professional
                } else if (colKey === 'dekontDurumu') {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                } else {
                    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
                }

                // Status Badge Fill Effect
                if (colKey === 'dekontDurumu') {
                     if (cell.value === 'EVET') {
                         cell.fill = {
                             type: 'pattern',
                             pattern: 'solid',
                             fgColor: { argb: 'FFC6EFCE' } // Light Green Fill
                         };
                         cell.font = { color: { argb: 'FF006100' }, bold: true }; // Dark Green Text
                     } else {
                         cell.fill = {
                             type: 'pattern',
                             pattern: 'solid',
                             fgColor: { argb: 'FFFFC7CE' } // Light Red Fill
                         };
                         cell.font = { color: { argb: 'FF9C0006' }, bold: true }; // Dark Red Text
                     }
                }
            });
        });

        // 5. Totals Row
        const totalRow = worksheet.addRow({
            sigortali: 'GENEL TOPLAM',
            netPrim: totalNet,
            brutPrim: totalBrut,
            komisyon: totalKom,
            sigortaBedeli: totalBedel
        });
        
        totalRow.height = 30;
        totalRow.eachCell((cell, colNumber) => {
            cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEBF5FB' } }; // Light Blue Header-match
            cell.border = { top: { style: 'double' } };
            
            const colKey = headerTerms[colNumber - 1]?.key;
            if (['netPrim', 'brutPrim', 'komisyon', 'sigortaBedeli'].includes(colKey || '')) {
                cell.numFmt = '#,##0.00 "₺"';
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (colKey === 'sigortali') {
                cell.alignment = { vertical: 'middle', horizontal: 'right' };
            }
        });



        // Generate Buffer and Save
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `${sirketName}_Policeler_${yil}_${ay}.xlsx`);
    };

    // Calculate summary stats (EVET / HAYIR / TUTAR FARKI)
    const stats = useMemo(() => {
        let evet = 0, hayir = 0, tutarFarki = 0;
        sortedPoliceler.forEach((p: any) => {
            if (p.dekontDurumu === 'EVET') evet++;
            else if (p.dekontDurumu === 'TUTAR FARKI') tutarFarki++;
            else hayir++;
        });
        return { evet, hayir, tutarFarki };
    }, [sortedPoliceler]);

    return (
        <div className="space-y-4">
             <Tabs defaultValue="mapfre" value={subTab} onValueChange={setSubTab} className="w-full">
                <TabsList>
                    <TabsTrigger value="mapfre">Mapfre Sigorta</TabsTrigger>
                    <TabsTrigger value="ray">Ray Sigorta</TabsTrigger>
                </TabsList>
            </Tabs>

            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                         <div className="flex items-center gap-4">
                            <CardTitle>{subTab === 'mapfre' ? 'Mapfre' : 'Ray'} Poliçeleri</CardTitle>
                            <Badge variant="outline">{sortedPoliceler.length} kayıt</Badge>
                            
                            {/* Summary Badges */}
                            <div className="flex gap-2">
                                <Badge className="bg-green-600 hover:bg-green-700 text-white gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    {stats.evet} Dekont Edilen
                                </Badge>
                                <Badge className="bg-red-600 hover:bg-red-700 text-white gap-1">
                                    <XCircle className="h-3 w-3" />
                                    {stats.hayir} Dekont Edilmeyen
                                </Badge>
                                {stats.tutarFarki > 0 && (
                                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        {stats.tutarFarki} Tutar Farkı
                                    </Badge>
                                )}
                            </div>
                         </div>
                         <Button variant="outline" size="sm" onClick={handleExport}>
                             <Download className="w-4 h-4 mr-2" />
                             Excel İndir
                         </Button>
                    </div>
                    
                    {/* FILTERS */}
                    <div className="flex gap-4 mt-4 items-center flex-wrap">
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Filtrele:</span>
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[170px] h-9">
                                <SelectValue placeholder="Dekont Durumu" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Tümü</SelectItem>
                                <SelectItem value="EVET">Dekont Evet</SelectItem>
                                <SelectItem value="HAYIR">Dekont Hayır</SelectItem>
                                <SelectItem value="TUTAR_FARKI">Tutar Farkı</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={bransFilter} onValueChange={setBransFilter}>
                            <SelectTrigger className="w-[170px] h-9">
                                <SelectValue placeholder="Branş" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Tüm Branşlar</SelectItem>
                                {uniqueBranslar.map((b) => (
                                    <SelectItem key={b} value={b}>{b}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Input
                            placeholder="Sigortalı / Poliçe No Ara..."
                            className="w-[250px] h-9"
                            value={sigortaliFilter}
                            onChange={(e) => setSigortaliFilter(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Branş</TableHead>
                                    <TableHead>
                                        <Button variant="ghost" onClick={() => requestSort('policeNo')}>
                                            Poliçe No
                                            <SortIcon column="policeNo" />
                                        </Button>
                                    </TableHead>
                                    <TableHead>Sigortalı</TableHead>
                                    <TableHead>
                                        <Button variant="ghost" onClick={() => requestSort('tanzimTarihi')}>
                                            Tanzim Tarihi
                                            <SortIcon column="tanzimTarihi" />
                                        </Button>
                                    </TableHead>
                                    <TableHead className="text-right">Net Prim</TableHead>
                                    <TableHead className="text-right">Brüt Prim</TableHead>
                                    <TableHead className="text-right">Komisyon</TableHead>
                                    <TableHead className="text-right">Sigorta Bedeli</TableHead>
                                    <TableHead className="text-center">Dekont</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-24 text-center">Yükleniyor...</TableCell>
                                    </TableRow>
                                ) : sortedPoliceler.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-24 text-center">Kayıt bulunamadı.</TableCell>
                                    </TableRow>
                                ) : (
                                    <>
                                    {sortedPoliceler.length > 500 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-xs text-amber-700 bg-amber-50">
                                                ⚠ Performans için yalnızca ilk 500 kayıt gösteriliyor. Toplam {sortedPoliceler.length} kayıt — daraltmak için filtre kullanın veya Excel olarak indirin.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {sortedPoliceler.slice(0, 500).map((p: any) => (
                                        <TableRow
                                            key={p.id}
                                            onClick={() => setSelectedPolicy(p)}
                                            className="cursor-pointer hover:bg-muted/50"
                                            title="Detay için tıkla"
                                        >
                                            <TableCell>{p.brans}</TableCell>
                                            <TableCell className="font-medium">{p.policeNo}</TableCell>
                                            <TableCell>{p.sigortali}</TableCell>
                                            <TableCell>{p.tanzimTarihi}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.netPrim))}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.brutPrim))}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.komisyon))}</TableCell>
                                            <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.sigortaBedeli))}</TableCell>
                                            <TableCell className="text-center">
                                                {p.dekontDurumu === 'EVET' ? (
                                                    <Badge className="bg-green-500">EVET</Badge>
                                                ) : p.dekontDurumu === 'TUTAR FARKI' ? (
                                                    <Badge variant="destructive">FARKLILIK</Badge>
                                                ) : (
                                                    <Badge className="bg-red-500 hover:bg-red-600 text-white">HAYIR</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    </>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <PoliceMuhasebeDialog
                policy={selectedPolicy}
                muhasebe={matchedMuhasebe}
                loading={matchedLoading}
                onClose={() => setSelectedPolicy(null)}
            />

        </div>
    );
}

// Poliçeye tıklayınca eşleşen muhasebe satırlarını gösteren modal.
// brut_prim ile borç/alacak farkını görsel olarak vurgular — TUTAR FARKI durumunda
// kullanıcı manuel teyit yapabilir.
function PoliceMuhasebeDialog({ policy, muhasebe, loading, onClose }: {
    policy: any | null;
    muhasebe: any[] | undefined;
    loading: boolean;
    onClose: () => void;
}) {
    if (!policy) return null;

    const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n);
    const policyBrut = parseFloat(policy.brutPrim || "0");

    const muhasebeTotalAmount = (muhasebe || []).reduce((acc, m) => {
        const b = parseFloat(m.borc || "0");
        const a = parseFloat(m.alacak || "0");
        return acc + (b > 0 ? b : a);
    }, 0);
    const fark = muhasebeTotalAmount - policyBrut;

    return (
        <Dialog open={!!policy} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Eşleşen Muhasebe Kayıtları</DialogTitle>
                    <DialogDescription>
                        Poliçe <span className="font-mono font-semibold">{policy.policeNo}</span> — {policy.sigortali}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-3 gap-3 mt-2">
                    <Card>
                        <CardContent className="pt-4">
                            <div className="text-xs text-muted-foreground">Poliçe Brüt Primi</div>
                            <div className="text-lg font-semibold">{fmt(policyBrut)} ₺</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="text-xs text-muted-foreground">Muhasebe Toplamı</div>
                            <div className="text-lg font-semibold">{fmt(muhasebeTotalAmount)} ₺</div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-4">
                            <div className="text-xs text-muted-foreground">Fark</div>
                            <div className={`text-lg font-semibold ${Math.abs(fark) < 1 ? 'text-green-600' : 'text-red-600'}`}>
                                {fark >= 0 ? '+' : ''}{fmt(fark)} ₺
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="mt-2">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tarih</TableHead>
                                <TableHead>Belge No</TableHead>
                                <TableHead>Açıklama</TableHead>
                                <TableHead className="text-right">Borç</TableHead>
                                <TableHead className="text-right">Alacak</TableHead>
                                <TableHead className="text-right">Bakiye</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="text-center h-16">Yükleniyor…</TableCell></TableRow>
                            ) : (muhasebe || []).length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center h-16 text-muted-foreground">Bu poliçeyle eşleşmiş muhasebe kaydı yok.</TableCell></TableRow>
                            ) : (
                                (muhasebe || []).map((m: any) => (
                                    <TableRow key={m.id}>
                                        <TableCell>{m.tarih}</TableCell>
                                        <TableCell className="font-mono text-xs">{m.belgeNo}</TableCell>
                                        <TableCell className="max-w-[220px] truncate" title={m.aciklama}>{m.aciklama}</TableCell>
                                        <TableCell className="text-right">{fmt(parseFloat(m.borc || "0"))}</TableCell>
                                        <TableCell className="text-right">{fmt(parseFloat(m.alacak || "0"))}</TableCell>
                                        <TableCell className="text-right">{fmt(parseFloat(m.bakiye || "0"))}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Kapat</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ---------------------------------------------------------------------------
// 3. VERİ YÜKLEME TAB COMPONENT
// ---------------------------------------------------------------------------
function VeriYukleme({ yil, globalAy }: { yil: number; globalAy: string }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [subTab, setSubTab] = useState("mapfre");
    // "auto" → Excel tarih sütunundan tespit (default davranış).
    // Belirli bir ay seçilirse, tarih kolonu okunamayan satırlar için fallback olarak kullanılır.
    const [ayOverride, setAyOverride] = useState<string>(globalAy === "toplam" ? "auto" : globalAy);
    // Ray cutoff manuel override — auto-detect (gap detection) çalışmazsa
    // veya kullanıcı kesin bir sınır biliyorsa buraya yazar (örn. 1494789982).
    const [rayCutoffOverride, setRayCutoffOverride] = useState<string>("");

    // Fetch existing policies from DB for the selected company and year
    // This serves as the "Combined List" mentioned by the user
    const { data: storedPolicies, isLoading, refetch } = useQuery({
        queryKey: ['sigorta-policeler-yukleme', subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY, yil],
        queryFn: async () => {
             const companyName = subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY;
             const res = await apiRequest("GET", `/api/sigorta/policeler?sirket=${encodeURIComponent(companyName)}&yil=${yil}`);
             return res.json();
        }
    });
    
    // Sort Config
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'policeNo', direction: 'asc' });

    const [processing, setProcessing] = useState(false);
    const [unmatchedRecords, setUnmatchedRecords] = useState<any[]>([]);

    // Enhanced Filters & Selection (Moved from Sigorta)
    const [statusFilter, setStatusFilter] = useState<"ALL" | "EVET" | "HAYIR">("ALL");
    const [sigortaliFilter, setSigortaliFilter] = useState<string>("");
    const [selectedPolicies, setSelectedPolicies] = useState<number[]>([]);
    
    // Matching Modal State
    const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
    const [selectedUnmatchedRecord, setSelectedUnmatchedRecord] = useState<any>(null);
    const [matchSearchQuery, setMatchSearchQuery] = useState("");
    const [matchSortBy, setMatchSortBy] = useState<"sigortali" | "brutPrim">("sigortali");
    const [rematchProcessing, setRematchProcessing] = useState(false);

    // Fetch Accounting Records (Muhasebe)
    const { data: storedMuhasebe, refetch: refetchMuhasebe } = useQuery({
        queryKey: ['sigorta-muhasebe', subTab, yil],
        queryFn: async () => {
             const companyName = subTab === 'mapfre' ? COMPANIES.MAPFRE : COMPANIES.RAY;
             const res = await apiRequest("GET", `/api/sigorta/muhasebe?sirket=${encodeURIComponent(companyName)}&yil=${yil}`);
             return res.json();
        }
    });

    // Unmatched Records derived from DB
    const unmatchedRecordsList = useMemo(() => {
        if (!storedMuhasebe) return [];
        return storedMuhasebe.filter((m: any) => m.eslestiMi === 0);
    }, [storedMuhasebe]);

    // Filtered Policies for Display
    const filteredPolicies = useMemo(() => {
        if (!storedPolicies) return [];
        return storedPolicies.filter((p: any) => {
             // 1. Status Filter
             if (statusFilter === 'EVET' && p.dekontDurumu !== 'EVET') return false;
             if (statusFilter === 'HAYIR' && p.dekontDurumu === 'EVET') return false;
             // 2. Company Filter (Implicit via subTab)
             const companyName = subTab === 'mapfre' ? COMPANIES.MAPFRE : COMPANIES.RAY;
             if (p.sirket !== companyName) return false;
             // 3. Sigortali Filter
             if (sigortaliFilter && !String(p.sigortali).toLowerCase().includes(sigortaliFilter.toLowerCase())) return false;

             return true;
        }).sort((a: any, b: any) => {
            if (sortConfig.key === 'policeNo') {
                 const aNum = parseInt(a.policeNo.replace(/\D/g, ''));
                 const bNum = parseInt(b.policeNo.replace(/\D/g, ''));
                 if (!isNaN(aNum) && !isNaN(bNum)) {
                      return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
                 }
                 return sortConfig.direction === 'asc' 
                     ? a.policeNo.localeCompare(b.policeNo)
                     : b.policeNo.localeCompare(a.policeNo);
            }
            if (sortConfig.key === 'sigortali') {
                 return sortConfig.direction === 'asc'
                     ? String(a.sigortali).localeCompare(String(b.sigortali))
                     : String(b.sigortali).localeCompare(String(a.sigortali));
            }
            if (sortConfig.key === 'tanzimTarihi') {
                 const parseDate = (d: string) => {
                     if (!d) return 0;
                     const parts = d.split('.');
                     if (parts.length !== 3) return 0;
                     return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
                 };
                 const aTime = parseDate(a.tanzimTarihi);
                 const bTime = parseDate(b.tanzimTarihi);
                 return sortConfig.direction === 'asc' ? aTime - bTime : bTime - aTime;
            }
            return 0;
        });
    }, [storedPolicies, statusFilter, subTab, sigortaliFilter, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="ml-2 h-4 w-4" />;
        if (sortConfig.direction === 'asc') return <ArrowUp className="ml-2 h-4 w-4" />;
        return <ArrowDown className="ml-2 h-4 w-4" />;
    };

    // Reset selection when tab changes
    useEffect(() => {
        setSelectedPolicies([]);
        setStatusFilter("ALL");
    }, [subTab]);

    // Tekrar Eşleştir — eşleşmeyen muhasebe kayıtlarını mevcut poliçe listesine
    // karşı yeniden tarar. Use case: kullanıcı önce muhasebeyi yükledi, sonra
    // poliçeleri yükledi → otomatik akış zaten kapanmış, manuel buton gerek.
    // Mantık: VeriYukleme akışındaki matching ile aynı (exact + Ray suffix).
    const handleRematchUnmatched = async () => {
        if (!storedPolicies || storedPolicies.length === 0) {
            toast({ variant: "destructive", title: "Hata", description: "Önce poliçe listesi yüklenmeli." });
            return;
        }
        if (!unmatchedRecordsList || unmatchedRecordsList.length === 0) {
            toast({ title: "Bilgi", description: "Eşleşmeyen kayıt yok." });
            return;
        }

        setRematchProcessing(true);
        try {
            const isMapfre = subTab === 'mapfre';
            const policyMap = new Map<string, any>();
            const mapfreSuffixMap = new Map<string, any[]>();
            storedPolicies.forEach((p: any) => {
                const norm = String(p.policeNo).replace(/[^a-zA-Z0-9]/g, "");
                policyMap.set(norm, p);
                if (isMapfre && norm.startsWith('21025')) {
                    const rawSuffix = norm.slice(5);
                    if (rawSuffix.length > 0) {
                        const suffix = String(parseInt(rawSuffix));
                        if (!mapfreSuffixMap.has(suffix)) mapfreSuffixMap.set(suffix, []);
                        mapfreSuffixMap.get(suffix)?.push(p);
                    }
                }
            });

            const matches: Array<{ muhasebeId: string; policyId: string }> = [];
            for (const rec of unmatchedRecordsList) {
                const accNo = String(rec.belgeNo || "").replace(/[^a-zA-Z0-9]/g, "");
                const accAmount = parseFloat(rec.alacak || "0");
                if (!accNo) continue;

                let matched: any = null;
                if (isMapfre) {
                    if (policyMap.has(accNo)) {
                        matched = policyMap.get(accNo);
                    } else {
                        const suffixKey = String(parseInt(accNo));
                        const cand = mapfreSuffixMap.get(suffixKey);
                        if (cand && cand.length === 1) matched = cand[0];
                        else if (cand && cand.length > 1) {
                            const close = cand.filter((p: any) => Math.abs(parseFloat(p.brutPrim) - accAmount) < 1.0);
                            if (close.length === 1) matched = close[0];
                        }
                    }
                } else {
                    if (policyMap.has(accNo)) {
                        matched = policyMap.get(accNo);
                    } else if (accNo.length >= 4 && accNo.length <= 8) {
                        const cand = storedPolicies.filter((p: any) => {
                            const norm = String(p.policeNo).replace(/\D/g, "");
                            return norm.endsWith(accNo);
                        });
                        if (cand.length === 1) matched = cand[0];
                        else if (cand.length > 1) {
                            const close = cand.filter((p: any) => {
                                const pBrut = parseFloat(p.brutPrim);
                                return Math.abs(pBrut - accAmount) < Math.max(1, pBrut * 0.01);
                            });
                            if (close.length === 1) matched = close[0];
                        }
                    }
                }

                if (matched) matches.push({ muhasebeId: rec.id, policyId: matched.id });
            }

            if (matches.length === 0) {
                toast({ title: "Eşleşme bulunamadı", description: "Mevcut poliçe listesinde eşleşen kayıt yok." });
                setRematchProcessing(false);
                return;
            }

            // Paralel PATCH — match endpoint hem muhasebe hem poliçeyi günceller
            await Promise.all(matches.map(m =>
                apiRequest("PUT", `/api/sigorta/muhasebe/${m.muhasebeId}/match`, {
                    eslestiMi: true,
                    eslesenPolicyId: m.policyId,
                })
            ));

            refetch();
            refetchMuhasebe();
            queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
            queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
            queryClient.invalidateQueries({ queryKey: ['sigorta-muhasebe'] });
            toast({
                title: "Eşleştirme Tamamlandı",
                description: `${matches.length} muhasebe kaydı eşleştirildi.`,
            });
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Hata", description: "Yeniden eşleştirme sırasında hata oluştu." });
        } finally {
            setRematchProcessing(false);
        }
    };

    // Bulk Update Handler — race-safe PATCH ile sadece dekontDurumu alanını gönderir.
    const handleBulkUpdate = async () => {
        if (selectedPolicies.length === 0) return;

        const confirmUpdate = window.confirm(`${selectedPolicies.length} adet poliçeyi 'EVET' olarak işaretlemek istediğinize emin misiniz?`);
        if (!confirmUpdate) return;

        try {
            const res = await apiRequest("PATCH", "/api/sigorta/policeler/dekont", {
                ids: selectedPolicies,
                dekontDurumu: "EVET",
            });
            const result = await res.json();

            if (result.success) {
                toast({ title: "Başarılı", description: `${result.count} poliçe güncellendi.` });
                setSelectedPolicies([]);
                refetch();
                queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
                queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
            }
        } catch (err) {
            console.error(err);
            toast({ variant: "destructive", title: "Hata", description: "Güncelleme sırasında hata oluştu." });
        }
    };

    // Helper functions
    const parseAmount = (val: any) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const str = String(val).trim();
        // Remove currency symbols if present (₺, TL, $)
        const cleanStr = str.replace(/[₺$€TL]/g, '').trim();
        
        // TR format: 1.234,56
        if (cleanStr.includes(',') && cleanStr.includes('.')) {
            if (cleanStr.lastIndexOf(',') > cleanStr.lastIndexOf('.')) {
                 // 1.234,56 -> remove dots, replace comma
                 return parseFloat(cleanStr.replace(/\./g, '').replace(',', '.'));
            } else {
                 // 1,234.56 -> remove comma
                 return parseFloat(cleanStr.replace(/,/g, ''));
            }
        } 
        if (cleanStr.includes(',')) return parseFloat(cleanStr.replace(',', '.'));
        return parseFloat(cleanStr);
    };

    // Helper to extract month from dates like "10.01.2025" or Excel serial date
    const formatExcelDate = (dateVal: any): string => {
        if (!dateVal) return "";
        // If Excel serial number (e.g. 45659)
        if (typeof dateVal === 'number') {
            const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const y = date.getFullYear();
            return `${d}.${m}.${y}`;
        }
        return String(dateVal);
    };

    // Helper to extract month from dates like "10.01.2025" or Excel serial date.
    // ayOverride !== "auto" ise tarih çözümlemesi başarısız olduğunda override'a düşer.
    const extractMonthAndYear = (dateVal: any): {ay: string, yil: number} => {
        const fallback = (): {ay: string, yil: number} =>
            ayOverride !== "auto" ? { ay: ayOverride, yil } : { ay: "1", yil };

        if (!dateVal) return fallback();

        if (typeof dateVal === 'number') {
            const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            return { ay: String(date.getMonth() + 1), yil: date.getFullYear() };
        }

        const dateStr = String(dateVal).trim();
        let parts = dateStr.split('.');
        if (parts.length > 1 && parts[1] && parts[2]) {
            return { ay: String(parseInt(parts[1])), yil: parseInt(parts[2]) };
        }

        parts = dateStr.split('-');
        if (parts.length > 1) {
            return { ay: String(parseInt(parts[1])), yil: parseInt(parts[0].length === 4 ? parts[0] : parts[2]) };
        }

        parts = dateStr.split('/');
        if (parts.length > 1 && parts[1] && parts[2]) {
            return { ay: String(parseInt(parts[1])), yil: parseInt(parts[2]) };
        }

        return fallback();
    };

    // ─────────────────────────────────────────────────────────────
    // Header-tabanlı kolon eşleme
    // ─────────────────────────────────────────────────────────────
    // Sigorta firmaları zaman zaman Excel kolon sırasını değiştiriyor.
    // Sabit indeks (row[0]=Branş, row[4]=Net Prim...) yerine ilk
    // satırlardaki başlıkları okuyup metinden hangi kolonun ne olduğunu
    // tespit ediyoruz. Birden fazla başlık satırı (merged title) için
    // ilk 10 satırı tarıyoruz.
    const normalizeHeader = (s: any): string => {
        if (s === null || s === undefined) return "";
        return String(s)
            .toLowerCase()
            .replace(/ş/g, "s").replace(/ı/g, "i").replace(/ğ/g, "g")
            .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
            .replace(/[^a-z0-9]/g, ""); // boşluk, nokta, parantez, vs. hepsi atılır
    };

    // Her field için kabul edilen başlık varyantları (normalize edilmiş hâli)
    const HEADER_SYNONYMS: Record<string, string[]> = {
        brans:         ["brans", "branch", "branskodu", "branskod"],
        policeNo:      ["policeno", "policyno", "policiseno", "polno", "polnumarasi", "polnumara"],
        sigortali:     ["sigortali", "sigortaliad", "sigortaliunvan", "musteri", "musteriad", "musteriunvan", "insured", "adsoyad", "unvan"],
        tanzimTarihi:  ["tanzimtarihi", "tanzim", "duzenleme", "duzenlematarihi", "duzenlematar", "tarih", "policetarihi", "baslangictarihi"],
        netPrim:       ["netprim", "net", "netprimi", "netprimtutari", "primnet"],
        brutPrim:      ["brutprim", "brut", "brutprimi", "brutprimtutari", "primbrut", "toplamprim", "odemekprim"],
        komisyon:      ["komisyon", "komisyontutari", "komisyontutar", "commission", "komtutari", "komtutar"],
        sigortaBedeli: ["sigortabedeli", "sigortabedel", "bedel", "teminat", "teminattutari", "teminatbedeli", "sigortatemini"],
        dekontDurumu:  ["dekont", "dekontdurumu", "dekontdurum", "dekontevethayir"],
    };

    // Muhasebe (hesap ekstresi) Excel'i için ayrı sözlük
    const MUHASEBE_HEADER_SYNONYMS: Record<string, string[]> = {
        tarih:    ["tarih", "islemtarihi", "vadetarihi", "hareketkayittarihi", "fistarihi", "operasyontarihi"],
        belgeNo:  ["belgeno", "belge", "fisno", "policeno", "policyno", "evrakno", "referansno", "referans", "fis", "policeevrakno"],
        aciklama: ["aciklama", "explanation", "fisaciklama", "hareketaciklama", "detay", "not"],
        borc:    ["borc", "debit", "tlborc", "borctutari"],
        alacak:  ["alacak", "credit", "tlalacak", "alacaktutari"],
        bakiye:  ["bakiye", "balance", "tlbakiye", "kalantutar"],
    };

    type ColumnMap = Partial<Record<keyof typeof HEADER_SYNONYMS, number>>;

    // Generic header tespiti — synonyms sözlüğü ve "minimum gerekli alanlar" listesi alır
    const detectHeaderGeneric = (
        rows: any[][],
        synonyms: Record<string, string[]>,
        requiredFields: string[],
    ): { headerRowIdx: number; mapping: Record<string, number> } | null => {
        const MAX_SCAN = Math.min(rows.length, 10);
        for (let r = 0; r < MAX_SCAN; r++) {
            const row = rows[r];
            if (!row || row.length < 2) continue;

            const mapping: Record<string, number> = {};
            // Pass 1: exact match
            for (let c = 0; c < row.length; c++) {
                const norm = normalizeHeader(row[c]);
                if (!norm) continue;
                for (const [field, list] of Object.entries(synonyms)) {
                    if (mapping[field] !== undefined) continue;
                    if (list.includes(norm)) {
                        mapping[field] = c;
                        break;
                    }
                }
            }
            // Pass 2: substring match (exact'in kaçırdıklarını yakalar)
            for (let c = 0; c < row.length; c++) {
                const norm = normalizeHeader(row[c]);
                if (!norm) continue;
                for (const [field, list] of Object.entries(synonyms)) {
                    if (mapping[field] !== undefined) continue;
                    if (list.some(s => norm.includes(s) || s.includes(norm))) {
                        mapping[field] = c;
                        break;
                    }
                }
            }

            const hasRequired = requiredFields.every(f => mapping[f] !== undefined);
            if (hasRequired) return { headerRowIdx: r, mapping };
        }
        return null;
    };

    const detectHeader = (rows: any[][]): { headerRowIdx: number; mapping: ColumnMap } | null => {
        // Poliçe için en az policeNo + (netPrim veya brutPrim) — özel "VEYA" mantığı
        const MAX_SCAN = Math.min(rows.length, 10);
        for (let r = 0; r < MAX_SCAN; r++) {
            const detected = detectHeaderGeneric(rows.slice(r, r + 1), HEADER_SYNONYMS, []);
            if (!detected) continue;
            const m = detected.mapping;
            if (m.policeNo !== undefined && (m.netPrim !== undefined || m.brutPrim !== undefined)) {
                return { headerRowIdx: r, mapping: m as ColumnMap };
            }
        }
        return null;
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setProcessing(true);
        try {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = evt.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                    // Header tespiti — kolon sırası firmaya göre değişir, başlıktan eşle
                    const detected = detectHeader(jsonData);
                    if (!detected) {
                        const firstRow = jsonData[0] ? JSON.stringify(jsonData[0]).slice(0, 150) : "(boş)";
                        toast({
                            variant: "destructive",
                            title: "Başlık satırı tanınmadı",
                            description: `Excel'in ilk 10 satırında 'Poliçe No' + 'Net/Brüt Prim' içeren başlık bulunamadı. İlk satır: ${firstRow}`,
                        });
                        setProcessing(false);
                        e.target.value = "";
                        return;
                    }
                    const { headerRowIdx, mapping } = detected;
                    const colOf = (field: keyof typeof HEADER_SYNONYMS, fallback?: number) =>
                        (mapping as any)[field] !== undefined ? (mapping as any)[field] : fallback;

                    const policiesToSave: any[] = [];
                    const uniqueMap = new Map<string, any>();

                    for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row || row.length < 2) continue;

                        // Poliçe No zorunlu — yoksa satırı atla
                        const policeCol = colOf("policeNo");
                        const pNo = policeCol !== undefined ? row[policeCol] : undefined;
                        if (!pNo) continue;

                        const tanzimCol = colOf("tanzimTarihi");
                        const tanzimRaw = tanzimCol !== undefined ? row[tanzimCol] : undefined;
                        const dateInfo = extractMonthAndYear(tanzimRaw);

                        const get = (field: keyof typeof HEADER_SYNONYMS) => {
                            const c = colOf(field);
                            return c !== undefined ? row[c] : undefined;
                        };

                        const sigortaliRaw = String(get("sigortali") || "");
                        // FEKA / PROMEDİS otomatik EVET (0 değerli, muhasebede yer almayan poliçeler)
                        const excelDekont = String(get("dekontDurumu") || "").trim();
                        const autoEvet = isAutoEvetFirm(sigortaliRaw);
                        const policy = {
                            brans: String(get("brans") || ""),
                            policeNo: String(pNo).replace(/[^a-zA-Z0-9]/g, ""),
                            sigortali: sigortaliRaw,
                            tanzimTarihi: formatExcelDate(tanzimRaw),
                            netPrim: String(parseAmount(get("netPrim"))),
                            brutPrim: String(parseAmount(get("brutPrim"))),
                            komisyon: String(parseAmount(get("komisyon"))),
                            sigortaBedeli: String(parseAmount(get("sigortaBedeli"))),
                            sirket: subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY,
                            // Öncelik: Excel'de açıkça yazılı dekont durumu > auto-EVET > boş (upsert korur)
                            dekontDurumu: excelDekont !== "" ? excelDekont : (autoEvet ? "EVET" : ""),
                            ay: dateInfo ? dateInfo.ay : "1",
                            yil: dateInfo ? dateInfo.yil : yil,
                        };

                        // Zeyilname/iptal birleştirme (aynı policeNo + sirket → tutarları topla)
                        const key = `${policy.policeNo}-${policy.sirket}`;
                        if (uniqueMap.has(key)) {
                            const existing = uniqueMap.get(key);
                            existing.netPrim = String(parseFloat(existing.netPrim) + parseFloat(policy.netPrim));
                            existing.brutPrim = String(parseFloat(existing.brutPrim) + parseFloat(policy.brutPrim));
                            existing.komisyon = String(parseFloat(existing.komisyon) + parseFloat(policy.komisyon));
                            existing.sigortaBedeli = String(parseFloat(existing.sigortaBedeli) + parseFloat(policy.sigortaBedeli));
                        } else {
                            uniqueMap.set(key, policy);
                        }
                    }

                    policiesToSave.push(...Array.from(uniqueMap.values()));

                    // Tanı log'u — kullanıcı toast'tan görünmeyen bilgileri burada çıkartıyoruz
                    console.log("[Sigorta Upload] header satırı:", headerRowIdx, "kolon eşleme:", mapping, "→", policiesToSave.length, "poliçe");


                    
                    if (policiesToSave.length > 0) {
                        const res = await apiRequest("POST", "/api/sigorta/policeler", policiesToSave);
                        const result = await res.json();
                        if (result.success) {
                            // Hangi alanlar bulundu / bulunmadı raporu
                            const expectedFields = ["brans", "policeNo", "sigortali", "tanzimTarihi", "netPrim", "brutPrim", "komisyon", "sigortaBedeli"] as const;
                            const eksikler = expectedFields.filter(f => (mapping as any)[f] === undefined);
                            const eksikUyari = eksikler.length > 0 ? ` Bulunmayan kolonlar: ${eksikler.join(", ")}.` : "";
                            toast({
                                title: "Yükleme Başarılı",
                                description: `${result.count} poliçe işlendi/güncellendi. Başlık satırı: ${headerRowIdx + 1}.${eksikUyari}`,
                            });
                            refetch();
                            queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
                            queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
                        }
                    } else {
                        toast({
                            variant: "destructive",
                            title: "Veri Eşleşmedi",
                            description: `Başlık tanındı (satır ${headerRowIdx + 1}) ama hiç geçerli poliçe satırı bulunamadı (Poliçe No boş).`,
                        });
                    }

                } catch (err) {
                    console.error(err);
                    toast({ variant: "destructive", title: "Hata", description: "Dosya işlenirken hata oluştu." });
                } finally {
                    setProcessing(false);
                    // Reset file input
                    e.target.value = "";
                }
            };
            reader.readAsBinaryString(file);
        } catch (error) {
             console.error(error);
             setProcessing(false);
        }
    };

    const handleAccountingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;


        
        if (!storedPolicies || storedPolicies.length === 0) {
            toast({ variant: "destructive", title: "Hata", description: "Önce poliçe listesini yüklemelisiniz." });
            e.target.value = "";
            return;
        }

        setProcessing(true);
        // setUnmatchedRecords([]); // Legacy local state no longer used for display, but maybe for toast?
        try {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = evt.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    
                    // Smart Sheet Selection
                    let sheetName = workbook.SheetNames[0];
                    if (workbook.SheetNames.includes("Hesap Ekstresi")) {
                        sheetName = "Hesap Ekstresi";
                    } else {
                        const sheet0 = workbook.Sheets[workbook.SheetNames[0]];
                        const json0 = XLSX.utils.sheet_to_json(sheet0, { header: 1 });
                        if (json0.length === 0 && workbook.SheetNames.length > 1) {
                             sheetName = workbook.SheetNames[1];
                        }
                    }

                    const sheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

                    console.log(`Processing Sheet: ${sheetName}, Rows: ${jsonData.length}`);

                    const accountingToSave: any[] = [];
                    const policiesToUpdate = new Map<number, any>();
                    let matchCount = 0;

                    // 1. Build Index Maps
                    const policyMap = new Map<string, any>(); // Exact normalized match (Ray & Mapfre Full)
                    const mapfreSuffixMap = new Map<string, any[]>(); // Suffix match for Mapfre (Key: Suffix string, Val: Policy[])

                    storedPolicies.forEach((p: any) => {
                         const normalized = String(p.policeNo).replace(/[^a-zA-Z0-9]/g, "");
                         policyMap.set(normalized, p);

                         // Build Mapfre Suffix Index (Format: 21025XXXXXXXX)
                         if (subTab === 'mapfre' && normalized.startsWith('21025')) {
                             // Extract suffix (everything after 21025)
                             // Example: 2102500000259 -> 00000259 -> 259
                             const rawSuffix = normalized.slice(5);
                             if (rawSuffix.length > 0) {
                                  const suffix = String(parseInt(rawSuffix));
                                  if (!mapfreSuffixMap.has(suffix)) {
                                      mapfreSuffixMap.set(suffix, []);
                                  }
                                  mapfreSuffixMap.get(suffix)?.push(p);
                             }
                         }
                    });

                    // Ray cutoff — default'ta KAPALI. Auto-gap detection devre dışı
                    // çünkü muhasebe kayıtlarında bazen poliçe numarası kısaltılarak
                    // (son 5-6 hane) yazılıyor, ve auto-cutoff bunları yanlışlıkla
                    // atıyordu. Bunun yerine: cutoff yok + Ray suffix matching.
                    // Manuel override hâlâ desteklenir (UI input dolu ise).
                    let rayMinPolicyNo = 0;
                    let cutoffSource = "";
                    if (subTab === 'ray') {
                        const manual = parseInt((rayCutoffOverride || "").replace(/\D/g, ''));
                        if (!isNaN(manual) && manual > 0) {
                            rayMinPolicyNo = manual;
                            cutoffSource = "manuel";
                            console.log(`[Ray cutoff] ${cutoffSource}: ${rayMinPolicyNo} (bundan küçük muhasebe satırları atlanacak)`);
                        } else {
                            console.log(`[Ray cutoff] devre dışı — tüm satırlar değerlendirilecek, kısaltılmış no'lar suffix ile eşleşecek`);
                        }
                    }
                    let skippedByCutoff = 0;

                    // Header-tabanlı kolon tespiti — muhasebe Excel'i firmaya göre değişiyor
                    const mDetected = detectHeaderGeneric(jsonData, MUHASEBE_HEADER_SYNONYMS, ["belgeNo"]);
                    if (!mDetected) {
                        const firstRow = jsonData[0] ? JSON.stringify(jsonData[0]).slice(0, 150) : "(boş)";
                        toast({
                            variant: "destructive",
                            title: "Muhasebe başlığı tanınmadı",
                            description: `Başlık satırında 'Belge No / Poliçe No' kolonu bulunamadı. İlk satır: ${firstRow}`,
                        });
                        setProcessing(false);
                        e.target.value = "";
                        return;
                    }
                    const { headerRowIdx: mHeaderIdx, mapping: mMap } = mDetected;
                    const mCol = (field: string): number | undefined => mMap[field];
                    const mGet = (row: any[], field: string) => {
                        const c = mCol(field);
                        return c !== undefined ? row[c] : undefined;
                    };
                    console.log("[Muhasebe Upload] header satırı:", mHeaderIdx, "kolon eşleme:", mMap);

                    for (let i = mHeaderIdx + 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row) continue;

                        const tarihRaw = mGet(row, "tarih");
                        const belgeNoRaw = mGet(row, "belgeNo");
                        const aciklamaRaw = mGet(row, "aciklama");
                        const borcRaw = mGet(row, "borc");
                        const alacakRaw = mGet(row, "alacak");
                        const bakiyeRaw = mGet(row, "bakiye");

                        if (!belgeNoRaw && !aciklamaRaw) continue; // tamamen boş satırları atla

                        const accountingPolicyNo = String(belgeNoRaw || "").replace(/[^a-zA-Z0-9]/g, "");

                        // Ray cutoff — geçmiş yıl carry-over satırlarını atla
                        if (rayMinPolicyNo > 0 && accountingPolicyNo) {
                            const accNum = parseInt(accountingPolicyNo);
                            if (!isNaN(accNum) && accNum < rayMinPolicyNo) {
                                skippedByCutoff++;
                                continue;
                            }
                        }

                        const accBorc = parseAmount(borcRaw);
                        const accAlacak = parseAmount(alacakRaw);
                        // Poliçe Brüt Primi muhasebe defterinde sigorta şirketinin
                        // ALACAK kolonuna yazılır (bize olan borcu). Borç ise tahsilat
                        // satırı olup farklı tutarda olabilir. Karşılaştırma için
                        // her zaman ALACAK kullanılır.
                        const accAmount = accAlacak;

                        const sirket = subTab === 'mapfre' ? COMPANIES.MAPFRE : COMPANIES.RAY;

                        const accRecord = {
                            tarih: formatExcelDate(tarihRaw),
                            belgeNo: String(belgeNoRaw || ""),
                            aciklama: String(aciklamaRaw || ""),
                            borc: String(accBorc),
                            alacak: String(accAlacak),
                            bakiye: String(parseAmount(bakiyeRaw)),
                            sirket: sirket,
                            ay: extractMonthAndYear(tarihRaw)?.ay || "1",
                            yil: yil,
                            eslestiMi: 0 as 0 | 1,
                            eslesenPolicyId: null as string | null
                        };

                        let matchedPolicy: any = null;
                        let isSuspicious = false; // Birden fazla aday → ŞÜPHELİ
                        let amountMismatch = false; // Tutar uyuşmazlığı → TUTAR FARKI

                        // ----------------------------------------------------------------
                        // MATCHING ALGORITHM
                        // Mapfre: önce tam eşleşme, sonra suffix; suffix'te birden çok
                        // aday varsa tutar yakınlığına göre disambiguate, hâlâ belirsizse
                        // ŞÜPHELİ olarak işaretle.
                        // Ray: yalnızca tam eşleşme.
                        // ----------------------------------------------------------------
                        if (subTab === 'mapfre') {
                            if (policyMap.has(accountingPolicyNo)) {
                                matchedPolicy = policyMap.get(accountingPolicyNo);
                            }
                            if (!matchedPolicy && accountingPolicyNo) {
                                const suffixKey = String(parseInt(accountingPolicyNo));
                                const candidates = mapfreSuffixMap.get(suffixKey);
                                if (candidates && candidates.length > 0) {
                                    if (candidates.length === 1) {
                                        matchedPolicy = candidates[0];
                                    } else {
                                        // Çoklu aday — tutar yakınlığı ile seç (₺1 tolerans)
                                        const closeByAmount = candidates.filter((p: any) => {
                                            const pBrut = parseFloat(p.brutPrim);
                                            return Math.abs(pBrut - accAmount) < 1.0;
                                        });
                                        if (closeByAmount.length === 1) {
                                            matchedPolicy = closeByAmount[0];
                                        } else {
                                            // Hâlâ belirsiz — ŞÜPHELİ
                                            isSuspicious = true;
                                            console.warn(`Mapfre suffix ${suffixKey} için ${candidates.length} aday var, manuel seçim gerekli:`, candidates.map((c: any) => c.policeNo));
                                        }
                                    }
                                }
                            }
                        } else {
                            // RAY LOGIC — önce tam eşleşme, yoksa suffix fallback
                            // (muhasebe kayıtlarında bazen poliçe no son 5-6 hane
                            // olarak kısaltılır — "1494789982" yerine "789982")
                            if (accountingPolicyNo && policyMap.has(accountingPolicyNo)) {
                                matchedPolicy = policyMap.get(accountingPolicyNo);
                            } else if (accountingPolicyNo && accountingPolicyNo.length >= 4 && accountingPolicyNo.length <= 8) {
                                const candidates = storedPolicies.filter((p: any) => {
                                    const norm = String(p.policeNo).replace(/\D/g, "");
                                    return norm.endsWith(accountingPolicyNo);
                                });
                                if (candidates.length === 1) {
                                    matchedPolicy = candidates[0];
                                } else if (candidates.length > 1) {
                                    // Tutar yakınlığı ile disambiguate (₺1 / %1)
                                    const closeByAmount = candidates.filter((p: any) => {
                                        const pBrut = parseFloat(p.brutPrim);
                                        return Math.abs(pBrut - accAmount) < Math.max(1, pBrut * 0.01);
                                    });
                                    if (closeByAmount.length === 1) {
                                        matchedPolicy = closeByAmount[0];
                                    } else {
                                        isSuspicious = true;
                                        console.warn(`Ray suffix "${accountingPolicyNo}" için ${candidates.length} aday var, manuel seçim gerekli`);
                                    }
                                }
                            }
                        }

                        // Tutar tutarsızlık kontrolü (sadece eşleşme bulunduysa)
                        if (matchedPolicy && accAmount > 0) {
                            const policyBrut = parseFloat(matchedPolicy.brutPrim || "0");
                            // %1 veya min ₺1 tolerance
                            const tolerance = Math.max(1, policyBrut * 0.01);
                            if (Math.abs(policyBrut - accAmount) > tolerance) {
                                amountMismatch = true;
                            }
                        }

                        if (matchedPolicy) {
                            const newStatus = amountMismatch ? "TUTAR FARKI" : "EVET";
                            const updatedPolicy = { ...matchedPolicy, dekontDurumu: newStatus };
                            policiesToUpdate.set(matchedPolicy.id, updatedPolicy);
                            accRecord.eslestiMi = 1;
                            accRecord.eslesenPolicyId = matchedPolicy.id;
                            if (!amountMismatch) matchCount++;
                        } else if (isSuspicious) {
                            // ŞÜPHELİ: muhasebe satırı eşleşmedi sayılacak ama log için işaretleyelim
                            // (DB tarafı henüz "şüpheli" alanına sahip değil — şimdilik aciklama'ya iliştirelim)
                            accRecord.aciklama = `[ŞÜPHELİ - manuel seçim] ${accRecord.aciklama}`;
                        }

                        accountingToSave.push(accRecord);
                    }

                    // 1. Save Accounting Records to DB (Persistent)
                    if (accountingToSave.length > 0) {
                         console.log("Saving accounting records:", accountingToSave.length);
                         await apiRequest("POST", "/api/sigorta/muhasebe", accountingToSave);
                    }

                    // 2. Update Matched Policies in DB
                    if (policiesToUpdate.size > 0) {
                        const updates = Array.from(policiesToUpdate.values());
                        console.log("Updating matched policies:", updates.length);
                        await apiRequest("POST", "/api/sigorta/policeler", updates);
                        toast({ title: "Eşleştirme Başarılı", description: `${matchCount} adet poliçe 'EVET' olarak işaretlendi ve kaydedildi.` });
                    } else {
                        toast({ title: "Sonuç", description: "Yeni eşleşme bulunamadı, ancak muhasebe kayıtları güncellendi." });
                    }

                    // Veri Yükleme sekmesinin kendi cache'i + Poliçe Listesi ve Özet
                    // sekmelerinin cache'i ayrı queryKey'ler kullanıyor; hepsini
                    // invalidate etmezsek diğer sekmelerde eski durum görünür.
                    refetch();
                    refetchMuhasebe();
                    queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
                    queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
                    queryClient.invalidateQueries({ queryKey: ['sigorta-muhasebe'] });
                    queryClient.invalidateQueries({ queryKey: ['sigorta-policeler-aging'] });

                    const unmatchedCount = accountingToSave.filter(r => r.eslestiMi === 0).length;
                    if (unmatchedCount > 0) {
                         toast({ variant: "default", title: "Bilgi", description: `${unmatchedCount} adet eşleşmeyen muhasebe kaydı sisteme eklendi.` });
                    }
                    if (skippedByCutoff > 0 || (subTab === 'ray' && rayMinPolicyNo > 0)) {
                        toast({
                            variant: "default",
                            title: skippedByCutoff > 0 ? "Geçmiş Yıl Atlandı" : "Cutoff Bilgisi",
                            description: `Cutoff: ${rayMinPolicyNo.toLocaleString('tr-TR')} (${cutoffSource}). ${skippedByCutoff} satır bu sınırın altında olduğu için atlandı.`,
                        });
                    }

                } catch (err) {
                    console.error(err);
                    toast({ variant: "destructive", title: "Hata", description: "Muhasebe dosyası işlenirken hata oluştu." });
                } finally {
                    setProcessing(false);
                    e.target.value = "";
                }
            };
            reader.readAsBinaryString(file);
        } catch (err) {
            console.error(err);
            setProcessing(false);
        }
    };

    // Calculate totals
    const totals = storedPolicies?.reduce((acc: any, curr: any) => ({
        netPrim: acc.netPrim + Number(curr.netPrim || 0),
        brutPrim: acc.brutPrim + Number(curr.brutPrim || 0),
        komisyon: acc.komisyon + Number(curr.komisyon || 0),
        count: acc.count + 1
    }), { netPrim: 0, brutPrim: 0, komisyon: 0, count: 0 }) || { netPrim: 0, brutPrim: 0, komisyon: 0, count: 0 };


    return (
        <Tabs defaultValue="mapfre" value={subTab} onValueChange={setSubTab} className="w-full">
            <TabsList>
                <TabsTrigger value="mapfre">Mapfre Sigorta</TabsTrigger>
                <TabsTrigger value="ray">Ray Sigorta</TabsTrigger>
            </TabsList>
            
            <Card className="mt-4">
                <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <CardTitle>{subTab === 'mapfre' ? 'Mapfre' : 'Ray'} Veri Yükleme</CardTitle>
                            <CardDescription>
                                {yil} yılı poliçe excelini (Kümülatif veya Aylık) buraya yükleyin. Sistem otomatik olarak birleştirecektir.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Ay (fallback):</span>
                            <Select value={ayOverride} onValueChange={setAyOverride}>
                                <SelectTrigger className="w-[200px] h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">Tarihten otomatik</SelectItem>
                                    {AYLAR.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Upload Sections - Side by Side */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Policy Upload Section */}
                        <div className="border border-dashed border-2 rounded-lg p-6 text-center bg-slate-50/50 hover:bg-slate-100/50 transition-colors h-full flex flex-col justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                                    <FileSpreadsheet className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base">Poliçe Listesi Yükle</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        A-H Sütunları (Branş, Poliçe No, Sigortalı, Tarih, Net, Brüt, Komisyon, Bedel)
                                    </p>
                                </div>
                                <div className="relative mt-2">
                                    <Button disabled={processing} className="relative z-0 h-9 text-sm" size="sm">
                                        {processing ? "İşleniyor..." : "Excel Dosyası Seç"}
                                    </Button>
                                    <Input 
                                        type="file" 
                                        accept=".xlsx, .xls" 
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10 h-9" 
                                        onChange={handleFileUpload}
                                        disabled={processing}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Accounting Upload Section */}
                        <div className="border border-dashed border-2 rounded-lg p-6 text-center bg-green-50/50 hover:bg-green-100/50 transition-colors h-full flex flex-col justify-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="p-3 bg-green-100 rounded-full text-green-600">
                                    <FileSpreadsheet className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-base">Muhasebe Dosyası Yükle</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Muhasebe kayıtlarını içeren Excel dosyasını seçin.
                                    </p>
                                </div>

                                {subTab === 'ray' && (
                                    <div className="w-full max-w-[280px] mt-1 text-left">
                                        <label className="text-xs font-medium text-muted-foreground">
                                            Ray Cutoff (manuel — opsiyonel)
                                        </label>
                                        <Input
                                            type="text"
                                            inputMode="numeric"
                                            placeholder="Boş bırak: otomatik tespit"
                                            value={rayCutoffOverride}
                                            onChange={(e) => setRayCutoffOverride(e.target.value)}
                                            className="h-8 text-xs mt-1"
                                        />
                                        <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                                            Bu rakamdan küçük poliçe numaralı muhasebe satırları (geçen yıl zeyilleri) atlanır.
                                        </p>
                                    </div>
                                )}

                                <div className="relative mt-2">
                                    <Button disabled={processing} className="relative z-0 h-9 text-sm" variant="outline" size="sm">
                                        {processing ? "İşleniyor..." : "Muhasebe Excel Seç"}
                                    </Button>
                                    <Input 
                                        type="file" 
                                        accept=".xlsx, .xls" 
                                        className="absolute inset-0 opacity-0 cursor-pointer z-10 h-9" 
                                        onChange={handleAccountingUpload}
                                        disabled={processing}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    
                    {/* RESULTS TABS */}
                    <div className="mt-8">
                        <Tabs defaultValue="policy-list" className="w-full">
                            <TabsList className="mb-4">
                                <TabsTrigger value="policy-list" className="flex gap-2">
                                    <Search className="w-4 h-4"/> Mevcut Poliçe Listesi <Badge variant="secondary" className="ml-1">{totals.count}</Badge>
                                </TabsTrigger>
                                <TabsTrigger value="unmatched" className="flex gap-2 text-red-600">
                                    <AlertTriangle className="w-4 h-4"/> Eşleşmeyen Muhasebe Kayıtları <Badge variant="destructive" className="ml-1">{unmatchedRecordsList.length || 0}</Badge>
                                </TabsTrigger>
                            </TabsList>

                            {/* FILTERS & BULK ACTIONS for Policy List */}
                            <div className="flex gap-4 mb-4 items-center flex-wrap bg-white p-2 rounded-md border">
                                <div className="flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">Filtrele:</span>
                                </div>
                                <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                                    <SelectTrigger className="w-[150px] h-8">
                                        <SelectValue placeholder="Dekont Durumu" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">Tümü</SelectItem>
                                        <SelectItem value="EVET">Dekont Evet</SelectItem>
                                        <SelectItem value="HAYIR">Dekont Hayır</SelectItem>
                                    </SelectContent>
                                </Select>

                                <Input 
                                    placeholder="Sigortalı Ara..." 
                                    className="w-[200px] h-8"
                                    value={sigortaliFilter}
                                    onChange={(e) => setSigortaliFilter(e.target.value)}
                                />

                                {selectedPolicies.length > 0 && (
                                    <div className="ml-auto flex items-center gap-2">
                                        <span className="text-sm text-muted-foreground">{selectedPolicies.length} poliçe seçildi.</span>
                                        <Button 
                                            size="sm" 
                                            className="h-8 bg-green-600 hover:bg-green-700"
                                            onClick={handleBulkUpdate}
                                        >
                                            <CheckCircle2 className="w-4 h-4 mr-2" />
                                            Seçilenleri Eşleştir (EVET Yap)
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <TabsContent value="policy-list">
                                <div className="rounded-md border shadow-sm">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-slate-50">
                                                <TableHead className="w-[50px]">
                                                    <Checkbox 
                                                        checked={filteredPolicies?.length > 0 && selectedPolicies.length === filteredPolicies?.length}
                                                        onCheckedChange={(checked) => {
                                                            if (checked) {
                                                                setSelectedPolicies(filteredPolicies.map((p: any) => p.id));
                                                            } else {
                                                                setSelectedPolicies([]);
                                                            }
                                                        }}
                                                    />
                                                </TableHead>
                                                <TableHead>Branş</TableHead>
                                                <TableHead>
                                                    <Button variant="ghost" onClick={() => requestSort('policeNo')} className="p-0 hover:bg-transparent font-bold">
                                                        Poliçe No
                                                        <SortIcon column="policeNo" />
                                                    </Button>
                                                </TableHead>
                                                <TableHead>
                                                    <Button variant="ghost" onClick={() => requestSort('sigortali')} className="p-0 hover:bg-transparent font-bold">
                                                        Sigortalı
                                                        <SortIcon column="sigortali" />
                                                    </Button>
                                                </TableHead>
                                                <TableHead>
                                                    <Button variant="ghost" onClick={() => requestSort('tanzimTarihi')} className="p-0 hover:bg-transparent font-bold">
                                                        Tanzim Tarihi
                                                        <SortIcon column="tanzimTarihi" />
                                                    </Button>
                                                </TableHead>
                                                <TableHead className="text-right">Net Prim</TableHead>
                                                <TableHead className="text-right">Brüt Prim</TableHead>
                                                <TableHead className="text-right">Komisyon</TableHead>
                                                <TableHead className="text-right">Sigorta Bedeli</TableHead>
                                                <TableHead className="text-center font-bold text-blue-700">Dekont</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {isLoading ? (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="h-24 text-center">Yükleniyor...</TableCell>
                                                </TableRow>
                                            ) : filteredPolicies?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="h-24 text-center">Kayıt bulunamadı.</TableCell>
                                                </TableRow>
                                            ) : (
                                                filteredPolicies?.map((p: any) => (
                                                    <TableRow key={p.id}>
                                                        <TableCell>
                                                            <Checkbox 
                                                                checked={selectedPolicies.includes(p.id)}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) {
                                                                        setSelectedPolicies([...selectedPolicies, p.id]);
                                                                    } else {
                                                                        setSelectedPolicies(selectedPolicies.filter(id => id !== p.id));
                                                                    }
                                                                }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>{p.brans}</TableCell>
                                                        <TableCell className="font-medium">{p.policeNo}</TableCell>
                                                        <TableCell className="max-w-[200px] truncate" title={p.sigortali}>{p.sigortali}</TableCell>
                                                        <TableCell>{p.tanzimTarihi}</TableCell>
                                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.netPrim))}</TableCell>
                                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.brutPrim))}</TableCell>
                                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.komisyon))}</TableCell>
                                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(p.sigortaBedeli))}</TableCell>
                                                        <TableCell className="text-center">
                                                            {p.dekontDurumu === 'EVET' ? (
                                                                <Badge className="bg-green-500">EVET</Badge>
                                                            ) : p.dekontDurumu === 'TUTAR FARKI' ? (
                                                                <Badge variant="destructive">FARKLILIK</Badge>
                                                            ) : (
                                                                <Badge className="bg-red-500 hover:bg-red-600 text-white">HAYIR</Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TabsContent>

                            <TabsContent value="unmatched">
                                 <div className="rounded-md border border-red-200 bg-red-50/20 shadow-sm">
                                    <div className="p-4 bg-red-50 border-b border-red-100 flex items-center justify-between gap-4">
                                        <span className="text-red-800 text-sm">
                                            Bu listedeki kayıtlar Muhasebe Excel'inde bulunup poliçe listesinde eşleşmeyenlerdir (Evrak No/Poliçe No bulunamadı).
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="default"
                                            className="bg-blue-600 hover:bg-blue-700 shrink-0"
                                            disabled={rematchProcessing || (unmatchedRecordsList?.length ?? 0) === 0}
                                            onClick={handleRematchUnmatched}
                                            title="Eşleşmeyen kayıtları mevcut poliçe listesine karşı yeniden tara"
                                        >
                                            {rematchProcessing ? "Eşleştiriliyor..." : "Tekrar Eşleştir"}
                                        </Button>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Tarih</TableHead>
                                                <TableHead>Evrak No</TableHead>

                                                <TableHead className="text-right">Tutar</TableHead>
                                                <TableHead>Firma</TableHead>
                                                <TableHead className="text-right">İşlemler</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {unmatchedRecordsList.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Eşleşmeyen kayıt yok.</TableCell>
                                                </TableRow>
                                            ) : (
                                                unmatchedRecordsList.map((rec: any, idx: number) => (
                                                    <TableRow key={rec.id || idx} className="hover:bg-red-50">
                                                        <TableCell>{rec.tarih}</TableCell>
                                                        <TableCell className="font-bold">{rec.belgeNo}</TableCell>
                                                        <TableCell className="text-right">
                                                            {/* Tutar = ALACAK (= brüt prim). Bakiye değil (kümülatif). */}
                                                            {new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(rec.alacak || '0'))}
                                                        </TableCell>
                                                        <TableCell>{rec.aciklama}</TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-100"
                                                                    onClick={() => {
                                                                        setSelectedUnmatchedRecord(rec);
                                                                        setMatchSearchQuery("");
                                                                        setIsMatchModalOpen(true);
                                                                    }}
                                                                    title="Manuel Eşleştir"
                                                                >
                                                                    <Link className="h-4 w-4" />
                                                                </Button>
                                                                <Button 
                                                                    variant="ghost" 
                                                                    size="icon" 
                                                                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
                                                                    onClick={async () => {
                                                                        if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
                                                                        try {
                                                                            await apiRequest("DELETE", `/api/sigorta/muhasebe/${rec.id}`);
                                                                            refetchMuhasebe();
                                                                            toast({ title: "Silindi", description: "Kayıt başarıyla silindi." });
                                                                        } catch (e) {
                                                                            toast({ variant: "destructive", title: "Hata", description: "Silme işlemi başarısız." });
                                                                        }
                                                                    }}
                                                                    title="Listeden Kaldır"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                </CardContent>
            </Card>

            {/* MANUAL MATCHING DIALOG */}
            <Dialog open={isMatchModalOpen} onOpenChange={setIsMatchModalOpen}>
                <DialogContent className="max-w-[700px]">
                    <DialogHeader>
                        <DialogTitle>Manuel Eşleştirme</DialogTitle>
                        <DialogDescription>
                            Muhasebe kaydını eşleştirmek istediğiniz poliçeyi seçin. <br/>
                            <span className="font-bold text-foreground">Kayıt: {selectedUnmatchedRecord ? `${selectedUnmatchedRecord.belgeNo} - ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(parseFloat(selectedUnmatchedRecord.alacak || '0'))}` : ''}</span>
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex gap-2 mb-4 items-center">
                        <Input
                            placeholder="Poliçe Ara..."
                            value={matchSearchQuery}
                            onChange={(e) => setMatchSearchQuery(e.target.value)}
                            className="flex-1"
                        />
                        <Select value={matchSortBy} onValueChange={(v: any) => setMatchSortBy(v)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sigortali">Sigortalı A-Z</SelectItem>
                                <SelectItem value="brutPrim">Brüt Prim ↑</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="max-h-[300px] overflow-y-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Poliçe No</TableHead>
                                    <TableHead>Sigortalı</TableHead>
                                    <TableHead className="text-right">Tutar</TableHead>
                                    <TableHead>İşlem</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {(storedPolicies || [])
                                    .filter((p: any) => p.dekontDurumu !== 'EVET')
                                    .filter((p: any) =>
                                        matchSearchQuery
                                            ? (p.policeNo.includes(matchSearchQuery) || String(p.sigortali).toLowerCase().includes(matchSearchQuery.toLowerCase()))
                                            : true
                                    )
                                    .slice()
                                    .sort((a: any, b: any) => {
                                        if (matchSortBy === "brutPrim") {
                                            return parseFloat(a.brutPrim || "0") - parseFloat(b.brutPrim || "0");
                                        }
                                        return String(a.sigortali || "").localeCompare(String(b.sigortali || ""), 'tr');
                                    })
                                    .slice(0, 50)
                                    .map((p: any) => (
                                    <TableRow key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={async () => {
                                        // Perform Match
                                        try {
                                             const updated = { ...p, dekontDurumu: "EVET" };
                                             const res = await apiRequest("POST", "/api/sigorta/policeler", [updated]);
                                             const result = await res.json();
                                             
                                             if (result.success) {
                                                  // Also update Accounting Record status
                                                  if (selectedUnmatchedRecord && selectedUnmatchedRecord.id) {
                                                      await apiRequest("PUT", `/api/sigorta/muhasebe/${selectedUnmatchedRecord.id}/match`, {
                                                          eslestiMi: true,
                                                          eslesenPolicyId: p.id // Use p.id (selected policy)
                                                      });
                                                      refetchMuhasebe();
                                                  }

                                                  toast({ title: "Harika", description: "Poliçe manuel olarak eşleştirildi." });
                                                  setIsMatchModalOpen(false);
                                                  setSelectedUnmatchedRecord(null);
                                                  refetch(); // Refetch policies
                                             }
                                        } catch (e) {
                                            toast({ variant: "destructive", title: "Hata", description: "Eşleştirme başarısız." });
                                        }
                                    }}>
                                        <TableCell className="font-medium">{p.policeNo}</TableCell>
                                        <TableCell>{p.sigortali}</TableCell>
                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(p.brutPrim)}</TableCell>
                                        <TableCell>
                                            <Button size="sm" variant="ghost"><MousePointerClick className="w-4 h-4 text-blue-600"/></Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsMatchModalOpen(false)}>İptal</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>            
        </Tabs>
    );
}

// ---------------------------------------------------------------------------
// 4. YAŞLANDIRMA (AGING) TAB COMPONENT
// ---------------------------------------------------------------------------
// dekontDurumu !== 'EVET' olan poliçeleri tanzim tarihinden bugüne kadar geçen
// gün sayısına göre kovalara (0-30, 31-60, 61-90, 90+) ayırır.
// dd.MM.yyyy formatını parse eder; geçersiz tarih = bilinmeyen kovaya gider.
function SigortaAging({ yil, ay }: { yil: number; ay: string }) {
    const { data: mapfre } = useQuery({
        queryKey: ['sigorta-policeler-aging', COMPANIES.MAPFRE, yil, ay],
        queryFn: async () => {
            let url = `/api/sigorta/policeler?sirket=${encodeURIComponent(COMPANIES.MAPFRE)}&yil=${yil}`;
            if (ay !== 'toplam') url += `&ay=${ay}`;
            const res = await apiRequest("GET", url);
            return res.json();
        },
    });
    const { data: ray } = useQuery({
        queryKey: ['sigorta-policeler-aging', COMPANIES.RAY, yil, ay],
        queryFn: async () => {
            let url = `/api/sigorta/policeler?sirket=${encodeURIComponent(COMPANIES.RAY)}&yil=${yil}`;
            if (ay !== 'toplam') url += `&ay=${ay}`;
            const res = await apiRequest("GET", url);
            return res.json();
        },
    });

    const parseDDMMYYYY = (s: string): Date | null => {
        if (!s) return null;
        const parts = s.split('.');
        if (parts.length !== 3) return null;
        const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
        if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
        return new Date(y, m - 1, d);
    };

    const daysSince = (s: string): number | null => {
        const dt = parseDDMMYYYY(s);
        if (!dt) return null;
        return Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24));
    };

    const aged = useMemo(() => {
        const merged = [...(mapfre || []), ...(ray || [])];
        const tahsilEdilmemis = merged.filter((p: any) => p.dekontDurumu !== 'EVET');
        const buckets: Record<string, any[]> = { "0-30": [], "31-60": [], "61-90": [], "90+": [], "Bilinmiyor": [] };
        for (const p of tahsilEdilmemis) {
            const d = daysSince(p.tanzimTarihi);
            if (d === null) buckets["Bilinmiyor"].push(p);
            else if (d <= 30) buckets["0-30"].push(p);
            else if (d <= 60) buckets["31-60"].push(p);
            else if (d <= 90) buckets["61-90"].push(p);
            else buckets["90+"].push(p);
        }
        return buckets;
    }, [mapfre, ray]);

    const bucketColor = (key: string) =>
        key === "0-30" ? "bg-green-100 text-green-800"
        : key === "31-60" ? "bg-amber-100 text-amber-800"
        : key === "61-90" ? "bg-orange-100 text-orange-800"
        : key === "90+" ? "bg-red-100 text-red-800"
        : "bg-gray-100 text-gray-800";

    const sumNet = (rows: any[]) => rows.reduce((acc, r) => acc + parseFloat(r.netPrim || "0"), 0);
    const fmtMoney = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n);

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-5">
                {Object.entries(aged).map(([key, rows]) => (
                    <Card key={key}>
                        <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium">{key} gün</CardTitle>
                                <Badge className={bucketColor(key)}>{rows.length}</Badge>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-xl font-bold">{fmtMoney(sumNet(rows))} ₺</div>
                            <div className="text-xs text-muted-foreground">net prim toplamı</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Tahsil Edilmemiş Poliçeler (En Eski Önce)</CardTitle>
                    <CardDescription>
                        Mapfre + Ray birlikte. {Object.values(aged).reduce((acc, r) => acc + r.length, 0)} kayıt.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Şirket</TableHead>
                                <TableHead>Branş</TableHead>
                                <TableHead>Poliçe No</TableHead>
                                <TableHead>Sigortalı</TableHead>
                                <TableHead>Tanzim</TableHead>
                                <TableHead className="text-right">Gün</TableHead>
                                <TableHead className="text-right">Net Prim</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(["90+", "61-90", "31-60", "0-30", "Bilinmiyor"] as const).flatMap(bucket =>
                                aged[bucket]
                                    .slice()
                                    .sort((a: any, b: any) => (daysSince(b.tanzimTarihi) || 0) - (daysSince(a.tanzimTarihi) || 0))
                                    .map((p: any) => {
                                        const d = daysSince(p.tanzimTarihi);
                                        return (
                                            <TableRow key={p.id}>
                                                <TableCell>{p.sirket}</TableCell>
                                                <TableCell>{p.brans}</TableCell>
                                                <TableCell className="font-medium">{p.policeNo}</TableCell>
                                                <TableCell className="max-w-[260px] truncate" title={p.sigortali}>{p.sigortali}</TableCell>
                                                <TableCell>{p.tanzimTarihi}</TableCell>
                                                <TableCell className="text-right">
                                                    <Badge className={bucketColor(bucket)}>{d ?? "—"}</Badge>
                                                </TableCell>
                                                <TableCell className="text-right">{fmtMoney(parseFloat(p.netPrim || "0"))}</TableCell>
                                            </TableRow>
                                        );
                                    })
                            )}
                            {Object.values(aged).every(r => r.length === 0) && (
                                <TableRow><TableCell colSpan={7} className="text-center h-16">Tahsil edilmemiş poliçe yok 🎉</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

