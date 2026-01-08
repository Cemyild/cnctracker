import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { KPISection } from "@/components/dashboard/KPISection";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { ExpenseBreakdown } from "@/components/dashboard/ExpenseBreakdown";
import { RecentTransactions } from "@/components/dashboard/RecentTransactions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Dashboard() {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ["dashboard-summary", selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/summary/${selectedYear}`);
      if (!res.ok) throw new Error("Veri yüklenemedi");
      return res.json();
    }
  });

  // Calculate Aggregates
  const aggregates = (summaryData || []).reduce((acc: any, curr: any) => {
    return {
      totalRevenue: acc.totalRevenue + (curr.satisToplam || 0),
      // Expenses = General Expenses + Employee Cost
      totalExpenses: acc.totalExpenses + (curr.giderToplam || 0) + (curr.calisanMaliyet || 0),
      generalExpenses: acc.generalExpenses + (curr.giderToplam || 0),
      personnelExpenses: acc.personnelExpenses + (curr.calisanMaliyet || 0),
    };
  }, { totalRevenue: 0, totalExpenses: 0, generalExpenses: 0, personnelExpenses: 0 });

  const netProfit = aggregates.totalRevenue - aggregates.totalExpenses;
  const profitMargin = aggregates.totalRevenue > 0 ? (netProfit / aggregates.totalRevenue) * 100 : 0;

  // Prepare Chart Data
  const chartData = (summaryData || []).map((item: any) => ({
    ...item,
    // Calculate Combined Expense for the chart
    giderToplam: (item.giderToplam || 0) + (item.calisanMaliyet || 0)
  }));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
            Finansal Genel Bakış
          </h1>
          <p className="text-gray-400 mt-1">Gerçek zamanlı finansal performans analizi</p>
        </div>

        <div className="flex items-center gap-4">
          <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
            <SelectTrigger className="w-[120px] bg-gray-900 border-gray-700 text-white">
              <SelectValue placeholder="Yıl Seçin" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700 text-white">
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Section */}
      <div className="mb-8">
        <KPISection
          totalRevenue={aggregates.totalRevenue}
          totalExpenses={aggregates.totalExpenses}
          netProfit={netProfit}
          profitMargin={profitMargin}
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-8">
        {/* Left Column (Charts) */}
        <div className="lg:col-span-4 space-y-8">
          <TrendChart data={chartData} />

          <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
            {/* Additional charts could go here */}
          </div>
        </div>

        {/* Right Column (Breakdown & Lists) */}
        <div className="lg:col-span-3 space-y-8">
          <ExpenseBreakdown
            generalExpenses={aggregates.generalExpenses}
            personnelExpenses={aggregates.personnelExpenses}
          />
          <RecentTransactions />
        </div>
      </div>
    </div>
  );
}

