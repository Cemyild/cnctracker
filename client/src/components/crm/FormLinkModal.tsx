import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Link2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type FormLink = {
  id: string;
  musteriId: string;
  token: string;
  aktif: boolean;
  kullanimSayisi: number;
  sonKullanim: string | null;
};

type FormYanit = {
  id: string;
  gonderenAd: string | null;
  gonderenEmail: string | null;
  eklenenKisi: number;
  guncellenenKisi: number;
  guncellenenKartAlani: number;
  gonderimTarihi: string;
};

// Gönderim zamanı timestamp (text tarih değil), bu yüzden Date üzerinden
// biçimlemek burada güvenli.
const fmtZaman = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function FormLinkModal({
  open, musteriId, musteriAd, onClose,
}: { open: boolean; musteriId: string; musteriAd: string; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ link: FormLink | null; yanitlar: FormYanit[] }>({
    queryKey: ["/api/crm/musteriler", musteriId, "form"],
    queryFn: () => fetch(`/api/crm/musteriler/${musteriId}/form`).then((r) => r.json()),
    enabled: open && !!musteriId,
  });

  const tazele = () => qc.invalidateQueries({ queryKey: ["/api/crm/musteriler", musteriId, "form"] });

  const uret = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/crm/musteriler/${musteriId}/form`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Link üretilemedi");
      return res.json();
    },
    onSuccess: () => { tazele(); toast({ title: "Bağlantı hazır" }); },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const aktiflik = useMutation({
    mutationFn: async (aktif: boolean) => {
      const res = await fetch(`/api/crm/musteriler/${musteriId}/form`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktif }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Güncellenemedi");
      return res.json();
    },
    onSuccess: (l: FormLink) => {
      tazele();
      toast({ title: l.aktif ? "Bağlantı açıldı" : "Bağlantı kapatıldı" });
    },
  });

  const link = data?.link ?? null;
  const url = link ? `${window.location.origin}/firma-bilgi/${link.token}` : "";

  const kopyala = () => {
    navigator.clipboard.writeText(url);
    toast({ title: "Bağlantı kopyalandı", description: "Firmaya e-posta ile gönderebilirsiniz." });
  };

  return (
    <Dialog open={open} onOpenChange={(a) => !a && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="truncate">Firma Bilgi Formu — {musteriAd}</DialogTitle>
        </DialogHeader>

        <div className="grid min-w-0 gap-4">
          <p className="text-[12.5px] leading-snug text-muted-foreground">
            Firmaya gönderdiğiniz bağlantıyı açan kişi kendi adres, vergi ve departman
            bazlı iletişim bilgilerini girer; gelenler bu müşterinin kartına otomatik
            işlenir. <strong>Boş bırakılan alan mevcut bilgiyi silmez</strong> ve
            sistemdeki hiçbir kişi kaydı bu formla silinemez.
          </p>

          {isLoading && <p className="text-[13px] text-muted-foreground">Yükleniyor…</p>}

          {!isLoading && !link && (
            <div className="rounded-[12px] border border-dashed bg-muted/30 p-6 text-center">
              <Link2 className="mx-auto h-8 w-8 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="mt-2.5 text-[13.5px] font-bold">Bu firma için henüz bağlantı yok</p>
              <Button
                className="mt-3.5 h-[34px] gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                disabled={uret.isPending}
                onClick={() => uret.mutate()}
              >
                <Link2 className="h-3.5 w-3.5" /> Bağlantı Üret
              </Button>
            </div>
          )}

          {link && (
            <>
              <div className="flex gap-2">
                <Input readOnly value={url} className="h-[36px] text-[12.5px]" onFocus={(e) => e.target.select()} />
                <Button variant="outline" className="h-[36px] shrink-0 gap-1.5" onClick={kopyala}>
                  <Copy className="h-3.5 w-3.5" /> Kopyala
                </Button>
                <Button variant="outline" className="h-[36px] shrink-0" asChild>
                  <a href={url} target="_blank" rel="noreferrer" aria-label="Yeni sekmede aç">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border bg-muted/40 px-3.5 py-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <Switch
                    checked={link.aktif}
                    onCheckedChange={(v) => aktiflik.mutate(v)}
                  />
                  <span className="text-[12.5px] font-semibold">
                    {link.aktif ? "Bağlantı açık" : "Bağlantı kapalı"}
                  </span>
                </label>
                <span className="text-[11.5px] text-muted-foreground">
                  {link.kullanimSayisi} gönderim · son: {fmtZaman(link.sonKullanim)}
                </span>
                <Button
                  variant="ghost"
                  className="h-[30px] gap-1.5 px-2 text-[11.5px] font-bold"
                  disabled={uret.isPending}
                  onClick={() => {
                    if (confirm("Yeni bağlantı üretilsin mi? Daha önce firmaya gönderdiğiniz bağlantı ÇALIŞMAYI DURDURUR.")) {
                      uret.mutate();
                    }
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Yenile
                </Button>
              </div>

              <div>
                <h4 className="mb-2 text-[12.5px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Gelen Gönderimler
                </h4>
                {(data?.yanitlar ?? []).length === 0 ? (
                  <p className="rounded-[10px] border border-dashed p-4 text-center text-[12.5px] text-muted-foreground">
                    Henüz gönderim yok.
                  </p>
                ) : (
                  <div className="max-h-[220px] divide-y overflow-y-auto rounded-[10px] border">
                    {(data?.yanitlar ?? []).map((y) => (
                      <div key={y.id} className="px-3.5 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[12.5px] font-bold">
                            {y.gonderenAd || "İsim belirtilmemiş"}
                          </span>
                          <span className="text-[11.5px] tabular-nums text-muted-foreground">
                            {fmtZaman(y.gonderimTarihi)}
                          </span>
                        </div>
                        {y.gonderenEmail && (
                          <p className="text-[11.5px] text-muted-foreground">{y.gonderenEmail}</p>
                        )}
                        <p className="mt-1 text-[11.5px] text-muted-foreground">
                          {y.eklenenKisi} kişi eklendi · {y.guncellenenKisi} kişi güncellendi ·
                          {" "}{y.guncellenenKartAlani} firma alanı güncellendi
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
