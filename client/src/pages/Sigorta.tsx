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
                    <TabsList className="grid w-full grid-cols-3 max-w-[600px]">
                        <TabsTrigger value="ozet">Özet</TabsTrigger>
                        <TabsTrigger value="liste">Poliçe Listesi</TabsTrigger>
                        <TabsTrigger value="yukleme">Veri Yükleme</TabsTrigger>
                    </TabsList>

                    <TabsContent value="ozet" className="mt-6">
                        <SigortaOzet yil={selectedYear} ay={selectedMonth} />
                    </TabsContent>

                    <TabsContent value="liste" className="mt-6">
                        <PoliceListesi yil={selectedYear} ay={selectedMonth} />
                    </TabsContent>

                    <TabsContent value="yukleme" className="mt-6">
                        <VeriYukleme yil={selectedYear} />
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
        toplamPrim: (acc.toplamPrim || 0) + (curr.toplamPrim || 0),
        toplamKomisyon: (acc.toplamKomisyon || 0) + (curr.toplamKomisyon || 0),
        policeSayisi: (acc.policeSayisi || 0) + (curr.policeSayisi || 0),
    }), { toplamPrim: 0, toplamKomisyon: 0, policeSayisi: 0 }) || { toplamPrim: 0, toplamKomisyon: 0, policeSayisi: 0 };

    return (
        <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Toplam Net Prim</CardTitle>
                        <Upload className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(stats.toplamPrim)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                         <CardTitle className="text-sm font-medium">Toplam Komisyon</CardTitle>
                         <Upload className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                         <div className="text-2xl font-bold">
                            {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(stats.toplamKomisyon)}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Poliçe Adedi</CardTitle>
                        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.policeSayisi}</div>
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
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredOzet?.reduce((acc: any[], curr: any) => {
                                    const existing = acc.find(x => x.sirket === curr.sirket);
                                    if (existing) {
                                        existing.toplamPrim += curr.toplamPrim;
                                        existing.toplamKomisyon += curr.toplamKomisyon;
                                        existing.policeSayisi += curr.policeSayisi;
                                    } else {
                                        acc.push({...curr});
                                    }
                                    return acc;
                                }, []).map((row: any) => (
                                    <TableRow key={row.sirket}>
                                        <TableCell className="font-medium">{row.sirket}</TableCell>
                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(row.toplamPrim)}</TableCell>
                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(row.toplamKomisyon)}</TableCell>
                                        <TableCell className="text-right">{row.policeSayisi}</TableCell>
                                    </TableRow>
                                ))}
                                {(!filteredOzet || filteredOzet.length === 0) && (
                                     <TableRow><TableCell colSpan={4} className="text-center h-12">Veri yok</TableCell></TableRow>
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

        // 1. Filter
        if (statusFilter !== "ALL") {
            sorted = sorted.filter((p: any) => {
                if (statusFilter === "EVET") return p.dekontDurumu === "EVET";
                if (statusFilter === "HAYIR") return p.dekontDurumu !== "EVET" && p.dekontDurumu !== "TUTAR FARKI"; // Or should HAYIR include null/empty?
                // Actually 'HAYIR' usually just means not EVET in user's mind, but let's be precise.
                // In VeriYukleme we used: p.dekontDurumu !== 'EVET' for HAYIR (simplified).
                // Let's stick to simple logic:
                if (statusFilter === "HAYIR") return p.dekontDurumu === "HAYIR" || !p.dekontDurumu;
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
    }, [policeler, sortConfig, statusFilter, sigortaliFilter]);

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

    // Calculate summary stats
    const stats = useMemo(() => {
        let evet = 0;
        let hayir = 0;
        sortedPoliceler.forEach((p: any) => {
            if (p.dekontDurumu === 'EVET') evet++;
            else hayir++;
        });
        return { evet, hayir };
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
                            <SelectTrigger className="w-[150px] h-9">
                                <SelectValue placeholder="Dekont Durumu" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Tümü</SelectItem>
                                <SelectItem value="EVET">Dekont Evet</SelectItem>
                                <SelectItem value="HAYIR">Dekont Hayır</SelectItem>
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
                                    sortedPoliceler.slice(0, 500).map((p: any) => (
                                        <TableRow key={p.id}>
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
                                                    <Badge variant="secondary">HAYIR</Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

        </div>
    );
}

// ---------------------------------------------------------------------------
// 3. VERİ YÜKLEME TAB COMPONENT
// ---------------------------------------------------------------------------
function VeriYukleme({ yil }: { yil: number }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [subTab, setSubTab] = useState("mapfre");

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

    // Bulk Update Handler
    const handleBulkUpdate = async () => {
        if (selectedPolicies.length === 0) return;
        
        const confirmUpdate = window.confirm(`${selectedPolicies.length} adet poliçeyi 'EVET' olarak işaretlemek istediğinize emin misiniz?`);
        if (!confirmUpdate) return;

        try {
            const updates = selectedPolicies.map(id => {
                 const original = storedPolicies.find((p:any) => p.id === id);
                 if (!original) return null;
                 return { ...original, dekontDurumu: "EVET" };
            }).filter(Boolean);

            const res = await apiRequest("POST", "/api/sigorta/policeler", updates);
            const result = await res.json();
            
            if (result.success) {
                toast({ title: "Başarılı", description: "Seçilen poliçeler güncellendi." });
                setSelectedPolicies([]);
                refetch();
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

    // Helper to extract month from dates like "10.01.2025" or Excel serial date
    const extractMonthAndYear = (dateVal: any): {ay: string, yil: number} | null => {
        if (!dateVal) return { ay: "1", yil };

        // If Excel serial number
        if (typeof dateVal === 'number') {
            const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            return { ay: String(date.getMonth() + 1), yil: date.getFullYear() };
        }

        const dateStr = String(dateVal).trim();
        let parts = dateStr.split('.');
        if (parts.length > 1) return { ay: String(parseInt(parts[1])), yil: parseInt(parts[2]) };
        
        parts = dateStr.split('-');
        if (parts.length > 1) return { ay: String(parseInt(parts[1])), yil: parseInt(parts[0].length === 4 ? parts[0] : parts[2]) };
        
        parts = dateStr.split('/');
        if (parts.length > 1) return { ay: String(parseInt(parts[1])), yil: parseInt(parts[2]) };

        return { ay: "1", yil }; 
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
                    
                    const policiesToSave: any[] = [];
                    const uniqueMap = new Map<string, any>();
                    // Start from row 1 (exclude header row 0)
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row || row.length < 2) continue; // Skip empty rows

                        // Check indispensable fields (e.g. Policy No)
                        const pNo = row[1]; 
                        if (!pNo) continue;

                        const dateInfo = extractMonthAndYear(row[3]);
                        
                        const policy = {
                            brans: String(row[0] || ""),
                            policeNo: String(pNo).replace(/[^a-zA-Z0-9]/g, ""),
                            sigortali: String(row[2] || ""),
                            tanzimTarihi: formatExcelDate(row[3]), // Use formatter here
                            netPrim: String(parseAmount(row[4])),
                            brutPrim: String(parseAmount(row[5])),
                            komisyon: String(parseAmount(row[6])),
                            sigortaBedeli: String(parseAmount(row[7])),
                            sirket: subTab === "mapfre" ? COMPANIES.MAPFRE : COMPANIES.RAY,
                            dekontDurumu: "", // Initially empty
                            ay: dateInfo ? dateInfo.ay : "1", // Estimate month from date
                            yil: dateInfo ? dateInfo.yil : yil // Estimate year from date or use global
                        };

                        // Aggregation key (PolicyNo + Company)
                        const key = `${policy.policeNo}-${policy.sirket}`;
                        
                        if (uniqueMap.has(key)) {
                            // Merge with existing policy (Zeyil/Cancellation logic: Sum amounts)
                            const existing = uniqueMap.get(key);
                            existing.netPrim = String(parseFloat(existing.netPrim) + parseFloat(policy.netPrim));
                            existing.brutPrim = String(parseFloat(existing.brutPrim) + parseFloat(policy.brutPrim));
                            existing.komisyon = String(parseFloat(existing.komisyon) + parseFloat(policy.komisyon));
                            existing.sigortaBedeli = String(parseFloat(existing.sigortaBedeli) + parseFloat(policy.sigortaBedeli));
                            // Keep other fields (like oldest date?) or just keep existing. 
                            // Usually Main policy date is preferred. Assuming first occurrence is Main.
                        } else {
                            uniqueMap.set(key, policy);
                            // policiesToSave array is derived from map later
                        }
                    }

                    // Convert map values to array
                    policiesToSave.push(...Array.from(uniqueMap.values()));


                    
                    if (policiesToSave.length > 0) {
                         // Upsert to DB
                         console.log("Saving policies:", policiesToSave.length);
                         const res = await apiRequest("POST", "/api/sigorta/policeler", policiesToSave);
                         const result = await res.json();
                         if (result.success) {
                             toast({ title: "Yükleme Başarılı", description: `${result.count} poliçe işlendi/güncellendi.` });
                             refetch(); // Refresh the list from DB
                             queryClient.invalidateQueries({ queryKey: ['sigorta-ozet'] });
                             queryClient.invalidateQueries({ queryKey: ['sigorta-policeler'] });
                         }
                    } else {
                         console.warn("No policies found. Scan result:", jsonData.slice(0, 2));
                         if (jsonData.length > 1) {
                             const firstRow = jsonData[1];
                             toast({ 
                                 variant: "destructive", 
                                 title: "Veri Eşleşmedi", 
                                 description: `Excel okundu (${jsonData.length} satır) fakat 'Poliçe No' (B Sütunu) bulunamadı. İlk satır verisi: ${JSON.stringify(firstRow).substring(0, 100)}` 
                             });
                         } else {
                             toast({ variant: "destructive", title: "Dosya Boş", description: "Excel dosyasında veri satırı bulunamadı." });
                         }
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

                    // Start from row 1
                    for (let i = 1; i < jsonData.length; i++) {
                        const row = jsonData[i];
                        if (!row) continue;

                        const accountingPolicyNo = String(row[1] || "").replace(/[^a-zA-Z0-9]/g, ""); // "259" or "21025...259"
                        const accAmountStr = row[3] ? row[3] : row[4]; // Borç or Alacak? Usually Borç implies debt to company?
                        // Actually parsing columns: Borc(3), Alacak(4). 
                        // Accounting record usually represents a debt for us or them? 
                        // If it's a payment TO us: Borc? 
                        // Let's use logic: We just need to match Amount against Policy BrutPrim.
                        // Calculate absolute mismatch.
                        const accBorc = parseAmount(row[3]);
                        const accAlacak = parseAmount(row[4]);
                        const accAmount = accBorc > 0 ? accBorc : accAlacak;

                        const sirket = subTab === 'mapfre' ? COMPANIES.MAPFRE : COMPANIES.RAY;

                        // Create Accounting Record Object
                        const accRecord = {
                            tarih: formatExcelDate(row[0]),
                            belgeNo: String(row[1] || ""),
                            aciklama: String(row[2] || ""),
                            borc: String(accBorc),
                            alacak: String(accAlacak),
                            bakiye: String(parseAmount(row[5])),
                            sirket: sirket,
                            ay: extractMonthAndYear(row[0])?.ay || "1",
                            yil: yil, // Current selected year
                            eslestiMi: 0 as 0 | 1,
                            eslesenPolicyId: null as string | null
                        };

                        let matchedPolicy: any = null;

                        // ----------------------------------------------------------------
                        // MATCHING ALGORITHM
                        // ----------------------------------------------------------------
                        if (subTab === 'mapfre') {
                            // MAPFRE LOGIC
                            // 1. Try Exact Match First (Full Number) using accountingPolicyNo
                            if (policyMap.has(accountingPolicyNo)) {
                                matchedPolicy = policyMap.get(accountingPolicyNo);
                            } 
                            // 2. Try Suffix Match
                            if (!matchedPolicy && accountingPolicyNo) {
                                // accountingPolicyNo is likely "259"
                                const suffixKey = String(parseInt(accountingPolicyNo)); // Normalize to significant digits
                                const candidates = mapfreSuffixMap.get(suffixKey);
                                if (candidates) {
                                     // Filter by Amount DISABLED as requested
                                     // matchedPolicy = candidates.find(p => {
                                     //     const pBrut = parseFloat(p.brutPrim);
                                     //     return Math.abs(pBrut - accAmount) < 1.0;
                                     // });
                                     
                                     // Just take the first finding for now, or maybe check duplicates?
                                     // If multiple candidates share the same suffix, this is risky without amount check.
                                     // But user asked to disable amount check.
                                     if (candidates.length > 0) {
                                         matchedPolicy = candidates[0];
                                         console.log(`Mapfre Fuzzy Match: Acc=${accountingPolicyNo} Suffix=${suffixKey} -> Policy=${matchedPolicy.policeNo}`);
                                     }
                                     if (candidates.length > 1) {
                                         console.warn(`Multiple candidates for suffix ${suffixKey}:`, candidates.map(c => c.policeNo));
                                     }
                                }
                            }
                        } else {
                            // RAY LOGIC (Status Quo)
                            if (accountingPolicyNo && policyMap.has(accountingPolicyNo)) {
                                matchedPolicy = policyMap.get(accountingPolicyNo);
                            }
                        }

                        // IF MATCH FOUND
                        if (matchedPolicy) {
                             // Update Policy Status
                             const updatedPolicy = { ...matchedPolicy, dekontDurumu: "EVET" };
                             policiesToUpdate.set(matchedPolicy.id, updatedPolicy);
                             
                             // Update Accounting Record Status
                             accRecord.eslestiMi = 1;
                             accRecord.eslesenPolicyId = matchedPolicy.id;
                             matchCount++;
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

                    refetch();        // Update Policies List
                    refetchMuhasebe(); // Update Accounting List
                    
                    const unmatchedCount = accountingToSave.filter(r => r.eslestiMi === 0).length;
                    if (unmatchedCount > 0) {
                         toast({ variant: "default", title: "Bilgi", description: `${unmatchedCount} adet eşleşmeyen muhasebe kaydı sisteme eklendi.` });
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
                    <CardTitle>{subTab === 'mapfre' ? 'Mapfre' : 'Ray'} Veri Yükleme</CardTitle>
                    <CardDescription>
                        {yil} yılı poliçe excelini (Kümülatif veya Aylık) buraya yükleyin. Sistem otomatik olarak birleştirecektir.
                    </CardDescription>
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
                                                                <Badge variant="secondary">HAYIR</Badge>
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
                                    <div className="p-4 bg-red-50 border-b border-red-100 text-red-800 text-sm">
                                        Bu listedeki kayıtlar Muhasebe Excel'inde bulunup poliçe listesinde eşleşmeyenlerdir (Evrak No/Poliçe No bulunamadı).
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
                                                        <TableCell className="text-right">{new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(parseFloat(rec.bakiye || '0'))}</TableCell>
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
                            <span className="font-bold text-foreground">Kayıt: {selectedUnmatchedRecord ? `${selectedUnmatchedRecord.belgeNo} - ${new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(parseFloat(selectedUnmatchedRecord.bakiye || '0'))}` : ''}</span>
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex gap-2 mb-4">
                        <Input 
                            placeholder="Poliçe Ara..." 
                            value={matchSearchQuery}
                            onChange={(e) => setMatchSearchQuery(e.target.value)}
                        />
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
                                {storedPolicies?.filter((p: any) => p.dekontDurumu !== 'EVET')
                                    .filter((p: any) => 
                                        matchSearchQuery 
                                            ? (p.policeNo.includes(matchSearchQuery) || String(p.sigortali).toLowerCase().includes(matchSearchQuery.toLowerCase()))
                                            : true 
                                        // Maybe restrict results if query is empty? No, show first few.
                                    )
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

// Helper components (SigortaOzet, PoliceListesi) remain...
// Actually wait, SigortaOzet and PoliceListesi are defined ABOVE/OUTSIDE or INSIDE?
// They were imported or defined in same file. 
// Ah, looking at lines 134, 138 - they are used. 
// But the end of file was:
// 988:         </Tabs>
// 989:     );
// 990: };
// 991: 
// So the Sigorta function ends at 990.
// My replacement chunk should replace the closing tags correctly.

