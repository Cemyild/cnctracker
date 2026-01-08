import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RecentTransactions() {
    // Static data for now, or could fetch last 5 invoices
    const transactions = [
        {
            name: "ABC Lojistik",
            email: "Lojistik Hizmeti",
            amount: "+₺45.231,89",
            date: "Bugün",
            status: "Gelir",
            color: "text-green-500"
        },
        {
            name: "Ofis Kirası",
            email: "Şubat 2025",
            amount: "-₺12.500,00",
            date: "Dün",
            status: "Gider",
            color: "text-red-500"
        },
        {
            name: "XYZ İthalat",
            email: "Gümrük İşlemleri",
            amount: "+₺8.900,00",
            date: "Dün",
            status: "Gelir",
            color: "text-green-500"
        },
        {
            name: "Personel Maaşları",
            email: "Ocak 2025",
            amount: "-₺245.000,00",
            date: "2 gün önce",
            status: "Gider",
            color: "text-red-500"
        },
        {
            name: "Server Altyapı",
            email: "AWS Faturası",
            amount: "-₺3.200,50",
            date: "2 gün önce",
            status: "Gider",
            color: "text-red-500"
        },
    ];

    return (
        <Card className="col-span-3 bg-gray-900 border-gray-700 shadow-lg">
            <CardHeader>
                <CardTitle className="text-gray-200">Son İşlemler</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-8">
                    {transactions.map((transaction, index) => (
                        <div key={index} className="flex items-center">
                            <Avatar className="h-9 w-9">
                                <AvatarFallback className={transaction.status === 'Gelir' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}>
                                    {transaction.status === 'Gelir' ? 'GL' : 'GD'}
                                </AvatarFallback>
                            </Avatar>
                            <div className="ml-4 space-y-1">
                                <p className="text-sm font-medium leading-none text-white">{transaction.name}</p>
                                <p className="text-xs text-muted-foreground text-gray-400">
                                    {transaction.email}
                                </p>
                            </div>
                            <div className={`ml-auto font-medium ${transaction.color}`}>
                                {transaction.amount}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
