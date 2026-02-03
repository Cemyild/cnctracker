import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { Loader2, TrendingUp, Calculator, Lock, Unlock, ArrowRight, PieChart as PieIcon } from "lucide-react";
import { aylar } from "@shared/schema";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

import { Checkbox } from "@/components/ui/checkbox";

// Type definitions matching the API response
interface OzetSummaryItem {
  ay: string;
  satisKdvHaric: number;
  satisKdv: number;
  satisToplam: number;
  giderKdvHaric: number;
  giderKdv: number;
  giderToplam: number;
  calisanBrut: number;
  calisanNet: number;
  calisanIsverenSgk: number;
  calisanMaliyet: number;
  yonetimNetUcret?: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AnalysisTab() {
  // --- States ---
  const [baseYear] = useState<number>(2025);
  const [targetYear] = useState<number>(2026);

  // Projection Settings
  const [salesGrowthRate, setSalesGrowthRate] = useState<number>(1.30); // Default 30%
  const [expenseGrowthRate, setExpenseGrowthRate] = useState<number>(1.30); // Default 30%
  const [inflationRate, setInflationRate] = useState<number>(1.45); // 45% Inflation for salaries

  // Salary Mode: 'smart' = Auto-calculate based on inflation, 'manual' = User inputs
  const [salaryMode, setSalaryMode] = useState<'smart' | 'manual'>('smart');
  const [excludeManagement, setExcludeManagement] = useState(false);
  
  // Manual Salaries Store: { 'ocak': 50000, 'subat': 55000 ... }
  // Manual Salaries Store: { 'ocak': 50000, 'subat': 55000 ... }
  const [manualSalaries, setManualSalaries] = useState<Record<string, number>>({});

  // Chart Settings
  const [personnelChartMetric, setPersonnelChartMetric] = useState<'net' | 'cost'>('cost');

  // --- Data Fetching ---
  const { data: baseData, isLoading: baseLoading } = useQuery<OzetSummaryItem[]>({
    queryKey: ["/api/gumruk/ozet-summary", String(baseYear)],
  });

  const { data: targetData, isLoading: targetLoading } = useQuery<OzetSummaryItem[]>({
    queryKey: ["/api/gumruk/ozet-summary", String(targetYear)],
  });

  // --- Effects ---
  // Calculate initial growth rate based on January comparison if available
  useEffect(() => {
    if (baseData && targetData) {
      const baseJan = baseData.find(d => d.ay === 'ocak');
      const targetJan = targetData.find(d => d.ay === 'ocak');

      if (baseJan && targetJan && baseJan.satisToplam > 0) {
        const measuredRate = targetJan.satisToplam / baseJan.satisToplam;
        // Update state only if it hasn't been touched yet (simple logic for now)
        // For now, let's just log or suggest it. 
        // Or set it once. 
        // setSalesGrowthRate(Number(measuredRate.toFixed(2)));
      }
    }
  }, [baseData, targetData]);

  // --- Logic ---
  const projectionData = useMemo(() => {
    if (!baseData) return [];

    return aylar.map((ayItem) => {
      const ayKey = ayItem.value;
      
      // 1. Get Base Year Data (2025)
      const baseMonthData = baseData.find(d => d.ay === ayKey);
      
      // 2. Get Actual Target Year Data (2026) - if exists (e.g. January)
      const actualTargetData = targetData?.find(d => d.ay === ayKey);
      const hasActualData = !!actualTargetData && (actualTargetData.satisToplam > 0 || actualTargetData.giderToplam > 0);

      // 3. Components
      let projectedSales = 0;
      let projectedExpense = 0;
      let projectedSalary = 0;

      if (hasActualData) {
        // Use ACTUAL data if available
        projectedSales = actualTargetData.satisToplam;
        projectedExpense = actualTargetData.giderToplam;
        
        // For salary, allow override even if data exists? 
        // Usually actuals are final. But let's assume if it came from DB, it's real.
        // However, user said "2026 Jan salaries not uploaded yet". 
        // So we might need to check if salary is 0.
        if (actualTargetData.calisanMaliyet > 0) {
             projectedSalary = actualTargetData.calisanMaliyet;
        } else {
             // Fallback to projection if DB has 0
             if (salaryMode === 'manual') {
                 projectedSalary = manualSalaries[ayKey] || 0;
             } else {
                 // Smart Mode: Dec 2025 * Inflation? Or Base Month * Inflation?
                 // Usually salaries are flat or step-increased. 
                 // Let's use Base Month * Inflation for simplicity of "Year over Year" 
                 // OR better: use last known salary (Dec 2025) * Inflation.
                 // Let's stick to Base Month * Inflation for matching seasonality/staffing count?
                 // No, salary is usually fixed.
                 // Let's use: Base Month Cost * Inflation.
                 projectedSalary = (baseMonthData?.calisanMaliyet || 0) * inflationRate;
             }
        }

      } else {
        // PROJECTION Calculation
        const baseSales = baseMonthData?.satisToplam || 0; // Total (Net+VAT) for legacy logic reference? 
        // Actually we need Net for growth application if we want to be precise, but usually growth applies to everything.
        // Let's calculate parts:
        
        projectedSales = (baseMonthData?.satisToplam || 0) * salesGrowthRate;
        projectedExpense = (baseMonthData?.giderToplam || 0) * expenseGrowthRate;

        // Salary Projection
         if (salaryMode === 'manual') {
             projectedSalary = manualSalaries[ayKey] || 0;
         } else {
             // Base cost adjusted for exclusion if needed
             let baseCost = baseMonthData?.calisanMaliyet || 0;
             if (excludeManagement) {
                baseCost -= (baseMonthData?.yonetimNetUcret || 0);
             }
             projectedSalary = baseCost * inflationRate;
         }
      }

      // Calculate Projected Net Salary for Charts (Approximate if Manual)
      let projectedSalaryNet = 0;
      if (hasActualData && actualTargetData) {
          projectedSalaryNet = actualTargetData.calisanNet;
           // If excluding management
           if (excludeManagement && actualTargetData.yonetimNetUcret) {
               // Assuming yonetimNetUcret is the net part to remove
               projectedSalaryNet -= actualTargetData.yonetimNetUcret;
           }
      } else {
          // Projection
          if (salaryMode === 'manual') {
              // In manual mode, we don't know the precise Net/Gross ratio. 
              // We'll estimate based on Base Year ratio for that month.
              const baseNet = baseMonthData?.calisanNet || 0;
              const baseCost = baseMonthData?.calisanMaliyet || 0;
              const ratio = baseCost > 0 ? baseNet / baseCost : 0.65; // Fallback ratio
              projectedSalaryNet = projectedSalary * ratio;
          } else {
              // Smart Mode: Base Net * Inflation
              let baseNet = baseMonthData?.calisanNet || 0;
              if (excludeManagement) {
                 // Management exclusion is usually "Net Ucret" so we just subtract it
                 baseNet -= (baseMonthData?.yonetimNetUcret || 0);
              }
              projectedSalaryNet = baseNet * inflationRate;
          }
      }

      // Handle Exclusion for ACTUALS too if selected
      if (hasActualData && excludeManagement && actualTargetData) {
          // If we are using actuals, we should technically subtract management from actuals too if the user wants "Excluding Management" view.
          // However, actuals are actuals. But for consistency with the toggle "Show Net without Management", we should subtract.
          // Assuming actualTargetData HAS yonetimNetUcret
           projectedSalary -= (actualTargetData.yonetimNetUcret || 0);
      }
      
      const profit = projectedSales - projectedExpense - projectedSalary;
      
      // Breakdown for Columns
      // Base Split
      const baseSalesNet = baseMonthData?.satisKdvHaric || 0;
      const baseSalesVAT = baseMonthData?.satisKdv || 0;

      // Projected Split
      // We need to derive Net/VAT from Projected Total Sales.
      // We assume the VAT ratio remains same as Base Year for that month.
      let projectedSalesNet = 0;
      let projectedSalesVAT = 0;
      
      if (hasActualData && actualTargetData) {
          projectedSalesNet = actualTargetData.satisKdvHaric;
          projectedSalesVAT = actualTargetData.satisKdv;
      } else {
          // Calculate using base ratio
          const baseTotal = baseSalesNet + baseSalesVAT;
          const vatRatio = baseTotal > 0 ? baseSalesVAT / baseTotal : 0.20; // Default to 20% if no base data
          
          projectedSalesVAT = projectedSales * vatRatio;
          projectedSalesNet = projectedSales - projectedSalesVAT;
      }

      return {
        ...ayItem,
        isActual: hasActualData,
        baseSalesTotal: baseMonthData?.satisToplam || 0,
        baseSalesNet,
        baseSalesVAT,
        
        projectedSalesTotal: projectedSales,
        projectedSalesNet,
        projectedSalesVAT,

        projectedExpense,
        projectedSalary,
        projectedSalaryNet,
        profit
      };
    });
  }, [baseData, targetData, salesGrowthRate, expenseGrowthRate, inflationRate, salaryMode, manualSalaries, excludeManagement]);

  // Helper to update manual salary
  const handleManualSalaryChange = (ay: string, val: string) => {
    const num = parseFloat(val);
    setManualSalaries(prev => ({
        ...prev,
        [ay]: isNaN(num) ? 0 : num
    }));
  };

  if (baseLoading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const totalProjectedProfit = projectionData.reduce((acc, curr) => acc + curr.profit, 0);
  const totalProjectedSales = projectionData.reduce((acc, curr) => acc + curr.projectedSalesTotal, 0);

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card className="bg-muted/30 border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            Projeksiyon Parametreleri (2026)
          </CardTitle>
          <CardDescription>
            2025 verileri baz alınarak oluşturulan senaryolar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Growth Rate Slider */}
          <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Satış Büyüme Hedefi</Label>
              <Badge variant="outline">x{salesGrowthRate.toFixed(2)}</Badge>
            </div>
            <Slider 
              min={0.5} max={3.0} step={0.05} 
              value={[salesGrowthRate]} 
              onValueChange={(v) => setSalesGrowthRate(v[0])} 
            />
            <p className="text-xs text-muted-foreground text-right">%{(salesGrowthRate * 100 - 100).toFixed(0)} Büyüme</p>
          </div>

           {/* Expense Rate Slider */}
           <div className="space-y-3">
            <div className="flex justify-between">
              <Label>Gider Artış Beklentisi</Label>
              <Badge variant="outline">x{expenseGrowthRate.toFixed(2)}</Badge>
            </div>
            <Slider 
              min={0.5} max={3.0} step={0.05} 
              value={[expenseGrowthRate]} 
              onValueChange={(v) => setExpenseGrowthRate(v[0])} 
            />
            <p className="text-xs text-muted-foreground text-right">%{(expenseGrowthRate * 100 - 100).toFixed(0)} Artış</p>
          </div>

          {/* Salary Inflation Slider (Only for Smart Mode) */}
          <div className={salaryMode === 'manual' ? 'opacity-50 pointer-events-none space-y-3' : 'space-y-3'}>
             <div className="flex justify-between">
              <Label>Maaş Zam Oranı (Enflasyon)</Label>
              <Badge variant="secondary">x{inflationRate.toFixed(2)}</Badge>
            </div>
            <Slider 
              min={1.0} max={2.5} step={0.05} 
              value={[inflationRate]} 
              onValueChange={(v) => setInflationRate(v[0])} 
            />
             <p className="text-xs text-muted-foreground text-right">%{(inflationRate * 100 - 100).toFixed(0)} Zam</p>
          </div>

          {/* Mode Toggle */}
          <div className="flex flex-col justify-center space-y-3 p-4 bg-background rounded-lg border">
            <Label className="mb-1">Maaş Planlama Yöntemi</Label>
            <div className="flex items-center gap-2">
                <span className={`text-sm ${salaryMode === 'smart' ? 'font-bold' : 'text-muted-foreground'}`}>Akıllı</span>
                <Switch 
                    checked={salaryMode === 'manual'}
                    onCheckedChange={(c) => setSalaryMode(c ? 'manual' : 'smart')}
                />
                <span className={`text-sm ${salaryMode === 'manual' ? 'font-bold' : 'text-muted-foreground'}`}>Manuel Giriş</span>
            </div>
             <p className="text-[10px] text-muted-foreground">
                {salaryMode === 'smart' 
                    ? "2025 Maaşları x Zam Oranı" 
                    : "Her ay için el ile giriş"}
            </p>
          </div>

          {/* Exclude Management Toggle */}
          <div className="flex flex-col justify-center space-y-3 p-4 bg-background rounded-lg border">
            <Label className="mb-1">Yönetim Giderleri</Label>
             <div className="flex items-center space-x-2">
                <Checkbox 
                    id="excludeManagement" 
                    checked={excludeManagement}
                    onCheckedChange={(checked) => setExcludeManagement(checked as boolean)}
                />
                <Label 
                    htmlFor="excludeManagement" 
                    className="text-xs font-medium leading-none cursor-pointer"
                >
                    Yönetim Maaşlarını Hariç Tut <br/>(Net Ücret)
                </Label>
            </div>
          </div>


        </CardContent>
      </Card>

      {/* Summary Chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
              <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Hedef Yıllık Satış</p>
                  <p className="text-xl font-bold text-blue-600">{formatCurrency(totalProjectedSales)}</p>
              </CardContent>
          </Card>
          <Card>
              <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Hedef Yıllık Kar</p>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(totalProjectedProfit)}</p>
              </CardContent>
          </Card>
      </div>



      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Allocation Chart */}
          <Card>
              <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                      <PieIcon className="w-4 h-4 text-primary" />
                      Ciro Dağılımı (Kar Marjı)
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie
                                data={[
                                    { name: "Net Kar", value: Math.max(0, totalProjectedProfit), color: "#10b981" },
                                    { name: "Personel (İşveren Mal.)", value: projectionData.reduce((a,c) => a+c.projectedSalary, 0), color: "#f97316" },
                                    { name: "Diğer Giderler", value: projectionData.reduce((a,c) => a+c.projectedExpense, 0), color: "#ef4444" },
                                ]}
                                cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}
                                dataKey="value"
                              >
                                  {[
                                    { name: "Net Kar", value: Math.max(0, totalProjectedProfit), color: "#10b981" },
                                    { name: "Personel (İşveren Mal.)", value: projectionData.reduce((a,c) => a+c.projectedSalary, 0), color: "#f97316" },
                                    { name: "Diğer Giderler", value: projectionData.reduce((a,c) => a+c.projectedExpense, 0), color: "#ef4444" },
                                  ].map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                              </Pie>
                              <Tooltip formatter={(val: number) => formatCurrency(val)} />
                              <Legend verticalAlign="bottom" height={36}/>
                          </PieChart>
                      </ResponsiveContainer>
                      {/* Center Label */}
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-full text-center pointer-events-none mt-6 ml-6 lg:mt-6 lg:ml-0">
                          <div className="text-xs text-muted-foreground">Kar Marjı</div>
                          <div className={`text-xl font-bold ${totalProjectedProfit > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              %{totalProjectedSales > 0 ? ((totalProjectedProfit / totalProjectedSales) * 100).toFixed(1) : 0}
                          </div>
                      </div>
                  </div>
              </CardContent>
          </Card>

          {/* Personnel Impact Chart */}
          <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                      <PieIcon className="w-4 h-4 text-orange-500" />
                      Personel Payı Analizi
                  </CardTitle>
                  <div className="flex bg-muted rounded-md p-1">
                      <button 
                          onClick={() => setPersonnelChartMetric('net')}
                          className={`text-xs px-2 py-1 rounded-sm transition-all ${personnelChartMetric === 'net' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground'}`}
                      >
                          Net Maaş
                      </button>
                      <button 
                           onClick={() => setPersonnelChartMetric('cost')}
                           className={`text-xs px-2 py-1 rounded-sm transition-all ${personnelChartMetric === 'cost' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground'}`}
                      >
                          Toplam Maliyet
                      </button>
                  </div>
              </CardHeader>
              <CardContent>
                   <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie
                                data={[
                                    { 
                                        name: personnelChartMetric === 'net' ? "Personel (Net)" : "Personel (Maliyet)", 
                                        value: personnelChartMetric === 'net' 
                                            ? projectionData.reduce((a,c) => a+c.projectedSalaryNet, 0)
                                            : projectionData.reduce((a,c) => a+c.projectedSalary, 0), 
                                        color: "#f97316" 
                                    },
                                    { 
                                        name: "Ciro (Kalan)", 
                                        value: Math.max(0, totalProjectedSales - (
                                            personnelChartMetric === 'net' 
                                            ? projectionData.reduce((a,c) => a+c.projectedSalaryNet, 0)
                                            : projectionData.reduce((a,c) => a+c.projectedSalary, 0)
                                        )), 
                                        color: "#e2e8f0" 
                                    },
                                ]}
                                cx="50%" cy="50%" innerRadius={60} outerRadius={80} startAngle={180} endAngle={0}
                                dataKey="value"
                              >
                                  <Cell fill="#f97316" />
                                  <Cell fill="#94a3b8" />
                              </Pie>
                              <Tooltip formatter={(val: number) => formatCurrency(val)} />
                              <Legend verticalAlign="bottom" />
                          </PieChart>
                      </ResponsiveContainer>
                       {/* Center Label for Gauge Effect */}
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-[100%] text-center pointer-events-none mt-8 lg:mt-8">
                          <div className="text-xs text-muted-foreground">Cirodaki Payı</div>
                          <div className="text-xl font-bold text-orange-600">
                              %{totalProjectedSales > 0 ? ((
                                  (personnelChartMetric === 'net' 
                                      ? projectionData.reduce((a,c) => a+c.projectedSalaryNet, 0)
                                      : projectionData.reduce((a,c) => a+c.projectedSalary, 0))
                                  / totalProjectedSales) * 100).toFixed(1) : 0}
                          </div>
                      </div>
                  </div>
              </CardContent>
          </Card>
      </div>

      {/* Main Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>2026 Projeksiyon Tablosu</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="align-middle">Ay</TableHead>
                <TableHead colSpan={2} className="text-center border-l bg-muted/30">2025 Gerçekleşen</TableHead>
                <TableHead colSpan={2} className="text-center border-l bg-blue-50/50">2026 Hedef / Gerçekleşen</TableHead>
                <TableHead rowSpan={2} className="text-right text-red-600 border-l align-middle">Giderler</TableHead>
                <TableHead rowSpan={2} className="text-right text-orange-600 border-l align-middle">
                    <div className="flex items-center justify-end gap-1">
                        Personel 
                        {salaryMode === 'manual' ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    </div>
                </TableHead>
                <TableHead rowSpan={2} className="text-right font-bold text-green-700 border-l align-middle">Net Kar</TableHead>
              </TableRow>
              <TableRow>
                 <TableHead className="text-right text-xs text-muted-foreground border-l">KDV'siz</TableHead>
                 <TableHead className="text-right text-xs text-muted-foreground">KDV</TableHead>
                 
                 <TableHead className="text-right text-xs text-blue-700 border-l">KDV'siz</TableHead>
                 <TableHead className="text-right text-xs text-blue-700">KDV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectionData.map((row) => (
                <TableRow key={row.value} className={row.isActual ? "bg-muted/20" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                        {row.label}
                        {row.isActual && <Badge variant="secondary" className="text-[10px] h-4">Gerç.</Badge>}
                    </div>
                  </TableCell>
                  
                  {/* 2025 Columns */}
                  <TableCell className="text-right text-muted-foreground opacity-70 border-l">
                    {formatCurrency(row.baseSalesNet)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground opacity-70 text-xs">
                    {formatCurrency(row.baseSalesVAT)}
                  </TableCell>

                  {/* 2026 Columns */}
                   <TableCell className="text-right font-bold text-blue-700 border-l">
                     {row.isActual ? formatCurrency(row.projectedSalesNet) : (
                         <span className="flex items-center justify-end gap-1">
                             {formatCurrency(row.projectedSalesNet)}
                         </span>
                     )}
                  </TableCell>
                  <TableCell className="text-right font-bold text-blue-700 text-xs">
                     {formatCurrency(row.projectedSalesVAT)}
                  </TableCell>

                  <TableCell className="text-right text-red-600 border-l">
                    {formatCurrency(row.projectedExpense)}
                  </TableCell>
                  <TableCell className="text-right text-orange-600 border-l">
                    {salaryMode === 'manual' && !row.isActual ? ( // Can edit if valid month and Manual Mode
                        <Input 
                            className="h-8 w-24 text-right ml-auto text-xs" 
                            value={manualSalaries[row.value] || ''} 
                            placeholder={formatCurrency((row.baseSalesTotal * 0.1))} // Hint?
                            onChange={(e) => handleManualSalaryChange(row.value, e.target.value)}
                        />
                    ) : (
                        formatCurrency(row.projectedSalary)
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-bold border-l ${row.profit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(row.profit)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
                <TableRow>
                    <TableCell className="font-bold">TOPLAM</TableCell>
                    {/* 2025 Totals */}
                    <TableCell className="text-right font-medium text-muted-foreground border-l">
                        {formatCurrency(projectionData.reduce((a,c) => a+c.baseSalesNet, 0))}
                    </TableCell>
                    <TableCell className="text-right font-medium text-muted-foreground">
                        {formatCurrency(projectionData.reduce((a,c) => a+c.baseSalesVAT, 0))}
                    </TableCell>

                    {/* 2026 Totals */}
                    <TableCell className="text-right font-bold text-blue-700 border-l">
                        {formatCurrency(projectionData.reduce((a,c) => a+c.projectedSalesNet, 0))}
                    </TableCell>
                    <TableCell className="text-right font-bold text-blue-700">
                        {formatCurrency(projectionData.reduce((a,c) => a+c.projectedSalesVAT, 0))}
                    </TableCell>

                    <TableCell className="text-right font-bold text-red-600 border-l">{formatCurrency(projectionData.reduce((a,c) => a+c.projectedExpense,0))}</TableCell>
                    <TableCell className="text-right font-bold text-orange-600 border-l">{formatCurrency(projectionData.reduce((a,c) => a+c.projectedSalary,0))}</TableCell>
                    <TableCell className="text-right font-bold text-lg border-l">{formatCurrency(totalProjectedProfit)}</TableCell>
                </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
