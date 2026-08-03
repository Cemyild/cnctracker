import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import type { PortalMe } from "./PortalApp";

// Silme YALNIZ admin rolünde görünür ve yalnız /api/portal/admin/* uçlarından geçer.
// Buton rolü kendisi kontrol eder (çağıran ekranların koşul yazmasına gerek yok):
// admin değilse hiçbir şey render etmez. Sunucu tarafı guard'ı ayrıca requireAdmin.
export type SilinebilirTip = "talep" | "masraf" | "avans";

const TIP_ETIKET: Record<SilinebilirTip, string> = {
  talep: "ödeme talebi",
  masraf: "şube masrafı",
  avans: "avans",
};

/** Oturum sahibi admin mi — cache'teki /api/portal/me'den okur, ek istek yapmaz. */
export function useAdminMi(): boolean {
  const { data: me } = useQuery<PortalMe | null>({ queryKey: ["/api/portal/me"] });
  return me?.rol === "admin";
}

export function AdminSilButonu({
  tip, id, ozet, kilitli, className,
}: {
  tip: SilinebilirTip;
  id: string;
  ozet: string;          // onay penceresinde gösterilecek insan-okur özet
  kilitli?: boolean;     // kapanmış gün kaydı — uyarı metnini değiştirir
  className?: string;
}) {
  const adminMi = useAdminMi();
  const { toast } = useToast();
  const [acik, setAcik] = useState(false);
  const [siliniyor, setSiliniyor] = useState(false);
  if (!adminMi) return null;

  const sil = async () => {
    setSiliniyor(true);
    try {
      const res = await fetch(`/api/portal/admin/${tip}/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Silinemedi");
      toast({ title: "Kayıt silindi", description: "Silme günlüğüne işlendi." });
      setAcik(false);
      // Talepler, kasa özeti, şube takip ve günlük — hepsi etkilenebilir.
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast({ title: "Hata", description: e.message, variant: "destructive" });
    } finally { setSiliniyor(false); }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`h-7 w-7 shrink-0 p-0 text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 ${className ?? ""}`}
        title={`Sil (admin) — ${ozet}`}
        onClick={() => setAcik(true)}
        data-testid={`button-admin-sil-${tip}-${id}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <AlertDialog open={acik} onOpenChange={setAcik}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bu {TIP_ETIKET[tip]} kalıcı olarak silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div className="rounded-md border bg-muted/40 p-2.5 text-sm text-foreground">{ozet}</div>
                <p>
                  Kayıt ve yüklü belgeleri geri alınamaz biçimde silinir. İşlem, kim sildi
                  bilgisiyle birlikte <b>Silme Günlüğü</b>'ne yazılır.
                </p>
                {kilitli && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                    Bu kayıt <b>kapatılmış bir güne</b> ait. Silindiğinde o günün ve sonraki
                    tüm günlerin kapanış bakiyeleri yeniden hesaplanır.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); sil(); }}
              disabled={siliniyor}
              className="bg-rose-600 text-white hover:bg-rose-700"
              data-testid={`button-admin-sil-onay-${id}`}
            >
              {siliniyor ? "Siliniyor…" : "Kalıcı Olarak Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
