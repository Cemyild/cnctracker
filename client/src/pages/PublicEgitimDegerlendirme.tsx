import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, CheckCircle2 } from "lucide-react";

type Soru = { id: string; soru: string; tip: string; sira: number };
type EgitimInfo = { egitim: { id: string; baslik: string; egitimTarihi: string; egitimci: string | null }; sorular: Soru[] };

export default function PublicEgitimDegerlendirme() {
  const [, params] = useRoute("/egitim-degerlendirme/:id");
  const egitimId = params?.id;
  const { toast } = useToast();

  const [katilimciAdi, setKatilimciAdi] = useState("");
  const [puanlar, setPuanlar] = useState<Record<string, number>>({});
  const [metinler, setMetinler] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data, isLoading, error } = useQuery<EgitimInfo>({
    queryKey: [`/api/egitim-degerlendirme/${egitimId}`],
    enabled: !!egitimId,
    queryFn: () => fetch(`/api/egitim-degerlendirme/${egitimId}`).then(r => {
      if (!r.ok) throw new Error("Eğitim bulunamadı");
      return r.json();
    }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!data) return;
      const cevaplar = data.sorular.map(s => ({
        soruId: s.id,
        puan: s.tip === "puan_1_5" ? puanlar[s.id] : undefined,
        cevap: s.tip === "acik_metin" ? metinler[s.id] : undefined,
      }));
      const res = await fetch("/api/egitim-degerlendirme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ egitimId, katilimciAdi, cevaplar }),
      });
      if (!res.ok) throw new Error("Gönderme hatası");
    },
    onSuccess: () => setSubmitted(true),
    onError: () => toast({ title: "Hata", description: "Değerlendirme kaydedilemedi. Lütfen tekrar deneyin.", variant: "destructive" }),
  });

  const allPuanFilled = data?.sorular.filter(s => s.tip === "puan_1_5").every(s => puanlar[s.id]) ?? true;
  const canSubmit = katilimciAdi.trim().length > 0 && allPuanFilled;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Yükleniyor...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-500">Eğitim bulunamadı veya değerlendirme formu mevcut değil.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-6">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h2 className="text-2xl font-semibold">Teşekkürler!</h2>
        <p className="text-muted-foreground max-w-sm">Değerlendirmeniz başarıyla kaydedildi. Geri bildiriminiz için teşekkür ederiz.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-xl shadow-sm border p-8 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <GraduationCap className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Eğitim Değerlendirme Formu</h1>
            <p className="text-sm text-muted-foreground">{data.egitim.baslik} · {data.egitim.egitimTarihi}</p>
          </div>
        </div>

        <div>
          <Label>Adınız Soyadınız *</Label>
          <Input
            value={katilimciAdi}
            onChange={e => setKatilimciAdi(e.target.value)}
            placeholder="Ad Soyad"
            className="mt-1"
          />
        </div>

        {data.sorular.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-4">Değerlendirme şablonu henüz tanımlanmamış.</p>
        )}

        {[...data.sorular].sort((a, b) => a.sira - b.sira).map((soru, idx) => (
          <div key={soru.id} className="space-y-2">
            <Label>{idx + 1}. {soru.soru}</Label>
            {soru.tip === "puan_1_5" ? (
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPuanlar(prev => ({ ...prev, [soru.id]: n }))}
                    className={`w-10 h-10 rounded-full border text-sm font-medium transition-colors ${
                      puanlar[soru.id] === n
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                {puanlar[soru.id] && (
                  <span className="self-center text-xs text-muted-foreground ml-2">
                    {["", "Çok Kötü", "Kötü", "Orta", "İyi", "Çok İyi"][puanlar[soru.id]]}
                  </span>
                )}
              </div>
            ) : (
              <Textarea
                value={metinler[soru.id] ?? ""}
                onChange={e => setMetinler(prev => ({ ...prev, [soru.id]: e.target.value }))}
                rows={3}
                placeholder="Görüşlerinizi yazınız..."
              />
            )}
          </div>
        ))}

        <Button
          className="w-full"
          disabled={!canSubmit || submitMutation.isPending}
          onClick={() => submitMutation.mutate()}
        >
          {submitMutation.isPending ? "Gönderiliyor..." : "Değerlendirmeyi Gönder"}
        </Button>
      </div>
    </div>
  );
}
