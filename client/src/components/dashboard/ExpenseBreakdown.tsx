import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ExpenseBreakdownProps {
    generalExpenses: number;
    personnelExpenses: number;
}

export function ExpenseBreakdown({ generalExpenses, personnelExpenses }: ExpenseBreakdownProps) {
    const data = [
        { name: "Genel Giderler", value: generalExpenses, color: "#ef4444" },
        { name: "Personel Maliyeti", value: personnelExpenses, color: "#f59e0b" },
    ];

    const total = generalExpenses + personnelExpenses;

    const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }: any) => {
        const RADIAN = Math.PI / 180;
        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
        const x = cx + radius * Math.cos(-midAngle * RADIAN);
        const y = cy + radius * Math.sin(-midAngle * RADIAN);

        return percent > 0.05 ? (
            <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
                {`${(percent * 100).toFixed(0)}%`}
            </text>
        ) : null;
    };

    return (
        <Card className="col-span-3 bg-gray-900 border-gray-700 shadow-lg">
            <CardHeader>
                <CardTitle className="text-gray-200">Gider Dağılımı</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full relative">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                                strokeWidth={0}
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                                formatter={(value: number) => `₺${value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`}
                            />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                        <div className="text-2xl font-bold text-white">₺{(total / 1000).toFixed(0)}k</div>
                        <div className="text-xs text-gray-400">Toplam</div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
