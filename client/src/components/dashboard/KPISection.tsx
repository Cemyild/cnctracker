import { ArrowUpRight, ArrowDownRight, DollarSign, Wallet, TrendingUp, Percent } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface KPISectionProps {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
}

export function KPISection({ totalRevenue, totalExpenses, netProfit, profitMargin }: KPISectionProps) {
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(val);
    };

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 shadow-lg relative overflow-hidden group">
                <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Toplam Gelir</CardTitle>
                    <DollarSign className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-white">{formatCurrency(totalRevenue)}</div>
                    <p className="text-xs text-green-500 flex items-center mt-1">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        +20.1% <span className="text-gray-500 ml-1">geçen aydan</span>
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 shadow-lg relative overflow-hidden group">
                <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Toplam Gider</CardTitle>
                    <Wallet className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-white">{formatCurrency(totalExpenses)}</div>
                    <p className="text-xs text-red-500 flex items-center mt-1">
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                        +4.5% <span className="text-gray-500 ml-1">geçen aydan</span>
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 shadow-lg relative overflow-hidden group">
                <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Net Kar</CardTitle>
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                    <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(netProfit)}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Vergi öncesi net kar
                    </p>
                </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700 shadow-lg relative overflow-hidden group">
                <div className="absolute inset-0 bg-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium text-gray-400">Kar Marjı</CardTitle>
                    <Percent className="h-4 w-4 text-purple-500" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-white">%{profitMargin.toFixed(1)}</div>
                    <p className="text-xs text-purple-500 mt-1">
                        Ortalama kar oranı
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
