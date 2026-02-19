import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, AlertTriangle, CheckCircle2, Info, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { format, differenceInDays, parse } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CustomerRisk {
  name: string;
  balance: number;
  lastDebtDate: Date | null;
  lastCreditDate: Date | null;
  daysSinceLastCredit: number;
  status: "Normal" | "Sarı" | "Turuncu" | "Kırmızı";
  persona: string;
}

const CustomerRow = ({ item, getStatusColor }: { item: CustomerRisk, getStatusColor: (status: string) => string }) => (
  <TableRow>
    <TableCell className="font-medium">{item.name}</TableCell>
    <TableCell className="text-right font-semibold">
      {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(item.balance)}
    </TableCell>
    <TableCell>{item.lastDebtDate ? format(item.lastDebtDate, "dd.MM.yyyy") : "-"}</TableCell>
    <TableCell>{item.lastCreditDate ? format(item.lastCreditDate, "dd.MM.yyyy") : "-"}</TableCell>
    <TableCell>
      <span className={item.daysSinceLastCredit > 30 ? "text-red-600 font-bold" : ""}>
        {item.daysSinceLastCredit} Gün
      </span>
    </TableCell>
    <TableCell>
      <Badge className={getStatusColor(item.status)}>
        {item.status}
      </Badge>
    </TableCell>
    <TableCell>
      <div className="flex items-center gap-1.5">
        {item.status === "Kırmızı" && <AlertTriangle className="w-4 h-4 text-red-500" />}
        {item.status === "Normal" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
        {item.status === "Sarı" && <Info className="w-4 h-4 text-yellow-500" />}
        <span>{item.persona}</span>
      </div>
    </TableCell>
  </TableRow>
);

export default function Tahsilat() {
  const [data, setData] = useState<CustomerRisk[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: "A" }) as any[];

        // Skip header rows (assuming row 1 is headers)
        const rows = jsonData.slice(1);

        const parseExcelDate = (val: any): Date | null => {
          if (val instanceof Date) return val;
          if (typeof val === "string" && val.includes(".")) {
            try {
              return parse(val.trim(), "dd.MM.yyyy", new Date());
            } catch (e) {
              return null;
            }
          }
          if (typeof val === "number") {
             // Handle Excel serial numbers if they come through
             return new Date((val - 25569) * 86400 * 1000);
          }
          return null;
        };

        const processedData: CustomerRisk[] = rows
          .map((row: any) => {
            const name = row.C || "Bilinmeyen Müşteri";
            const rawBalance = row.H;
            let balance = 0;
            if (typeof rawBalance === "number") {
              balance = rawBalance;
            } else if (typeof rawBalance === "string") {
              balance = parseFloat(rawBalance.replace(/\./g, "").replace(",", ".")) || 0;
            }
            const lastDebtDate = parseExcelDate(row.L);
            const lastCreditDate = parseExcelDate(row.M);

            if (balance <= 0) return null;

            let daysSinceLastCredit = 0;
            let status: "Normal" | "Sarı" | "Turuncu" | "Kırmızı" = "Normal";
            let persona = "Altın Müşteri";

            if (!lastCreditDate) {
              // HIÇ ÖDEME YAPMAMIŞ (EN KÖTÜ DURUM)
              daysSinceLastCredit = lastDebtDate ? differenceInDays(new Date(), lastDebtDate) : 999;
              status = "Kırmızı";
              persona = "Zombi (Hiç Ödeme Yok)";
            } else {
              daysSinceLastCredit = differenceInDays(new Date(), lastCreditDate);
              
              if (daysSinceLastCredit > 30) status = "Kırmızı";
              else if (daysSinceLastCredit > 20) status = "Turuncu";
              else if (daysSinceLastCredit > 10) status = "Sarı";

              if (status === "Kırmızı" || status === "Turuncu") {
                if (lastDebtDate && lastDebtDate > lastCreditDate) {
                  persona = "Zombi (Aktif Borçlu)";
                } else {
                  persona = "Donuk Alacak";
                }
              } else if (status === "Sarı") {
                persona = "Takip Gereken";
              }
            }

            return {
              name,
              balance,
              lastDebtDate,
              lastCreditDate,
              daysSinceLastCredit,
              status,
              persona,
            };
          })
          .filter((item): item is CustomerRisk => item !== null);

        setData(processedData);
        toast({
          title: "Dosya Yüklendi",
          description: `${processedData.length} müşteri kaydı analiz edildi.`,
        });
      } catch (error) {
        console.error("Excel processing error:", error);
        toast({
          variant: "destructive",
          title: "Hata",
          description: "Excel dosyası işlenirken bir hata oluştu.",
        });
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredData = data.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    totalBalance: data.reduce((acc, curr) => acc + curr.balance, 0),
    redCount: data.filter((d) => d.status === "Kırmızı").length,
    orangeCount: data.filter((d) => d.status === "Turuncu").length,
    yellowCount: data.filter((d) => d.status === "Sarı").length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Kırmızı": return "bg-red-500 text-white hover:bg-red-600";
      case "Turuncu": return "bg-orange-500 text-white hover:bg-orange-600";
      case "Sarı": return "bg-yellow-500 text-black hover:bg-yellow-600";
      default: return "bg-green-500 text-white hover:bg-green-600";
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Müşteri Tahsilat Analizi</h1>
          <p className="text-muted-foreground">Mizan verilerini yükleyerek müşteri risk skorlarını inceleyin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden"
            id="excel-upload"
          />
          <Button asChild variant="outline" className="cursor-pointer">
            <label htmlFor="excel-upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Mizan Yükle (.xlsx)
            </label>
          </Button>
        </div>
      </div>

      {data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Toplam Alacak</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(stats.totalBalance)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400">Kritik Risk (31+ Gün)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.redCount} Müşteri</div>
            </CardContent>
          </Card>
          <Card className="bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-orange-600 dark:text-orange-400">Yüksek Risk (21-30 Gün)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.orangeCount} Müşteri</div>
            </CardContent>
          </Card>
          <Card className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-yellow-700 dark:text-yellow-500">Orta Risk (11-20 Gün)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-500">{stats.yellowCount} Müşteri</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <Tabs defaultValue="all" className="w-full">
          <CardHeader className="pb-3 flex flex-col space-y-4">
            <div className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle>Mizan Listesi</CardTitle>
                <CardDescription>
                  Müşterileri risk durumlarına göre inceleyin.
                </CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Müşteri Ara..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">Tüm Liste ({data.length})</TabsTrigger>
              <TabsTrigger value="red" className="gap-2 text-red-600 data-[state=active]:bg-red-50">
                Kırmızı ({stats.redCount})
              </TabsTrigger>
              <TabsTrigger value="orange" className="gap-2 text-orange-600 data-[state=active]:bg-orange-50">
                Turuncu ({stats.orangeCount})
              </TabsTrigger>
              <TabsTrigger value="yellow" className="gap-2 text-yellow-700 data-[state=active]:bg-yellow-50">
                Sarı ({stats.yellowCount})
              </TabsTrigger>
              <TabsTrigger value="normal" className="gap-2 text-green-600 data-[state=active]:bg-green-50">
                Normal
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent>
            {[
              { id: "all", filter: () => true, empty: "Veri bulunamadı. Lütfen mizan yükleyin." },
              { id: "red", filter: (item: any) => item.status === "Kırmızı", empty: "Kritik riskli müşteri bulunmuyor. ✅" },
              { id: "orange", filter: (item: any) => item.status === "Turuncu", empty: "Yüksek riskli müşteri bulunmuyor. ✅" },
              { id: "yellow", filter: (item: any) => item.status === "Sarı", empty: "Orta riskli müşteri bulunmuyor. ✅" },
              { id: "normal", filter: (item: any) => item.status === "Normal", empty: "Normal durumunda müşteri bulunmuyor." }
            ].map((tab) => (
              <TabsContent key={tab.id} value={tab.id} className="mt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Müşteri Adı</TableHead>
                      <TableHead className="text-right">Borç Bakiyesi</TableHead>
                      <TableHead>Son Fatura (L)</TableHead>
                      <TableHead>Son Ödeme (M)</TableHead>
                      <TableHead>Gecikme (Gün)</TableHead>
                      <TableHead>Risk Durumu</TableHead>
                      <TableHead>Persona</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.filter(tab.filter).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          {tab.empty}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredData
                        .filter(tab.filter)
                        .sort((a, b) => b.balance - a.balance)
                        .map((item, idx) => (
                          <CustomerRow key={idx} item={item} getStatusColor={getStatusColor} />
                        ))
                    )}
                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
