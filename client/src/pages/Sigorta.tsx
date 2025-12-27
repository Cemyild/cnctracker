import { useState } from "react";
import * as XLSX from "xlsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertCircle, Upload, Search, FileSpreadsheet, ArrowRightLeft } from "lucide-react";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { useToast } from "@/hooks/use-toast";

type MatchStatus = 'matched' | 'amount_mismatch' | 'missing' | 'pending';

interface PolicyRow {
    id: number;
    policyNo: string;
    amount: number;
    raw: any;
    status: MatchStatus;
    matchDetails?: string;
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

export default function Sigorta() {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<string>("mapfre");

    // State for each company
    const [mapfreData, setMapfreData] = useState<CompanyData>({
        policyFile: null,
        accountingFile: null,
        policies: [],
        accountingData: [],
        isAnalyzed: false
    });

    const [rayData, setRayData] = useState<CompanyData>({
        policyFile: null,
        accountingFile: null,
        policies: [],
        accountingData: [],
        isAnalyzed: false
    });

    const currentData = activeTab === "mapfre" ? mapfreData : rayData;
    const setCurrentData = activeTab === "mapfre" ? setMapfreData : setRayData;

    // Helper to find column by loose matching
    const findColumnValue = (row: any, possibleNames: string[]): any => {
        const keys = Object.keys(row);
        for (const name of possibleNames) {
            const key = keys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(name.toLowerCase().replace(/[^a-z0-9]/g, '')));
            if (key) return row[key];
        }
        return undefined;
    };

    // Helper to normalize policy numbers (remove non-alphanumeric)
    const normalizePolicyNo = (val: any) => {
        if (!val) return "";
        return String(val).replace(/[^a-zA-Z0-9]/g, "");
    };

    // Helper to parse amount
    const parseAmount = (val: any) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        // Remove currency symbols, spaces, handle european format (1.234,56) vs US (1,234.56)
        // Assuming TR format: dot is entry separator or ignored, comma is decimal
        const str = String(val).replace(/[^0-9,.-]/g, '');
        if (str.includes(',') && str.includes('.')) {
            // If matches 1.234,56 -> remove dots, replace comma with dot
            // If matches 1,234.56 -> remove commas
            if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
                // 1.234,56 format
                return parseFloat(str.replace(/\./g, '').replace(',', '.'));
            } else {
                return parseFloat(str.replace(/,/g, ''));
            }
        } else if (str.includes(',')) {
            return parseFloat(str.replace(',', '.'));
        }
        return parseFloat(str);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'policy' | 'accounting') => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const data = await readExcel(file);

            setCurrentData(prev => {
                const newState = { ...prev };
                if (type === 'policy') {
                    newState.policyFile = file;
                    // Pre-process policies
                    newState.policies = data.map((row: any, idx: number) => {
                        // Attempt to find Policy No and Amount columns
                        const pNo = findColumnValue(row, ['police', 'policy', 'poliçe']);
                        const amt = findColumnValue(row, ['tutar', 'prim', 'brut', 'net', 'borc', 'meblağ']);
                        return {
                            id: idx,
                            policyNo: normalizePolicyNo(pNo),
                            amount: parseAmount(amt),
                            raw: row,
                            status: 'pending'
                        };
                    }).filter(p => p.policyNo.length > 3); // Filter partial/empty rows
                } else {
                    newState.accountingFile = file;
                    newState.accountingData = data;
                }
                newState.isAnalyzed = false; // Reset analysis
                return newState;
            });

            toast({
                title: "Dosya Yüklendi",
                description: `${file.name} başarıyla okundu. ${data.length} satır bulundu.`,
            });

        } catch (error) {
            console.error(error);
            toast({
                variant: "destructive",
                title: "Hata",
                description: "Dosya okunurken bir hata oluştu.",
            });
        }
    };

    const readExcel = (file: File): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(sheet);
                    resolve(json);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsBinaryString(file);
        });
    };

    const runMatching = () => {
        if (!currentData.policies.length || !currentData.accountingData.length) {
            toast({
                variant: "destructive",
                title: "Eksik Veri",
                description: "Lütfen her iki listeyi de yükleyin.",
            });
            return;
        }

        // Index accounting data for faster lookup
        // We structure it as Map<PolicyNo, Amount[]> because duplicates might exist
        const accMap = new Map<string, number[]>();

        currentData.accountingData.forEach(row => {
            const pNo = normalizePolicyNo(findColumnValue(row, ['police', 'policy', 'poliçe', 'aciklama'])); // Sometimes in description
            const amt = parseAmount(findColumnValue(row, ['tutar', 'borc', 'alacak', 'meblağ']));

            if (pNo && pNo.length > 3) {
                if (!accMap.has(pNo)) {
                    accMap.set(pNo, []);
                }
                accMap.get(pNo)?.push(amt);
            } else {
                // If policy number not found in column, verify if description contains it? 
                // For now, simplify.
            }
        });

        const newPolicies = currentData.policies.map(policy => {
            const matches = accMap.get(policy.policyNo);

            if (!matches) {
                return { ...policy, status: 'missing' as MatchStatus, matchDetails: 'Muhasebede bulunamadı' };
            }

            // Check amounts (allow 1.0 margin of error)
            const amountMatch = matches.some(m => Math.abs(m - policy.amount) < 1.0);

            if (amountMatch) {
                return { ...policy, status: 'matched' as MatchStatus, matchDetails: 'Eşleşti' };
            } else {
                return {
                    ...policy,
                    status: 'amount_mismatch' as MatchStatus,
                    matchDetails: `Tutar farkı (Beklenen: ${matches.join(', ')})`
                };
            }
        });

        setCurrentData(prev => ({
            ...prev,
            policies: newPolicies,
            isAnalyzed: true
        }));

        toast({
            title: "Analiz Tamamlandı",
            description: `${newPolicies.filter(p => p.status === 'matched').length} / ${newPolicies.length} poliçe eşleşti.`,
        });
    };

    const getStatusBadge = (status: MatchStatus) => {
        switch (status) {
            case 'matched':
                return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" /> Eşleşti</Badge>;
            case 'amount_mismatch':
                return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> Tutar Farklı</Badge>;
            case 'missing':
                return <Badge variant="secondary" className="text-gray-500"><XCircle className="w-3 h-3 mr-1" /> Bulunamadı</Badge>;
            default:
                return <Badge variant="outline">Bekliyor</Badge>;
        }
    };

    return (
        <div className="relative min-h-full">
            <BackgroundPaths />
            <div className="relative z-10 p-6 lg:p-8 space-y-6">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Sigorta Mutabakatı</h2>
                        <p className="text-muted-foreground mt-1">
                            Sigorta şirketleri ve muhasebe kayıtları arasındaki poliçe eşleşmelerini kontrol edin.
                        </p>
                    </div>
                </div>

                <Tabs defaultValue="mapfre" value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                        <TabsTrigger value="mapfre">Mapfre Sigorta</TabsTrigger>
                        <TabsTrigger value="ray">Ray Sigorta</TabsTrigger>
                    </TabsList>

                    <div className="mt-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>{activeTab === 'mapfre' ? 'Mapfre' : 'Ray Sigorta'} Mutabakat İşlemleri</CardTitle>
                                <CardDescription>
                                    Lütfen önce sigorta şirketinden gelen listeyi, sonra muhasebe programından aldığınız listeyi yükleyin.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Policy Upload */}
                                    <div className="space-y-4 p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
                                                <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold">{activeTab === 'mapfre' ? 'Mapfre' : 'Ray'} Poliçe Listesi</h3>
                                                <p className="text-xs text-muted-foreground">Excel dosyası (.xlsx, .xls)</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="file"
                                                accept=".xlsx, .xls"
                                                onChange={(e) => handleFileUpload(e, 'policy')}
                                                className="cursor-pointer"
                                            />
                                        </div>
                                        {currentData.policies.length > 0 && (
                                            <div className="text-sm text-green-600 flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4" />
                                                {currentData.policies.length} poliçe okundu
                                            </div>
                                        )}
                                    </div>

                                    {/* Accounting Upload */}
                                    <div className="space-y-4 p-4 border rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-full">
                                                <FileSpreadsheet className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold">Muhasebe Hesap Listesi</h3>
                                                <p className="text-xs text-muted-foreground">Excel dosyası (.xlsx, .xls)</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="file"
                                                accept=".xlsx, .xls"
                                                onChange={(e) => handleFileUpload(e, 'accounting')}
                                                className="cursor-pointer"
                                            />
                                        </div>
                                        {currentData.accountingData.length > 0 && (
                                            <div className="text-sm text-green-600 flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4" />
                                                {currentData.accountingData.length} kayıt okundu
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-center pt-4">
                                    <Button
                                        size="lg"
                                        onClick={runMatching}
                                        disabled={currentData.policies.length === 0 || currentData.accountingData.length === 0}
                                        className="w-full md:w-auto min-w-[200px]"
                                    >
                                        <Search className="w-4 h-4 mr-2" />
                                        Karşılaştır ve Kontrol Et
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Results Table */}
                        {currentData.policies.length > 0 && (
                            <Card className="mt-6">
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <CardTitle>Sonuçlar</CardTitle>
                                        <div className="flex gap-2">
                                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                {currentData.policies.filter(p => p.status === 'matched').length} Eşleşen
                                            </Badge>
                                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                                {currentData.policies.filter(p => p.status !== 'matched' && p.status !== 'pending').length} Sorunlu
                                            </Badge>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="rounded-md border">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-[50px]">Durum</TableHead>
                                                    <TableHead>Poliçe No</TableHead>
                                                    <TableHead className="text-right">Tutar (Poliçe)</TableHead>
                                                    <TableHead>Detay</TableHead>
                                                    {/* Dynamic headers from raw data could be added here if needed */}
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {currentData.policies.slice(0, 500).map((row) => (
                                                    <TableRow key={row.id} className={row.status === 'matched' ? 'bg-green-50/30' : (row.status !== 'pending' ? 'bg-red-50/30' : '')}>
                                                        <TableCell>{getStatusBadge(row.status)}</TableCell>
                                                        <TableCell className="font-medium">{row.policyNo}</TableCell>
                                                        <TableCell className="text-right">
                                                            {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(row.amount)}
                                                        </TableCell>
                                                        <TableCell className="text-sm text-muted-foreground">{row.matchDetails || '-'}</TableCell>
                                                    </TableRow>
                                                ))}
                                                {currentData.policies.length === 0 && (
                                                    <TableRow>
                                                        <TableCell colSpan={4} className="h-24 text-center">
                                                            Veri yok. Lütfen dosya yükleyin.
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                    {currentData.policies.length > 500 && (
                                        <p className="text-xs text-muted-foreground text-center mt-4">
                                            Toplam {currentData.policies.length} kayıttan ilk 500 tanesi gösteriliyor.
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </Tabs>
            </div>
        </div>
    );
}
