import { Link } from "wouter";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ModuleAccent {
    bar: string;
    bg: string;
    text: string;
}

interface ModuleStat {
    label: string;
    value: string;
    tone?: "default" | "danger" | "warning" | "success";
}

interface ModuleCardProps {
    title: string;
    href: string;
    icon: LucideIcon;
    accent: ModuleAccent;
    primaryLabel: string;
    primaryValue: string;
    primaryHint?: string;
    stats?: ModuleStat[];
    sparkline?: React.ReactNode;
    isLoading?: boolean;
}

const toneMap: Record<NonNullable<ModuleStat["tone"]>, string> = {
    default: "text-foreground",
    danger: "text-rose-600 dark:text-rose-400",
    warning: "text-amber-600 dark:text-amber-400",
    success: "text-emerald-600 dark:text-emerald-400",
};

export function ModuleCard({
    title,
    href,
    icon: Icon,
    accent,
    primaryLabel,
    primaryValue,
    primaryHint,
    stats = [],
    sparkline,
    isLoading,
}: ModuleCardProps) {
    return (
        <Link href={href}>
            <Card className="group relative h-full cursor-pointer overflow-hidden border-border/70 bg-card transition-all hover:border-border hover:shadow-md">
                <div className={cn("absolute left-0 top-0 h-full w-[3px]", accent.bar)} aria-hidden="true" />

                <CardContent className="flex h-full flex-col gap-4 p-5">
                    <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className={cn("flex h-9 w-9 items-center justify-center rounded-md", accent.bg)}>
                                <Icon className={cn("h-[18px] w-[18px]", accent.text)} strokeWidth={2} />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
                                {primaryHint && (
                                    <p className="text-[11px] text-muted-foreground">{primaryHint}</p>
                                )}
                            </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground/60 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>

                    <div>
                        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{primaryLabel}</p>
                        {isLoading ? (
                            <div className="mt-1 h-8 w-32 animate-pulse rounded bg-muted" />
                        ) : (
                            <p className="mt-1 text-3xl font-bold leading-none tracking-tight tabular-nums text-foreground">
                                {primaryValue}
                            </p>
                        )}
                    </div>

                    {(stats.length > 0 || sparkline) && (
                        <div className="mt-auto space-y-3 pt-2">
                            {sparkline && (
                                <div className={cn("opacity-80", accent.text)}>
                                    {sparkline}
                                </div>
                            )}
                            {stats.length > 0 && (
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/60 pt-3">
                                    {stats.map((s, i) => (
                                        <div key={i} className="min-w-0">
                                            <p className="truncate text-[10.5px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
                                            <p className={cn("truncate text-sm font-semibold tabular-nums", toneMap[s.tone || "default"])}>
                                                {s.value}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </Link>
    );
}
