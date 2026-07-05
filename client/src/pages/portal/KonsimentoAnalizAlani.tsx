import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";

// Depo teminatı konşimentosu: dosya seçimi → Claude analizi → düzenlenebilir onay kartı.
// Onaylanmadan üst form gönderime izin vermez; alan değişince onay sıfırlanır
// (onay her zaman ekranda görünen son bilgiye aittir).

export type KonsimentoBilgisi = {
  dosya: File | null;
  konsimentoNo: string;
  tasiyici: string;
  onaylandi: boolean;
  alacakliOnerisi: string | null;
};

export const BOS_KONSIMENTO: KonsimentoBilgisi = {
  dosya: null,
  konsimentoNo: "",
  tasiyici: "",
  onaylandi: false,
  alacakliOnerisi: null,
};

type AnalizYaniti = {
  konsimentoNo: string | null;
  tasiyici: string | null;
  acenteAdi: string | null;
  acenteAdres: string | null;
  acenteBulundu: boolean;
};

type Asama = "bos" | "analiz" | "hazir" | "elle";

export default function KonsimentoAnalizAlani({
  deger,
  onDegisim,
  idOnEki,
}: {
  deger: KonsimentoBilgisi;
  onDegisim: (b: KonsimentoBilgisi) => void;
  idOnEki: string;
}) {
  const [asama, setAsama] = useState<Asama>("bos");
  const [analiz, setAnaliz] = useState<AnalizYaniti | null>(null);
  const [hataMesaji, setHataMesaji] = useState("");

  // Geciken analiz yanıtlarının güncel seçimi ezmesini önler:
  // her dosya değişiminde artar; eski isteğin yanıtı geldiğinde yok sayılır.
  const istekSayaci = useRef(0);

  const dosyaSecildi = async (dosya: File | null) => {
    const buIstek = ++istekSayaci.current;
    if (!dosya) {
      setAsama("bos");
      setAnaliz(null);
      onDegisim({ ...BOS_KONSIMENTO });
      return;
    }
    // Yeni dosya: önceki bilgiler ve onay geçersiz
    onDegisim({ dosya, konsimentoNo: "", tasiyici: "", onaylandi: false, alacakliOnerisi: null });
    setAsama("analiz");
    setHataMesaji("");
    try {
      const fd = new FormData();
      fd.set("konsimento", dosya);
      const res = await fetch("/api/portal/konsimento-analiz", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (buIstek !== istekSayaci.current) return; // seçim değişti — bu yanıt bayat
      if (!res.ok) {
        const govde = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(govde.error || "Analiz yapılamadı");
      }
      const veri = (await res.json()) as AnalizYaniti;
      if (buIstek !== istekSayaci.current) return;
      setAnaliz(veri);
      setAsama("hazir");
      onDegisim({
        dosya,
        konsimentoNo: veri.konsimentoNo ?? "",
        tasiyici: veri.tasiyici ?? "",
        onaylandi: false,
        alacakliOnerisi: veri.acenteAdi ?? veri.tasiyici ?? null,
      });
    } catch (e: any) {
      if (buIstek !== istekSayaci.current) return; // bayat hata da yok sayılır
      setAnaliz(null);
      setAsama("elle");
      setHataMesaji(e.message || "Analiz yapılamadı — bilgileri elle girin");
    }
  };

  const alanGuncelle = (kismi: Partial<KonsimentoBilgisi>) => {
    // Bilgi değişti — onay sıfırlanır
    onDegisim({ ...deger, ...kismi, onaylandi: false });
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`${idOnEki}-konsimento-dosya`}>Konşimento (zorunlu — PDF)</Label>
      <Input
        id={`${idOnEki}-konsimento-dosya`}
        type="file"
        accept="application/pdf"
        onChange={(e) => dosyaSecildi(e.target.files?.[0] ?? null)}
        data-testid={`input-${idOnEki}-konsimento`}
      />

      {asama === "analiz" && (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          data-testid={`durum-${idOnEki}-analiz`}
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          Konşimento analiz ediliyor…
        </div>
      )}

      {(asama === "hazir" || asama === "elle") && (
        <Card className={asama === "elle" ? "border-amber-300" : "border-emerald-300"}>
          <CardContent className="pt-4 space-y-3">
            {asama === "elle" && (
              <p className="text-sm text-amber-700" data-testid={`uyari-${idOnEki}-elle`}>
                {hataMesaji} — bilgileri elle girin.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor={`${idOnEki}-konsimento-no`}>Konşimento No (zorunlu)</Label>
                <Input
                  id={`${idOnEki}-konsimento-no`}
                  value={deger.konsimentoNo}
                  onChange={(e) => alanGuncelle({ konsimentoNo: e.target.value })}
                  data-testid={`input-${idOnEki}-konsimento-no`}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`${idOnEki}-tasiyici`}>Taşıyıcı</Label>
                <Input
                  id={`${idOnEki}-tasiyici`}
                  value={deger.tasiyici}
                  onChange={(e) => alanGuncelle({ tasiyici: e.target.value })}
                  data-testid={`input-${idOnEki}-tasiyici`}
                />
              </div>
            </div>

            {asama === "hazir" && (
              <div className="text-xs rounded-md border p-2 space-y-0.5">
                {analiz?.acenteBulundu ? (
                  <>
                    <div>
                      <span className="font-medium">Türkiye Ödeme Acentesi:</span>{" "}
                      {analiz.acenteAdi}
                    </div>
                    {analiz.acenteAdres && (
                      <div className="text-muted-foreground">{analiz.acenteAdres}</div>
                    )}
                    <div className="text-muted-foreground">
                      Alacaklı alanı bu acenteyle dolduruldu — gerekirse değiştirin.
                    </div>
                  </>
                ) : (
                  <div className="text-amber-700" data-testid={`uyari-${idOnEki}-acente-yok`}>
                    Konşimentoda Türkiye acentesi bulunamadı — alacaklı taşıyıcı olarak ayarlandı.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id={`${idOnEki}-konsimento-onay`}
                checked={deger.onaylandi}
                onCheckedChange={(v) => onDegisim({ ...deger, onaylandi: v === true })}
                data-testid={`checkbox-${idOnEki}-konsimento-onay`}
              />
              <Label htmlFor={`${idOnEki}-konsimento-onay`} className="font-normal">
                Bilgiler doğru, onaylıyorum
              </Label>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
