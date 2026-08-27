import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type Sonuc = {
  excelSatir: number;
  appMusteri: number;
  eslesen: number;
  kartAcilan: number;
  guncellenen: number;
  doldurulanAlan: number;
  degismeyen: number;
  belirsiz: { musteri: string; adaylar: string[] }[];
  bulunamayan: string[];
  farklilar: { musteri: string; alan: string; mevcut: string; excel: string }[];
};

const ALAN_ETIKET: Record<string, string> = {
  vergiDairesi: "Vergi dairesi", vergiNo: "Vergi no", adres: "Adres",
  ilce: "İlçe", il: "İl", telefon: "Telefon", faks: "Faks",
  genelEmail: "E-posta", kepAdresi: "KEP", vekaletBaslangic: "Vekalet başlangıç",
  vekaletBitis: "Vekalet bitiş", vekaletNoter: "Noter",
};

export function ExcelIceAktarModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const dosyaRef = useRef<HTMLInputElement>(null);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);

  const yukle = useMutation({
    mutationFn: async (dosya: File) => {
      const fd = new FormData();
      fd.append("xlsx", dosya);
      const res = await fetch("/api/crm/musteri-excel", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "İçe aktarılamadı");
      return res.json() as Promise<Sonuc>;
    },
    onSuccess: (s) => {
      setSonuc(s);
      qc.invalidateQueries({ queryKey: ["/api/crm/musteriler"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/vekaletler"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/stats"] });
      toast({ title: `${s.doldurulanAlan} alan dolduruldu` });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const kapat = () => { setSonuc(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(a) => !a && kapat()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader className="min-w-0">
          <DialogTitle>Müşteri Listesi Excel&apos;inden Güncelle</DialogTitle>
        </DialogHeader>

        {!sonuc && (
          <div className="grid min-w-0 gap-4">
            <div className="rounded-[12px] border border-dashed bg-muted/30 p-6 text-center">
              <FileSpreadsheet className="mx-auto h-9 w-9 text-muted-foreground/50" strokeWidth={1.5} />
              <p className="mt-3 text-[13.5px] font-bold">Müşteri Listesi dosyasını seçin</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Kaynak sistemden aldığınız <strong>Musteri Listesi.xlsx</strong>
              </p>
              <input
                ref={dosyaRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const d = e.target.files?.[0];
                  if (d) yukle.mutate(d);
                  e.target.value = "";
                }}
              />
              <Button
                className="mt-3.5 h-[34px] gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
                disabled={yukle.isPending}
                onClick={() => dosyaRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
                {yukle.isPending ? "İşleniyor…" : "Dosya Seç"}
              </Button>
            </div>

            <div className="rounded-[10px] border bg-muted/40 p-3.5 text-[12px] leading-relaxed text-muted-foreground">
              <p className="mb-1.5 font-bold text-foreground">Ne yapılır, ne yapılmaz</p>
              <ul className="ml-4 list-disc space-y-1">
                <li>Firmalar <strong>ada göre</strong> eşleştirilir (kırpılmış mizan adları dahil).</li>
                <li>Yalnız <strong>sistemde boş olan</strong> alanlar doldurulur; girdiğiniz veri ezilmez.</li>
                <li>Excel&apos;de olup sistemde olmayan firma <strong>oluşturulmaz</strong> — uzun süredir çalışılmayan firmalar eklenmesin diye.</li>
                <li>Telefonlar temizlenir: harfler atılır, birden fazla numara ayrıştırılır, alan kodu tek olan illerde tamamlanır.</li>
              </ul>
            </div>
          </div>
        )}

        {sonuc && (
          <div className="grid min-w-0 gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { e: "Eşleşen firma", d: sonuc.eslesen, r: "#0ea5e9" },
                { e: "Doldurulan alan", d: sonuc.doldurulanAlan, r: "#16a34a" },
                { e: "Kartı açılan", d: sonuc.kartAcilan, r: "#7c3aed" },
                { e: "Değişmeyen", d: sonuc.degismeyen, r: "#94a3b8" },
              ].map((k) => (
                <div key={k.e} className="relative overflow-hidden rounded-[12px] border bg-card p-3">
                  <span className="absolute bottom-0 left-0 top-0 w-1" style={{ background: k.r }} />
                  <div className="pl-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{k.e}</div>
                  <div className="mt-1 pl-2 text-[19px] font-extrabold tabular-nums">{k.d}</div>
                </div>
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Excel&apos;de {sonuc.excelSatir} firma vardı; sistemdeki {sonuc.appMusteri} müşteri üzerinden tarandı.
            </p>

            {sonuc.belirsiz.length > 0 && (
              <Bolum
                baslik={`Belirsiz — elle seçim gerekiyor (${sonuc.belirsiz.length})`}
                uyari
                aciklama="Excel'de birden fazla benzer kayıt var; yanlış firmaya yazmamak için dokunulmadı."
              >
                {sonuc.belirsiz.map((b) => (
                  <div key={b.musteri} className="px-3.5 py-2">
                    <p className="text-[12.5px] font-bold">{b.musteri}</p>
                    {b.adaylar.map((a) => (
                      <p key={a} className="text-[11.5px] text-muted-foreground">↳ {a}</p>
                    ))}
                  </div>
                ))}
              </Bolum>
            )}

            {sonuc.farklilar.length > 0 && (
              <Bolum
                baslik={`Farklı olanlar — dokunulmadı (${sonuc.farklilar.length})`}
                aciklama="Sistemde zaten değer vardı ve Excel farklı diyor. Karar sizin; panelden düzeltebilirsiniz."
              >
                {sonuc.farklilar.map((f, i) => (
                  <div key={i} className="px-3.5 py-2">
                    <p className="text-[12.5px] font-bold">{f.musteri}</p>
                    <p className="text-[11.5px] text-muted-foreground">
                      {ALAN_ETIKET[f.alan] ?? f.alan}: <span className="text-foreground">{f.mevcut}</span>
                      {" "}→ Excel: {f.excel}
                    </p>
                  </div>
                ))}
              </Bolum>
            )}

            {sonuc.bulunamayan.length > 0 && (
              <Bolum
                baslik={`Excel'de bulunamayan (${sonuc.bulunamayan.length})`}
                aciklama="Sistemde olan ama Excel'de karşılığı çıkmayan firmalar."
              >
                {sonuc.bulunamayan.map((b) => (
                  <p key={b} className="px-3.5 py-1.5 text-[12.5px]">{b}</p>
                ))}
              </Bolum>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant={sonuc ? "default" : "ghost"} onClick={kapat}
            className={sonuc ? "bg-slate-900 text-white hover:bg-slate-800" : undefined}>
            {sonuc ? "Kapat" : "Vazgeç"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Bolum({
  baslik, aciklama, uyari, children,
}: { baslik: string; aciklama: string; uyari?: boolean; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[12px] border">
      <div className={`border-b px-3.5 py-2.5 ${uyari ? "bg-amber-50 dark:bg-amber-950/20" : "bg-muted/40"}`}>
        <h4 className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wide">
          {uyari && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
          {baslik}
        </h4>
        <p className="mt-0.5 text-[11.5px] font-normal normal-case text-muted-foreground">{aciklama}</p>
      </div>
      <div className="max-h-[200px] divide-y overflow-y-auto">{children}</div>
    </div>
  );
}
