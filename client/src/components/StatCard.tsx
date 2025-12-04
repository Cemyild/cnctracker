import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  variant?: "green" | "blue" | "yellow" | "gray";
}

const variantStyles = {
  green: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/50",
  blue: "bg-sky-50 dark:bg-sky-950/30 border-sky-100 dark:border-sky-900/50",
  yellow: "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50",
  gray: "bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/50",
};

const iconStyles = {
  green: "text-emerald-600 dark:text-emerald-400",
  blue: "text-sky-600 dark:text-sky-400",
  yellow: "text-amber-600 dark:text-amber-400",
  gray: "text-slate-600 dark:text-slate-400",
};

export function StatCard({ icon, label, value, variant = "gray" }: StatCardProps) {
  return (
    <Card
      className={cn(
        "p-6 border transition-all duration-200 hover-elevate",
        variantStyles[variant]
      )}
      data-testid={`stat-card-${variant}`}
    >
      <div className="flex flex-col gap-3">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center bg-white/60 dark:bg-black/20", iconStyles[variant])}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
        </div>
      </div>
    </Card>
  );
}
