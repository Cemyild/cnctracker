import { StatCard } from '../StatCard';
import { DollarSign, Package, Receipt, CreditCard } from 'lucide-react';

export default function StatCardExample() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={<DollarSign className="w-6 h-6" />}
        label="Total Value Imported"
        value="$4,887,699"
        variant="green"
      />
      <StatCard
        icon={<Package className="w-6 h-6" />}
        label="Total Pieces Imported"
        value="344,553 pieces"
        variant="blue"
      />
      <StatCard
        icon={<Receipt className="w-6 h-6" />}
        label="Total Tax Paid"
        value="₺146,614,032.7"
        variant="yellow"
      />
      <StatCard
        icon={<CreditCard className="w-6 h-6" />}
        label="Total Expenses Paid"
        value="₺20,815,302.62"
        variant="gray"
      />
    </div>
  );
}
