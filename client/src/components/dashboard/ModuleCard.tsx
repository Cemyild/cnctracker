import { Link } from "wouter";
import { AlertTriangle, Loader2, RotateCw, type LucideIcon } from "lucide-react";
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
    /** Sağ üstte küçük rozet, ör. "her zaman güncel" (yıl filtresinden bağımsız kartlar için) */
    badge?: string;
    stats?: ModuleStat[];
    sparkline?: React.ReactNode;
    /** Ayraç çizgisinin altına özel gövde (firma barları, şube/araç listeleri). stats yerine kullanılır. */
    children?: React.ReactNode;
    isLoading?: boolean;
    /** Query düştüğünde: kart "0 ₺" yerine hata bloğu + Tekrar dene gösterir */
    isError?: boolean;
    onRetry?: () => void;
    errorMessage?: string;
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
    badge,
    stats = [],
    sparkline,
    children,
    isLoading,
    isError,
    onRetry,
    errorMessage = "Modül özeti yüklenemedi (bağlantı hatası)",
}: ModuleCardProps) {
    const hasBody = stats.length > 0 || sparkline || children;

    const card = (
        <Card
            className={cn(
                "group relative flex h-full flex-col overflow-hidden border-border/70 bg-card transition-all",
                // Hata durumunda kart navigasyon linki değil — sadece retry; bu yüzden hover/cursor yok
                !isError && "cursor-pointer hover:border-border hover:shadow-md"
            )}
        >
            <div className={cn("absolute left-0 top-0 h-full w-[3px]", accent.bar)} aria-hidden="true" />

            <CardContent className="flex h-full flex-col gap-4 p-5">
                    {/* HEADER — ikon + başlık + ipucu, sağda rozet */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", accent.bg)}>
                                <Icon className={cn("h-[18px] w-[18px]", accent.text)} strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
                                {primaryHint && (
                                    <p className="truncate text-[11px] text-muted-foreground">{primaryHint}</p>
                                )}
                            </div>
                        </div>
                        {badge && (
                            <span className="shrink-0 rounded-full border border-teal-200 bg-teal-50 px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-wide text-teal-600 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-400">
                                {badge}
                            </span>
                        )}
                    </div>

                    {isError ? (
                        // ----- HATA + RETRY -----
                        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-2 text-center">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-[13px] font-semibold text-foreground">Veri alınamadı</p>
                                <p className="mt-0.5 text-[11.5px] text-muted-foreground">{errorMessage}</p>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onRetry?.();
                                }}
                                className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                            >
                                <RotateCw className="h-3.5 w-3.5" />
                                Tekrar dene
                            </button>
                        </div>
                    ) : isLoading ? (
                        // ----- YÜKLENİYOR -----
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-4">
                            <Loader2 className={cn("h-6 w-6 animate-spin", accent.text)} />
                            <p className="text-xs text-muted-foreground">Yükleniyor…</p>
                        </div>
                    ) : (
                        <>
                            {/* PRIMARY — etiket + büyük değer */}
                            <div>
                                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{primaryLabel}</p>
                                <p className="mt-1 text-[28px] font-extrabold leading-none tracking-tight tabular-nums text-foreground">
                                    {primaryValue}
                                </p>
                            </div>

                            {/* BODY — ayraç çizgisi aynı seviyede (border-top + pt-3.5), margin-top YOK */}
                            {hasBody && (
                                <div className="space-y-3 border-t border-border/60 pt-3.5">
                                    {sparkline && <div className={cn("opacity-85", accent.text)}>{sparkline}</div>}
                                    {children}
                                    {stats.length > 0 && (
                                        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
                                            {stats.map((s, i) => (
                                                <div key={i} className="min-w-0">
                                                    <p className="truncate text-[10.5px] uppercase tracking-wide text-muted-foreground">
                                                        {s.label}
                                                    </p>
                                                    <p className={cn("truncate text-sm font-semibold tabular-nums", toneMap[s.tone || "default"])}>
                                                        {s.value}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
            </CardContent>
        </Card>
    );

    // Hata yokken kart tıklanabilir bir navigasyon linki; hata varken düz blok (retry butonu <a> içinde kalmasın)
    return isError ? card : <Link href={href}>{card}</Link>;
}
