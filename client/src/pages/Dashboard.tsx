import { StatCard } from "@/components/StatCard";
import { ProcedureCard } from "@/components/ProcedureCard";
import { BackgroundPaths } from "@/components/BackgroundPaths";
import { DollarSign, Package, Receipt, CreditCard } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="relative min-h-full">
      <BackgroundPaths />
      
      <div className="relative z-10 p-6 lg:p-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
          <ProcedureCard title="Active Procedures" count={7} variant="default" />
          <ProcedureCard title="Pending Documents" count={11} variant="blue" />
          <ProcedureCard title="Awaiting Payment" count={13} variant="yellow" />
        </div>
      </div>
    </div>
  );
}
