import { useRef, useState } from "react";
import { Truck, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Transit (TR rejim) listesi yükleme butonu.
 *
 * Beyanname listesinden ayrı bir dökümdür: kolon başlıkları tamamen farklı
 * ("Dosya No", "Fatura Firma", "Konteyner No", "MRN"). Sunucu tarafında
 * /api/gumruk/transit-yukle bunu gumruk_verileri tablosuna rejim="TR" olarak
 * yazar; nakliye eşleştirme motoru transit işlerini böylece kapsar.
 *
 * Mevcut ExcelUploadModal'a dokunulmadı — o akış satış/gider yüklemesi için
 * kullanılıyor ve tek bir dosya tipine göre kurgulanmış durumda.
 */
export function TransitUploadButton({ onSuccess }: { onSuccess?: () => void }) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  const dosyaSecildi = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dosya = e.target.files?.[0];
    if (!dosya) return;
    setYukleniyor(true);
    try {
      const fd = new FormData();
      fd.append("file", dosya);
      const r = await fetch("/api/gumruk/transit-yukle", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Yükleme başarısız");

      toast({
        title: "Transit listesi yüklendi",
        description:
          `${j.eklenen} kayıt eklendi` +
          (j.atlanan ? ` · ${j.atlanan} mükerrer atlandı` : "") +
          (j.konteynersiz ? ` · ${j.konteynersiz} satırda konteyner yok` : ""),
      });
      onSuccess?.();
    } catch (err) {
      toast({
        title: "Transit listesi yüklenemedi",
        description: err instanceof Error ? err.message : "Bilinmeyen hata",
        variant: "destructive",
      });
    } finally {
      setYukleniyor(false);
      // Aynı dosyayı tekrar seçebilmek için input sıfırlanır
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={dosyaSecildi}
      />
      <button
        type="button"
        disabled={yukleniyor}
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        title="Transit (TR) listesini yükle — beyanname listesinden ayrı dökümdür"
        data-testid="button-transit-upload"
      >
        {yukleniyor
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Truck className="h-4 w-4" />}
        {yukleniyor ? "Yükleniyor…" : "Transit Listesi"}
      </button>
    </>
  );
}
