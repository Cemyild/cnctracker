import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CrmDepartman } from "./tipler";

// Departman listesi kod içine gömülü değil: her firmanın organizasyonu farklı
// olabilir, personel buradan yeni departman açabilir.
export function DepartmanYonetimi({ departmanlar }: { departmanlar: CrmDepartman[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [yeniAd, setYeniAd] = useState("");
  const [duzenlenenId, setDuzenlenenId] = useState<string | null>(null);
  const [duzenlenenAd, setDuzenlenenAd] = useState("");

  const tazele = () => {
    qc.invalidateQueries({ queryKey: ["/api/crm/departmanlar"] });
    qc.invalidateQueries({ queryKey: ["/api/crm/musteriler"] });
    qc.invalidateQueries({ queryKey: ["/api/crm/rehber"] });
  };

  const ekle = useMutation({
    mutationFn: async (ad: string) => {
      const res = await fetch("/api/crm/departmanlar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ad }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Eklenemedi");
      return res.json();
    },
    onSuccess: () => { tazele(); setYeniAd(""); toast({ title: "Departman eklendi" }); },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const guncelle = useMutation({
    mutationFn: async ({ id, govde }: { id: string; govde: object }) => {
      const res = await fetch(`/api/crm/departmanlar/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(govde),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Güncellenemedi");
      return res.json();
    },
    onSuccess: () => { tazele(); setDuzenlenenId(null); },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const sil = useMutation({
    mutationFn: (id: string) => fetch(`/api/crm/departmanlar/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => { tazele(); toast({ title: "Departman silindi" }); },
  });

  // Sıra değişimi iki kaydın sira değerinin takasıdır.
  const tasi = async (d: CrmDepartman, yon: "yukari" | "asagi") => {
    const sirali = [...departmanlar].sort((a, b) => a.sira - b.sira);
    const i = sirali.findIndex((x) => x.id === d.id);
    const j = yon === "yukari" ? i - 1 : i + 1;
    if (j < 0 || j >= sirali.length) return;
    const diger = sirali[j];
    await Promise.all([
      fetch(`/api/crm/departmanlar/${d.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sira: diger.sira }),
      }),
      fetch(`/api/crm/departmanlar/${diger.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sira: d.sira }),
      }),
    ]);
    tazele();
  };

  const sirali = [...departmanlar].sort((a, b) => a.sira - b.sira);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="overflow-hidden rounded-[14px] border bg-card">
        <div className="border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-[12.5px] font-extrabold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Departmanlar
          </h3>
        </div>
        <div className="divide-y">
          {sirali.length === 0 && (
            <p className="p-6 text-center text-[12.5px] text-muted-foreground">Departman yok.</p>
          )}
          {sirali.map((d, i) => (
            <div key={d.id} className={cn("flex items-center gap-3 px-4 py-2.5", !d.aktif && "opacity-55")}>
              <div className="flex shrink-0 flex-col">
                <button
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                  disabled={i === 0}
                  onClick={() => tasi(d, "yukari")}
                  aria-label="Yukarı taşı"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                  disabled={i === sirali.length - 1}
                  onClick={() => tasi(d, "asagi")}
                  aria-label="Aşağı taşı"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {duzenlenenId === d.id ? (
                <>
                  <Input
                    value={duzenlenenAd}
                    onChange={(e) => setDuzenlenenAd(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && duzenlenenAd.trim()) {
                        guncelle.mutate({ id: d.id, govde: { ad: duzenlenenAd.trim() } });
                      }
                      if (e.key === "Escape") setDuzenlenenId(null);
                    }}
                    className="h-[32px] flex-1 text-[13px]"
                    autoFocus
                  />
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8 text-emerald-600"
                    disabled={!duzenlenenAd.trim()}
                    onClick={() => guncelle.mutate({ id: d.id, govde: { ad: duzenlenenAd.trim() } })}
                    aria-label="Kaydet"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => setDuzenlenenId(null)}
                    aria-label="Vazgeç"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-[13.5px] font-semibold">{d.ad}</span>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2">
                    <Switch
                      checked={d.aktif}
                      onCheckedChange={(v) => guncelle.mutate({ id: d.id, govde: { aktif: v } })}
                    />
                    <span className="text-[11.5px] font-semibold text-muted-foreground">
                      {d.aktif ? "aktif" : "pasif"}
                    </span>
                  </label>
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => { setDuzenlenenId(d.id); setDuzenlenenAd(d.ad); }}
                    aria-label="Yeniden adlandır"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                    onClick={() => {
                      if (confirm(`"${d.ad}" departmanını silmek istediğinize emin misiniz? Bu departmandaki kişiler silinmez, "Departmansız" grubuna düşer.`)) {
                        sil.mutate(d.id);
                      }
                    }}
                    aria-label="Sil"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="h-fit rounded-[14px] border bg-card p-4">
        <h3 className="text-[13.5px] font-bold">Yeni Departman</h3>
        <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
          İletişim kişileri bu listeye göre gruplanır. Artık kullanılmayan bir departmanı
          silmek yerine <strong>pasife</strong> alın: mevcut kişiler yerinde kalır, yeni kişi atanamaz.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && yeniAd.trim()) ekle.mutate(yeniAd.trim()); }}
            placeholder="Örn. Gümrükleme"
            className="h-[36px] text-[13px]"
          />
          <Button
            className="h-[36px] shrink-0 gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
            disabled={!yeniAd.trim() || ekle.isPending}
            onClick={() => ekle.mutate(yeniAd.trim())}
          >
            <Plus className="h-3.5 w-3.5" /> Ekle
          </Button>
        </div>
      </div>
    </div>
  );
}
