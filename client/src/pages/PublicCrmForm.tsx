import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type FormVerisi = {
  musteriAd: string;
  departmanlar: { id: string; ad: string }[];
  kart: Record<string, string>;
};

// Departman başına TEK kişi alanı. Firma hangi departmanı doldurursa o kaydedilir;
// boş bırakılan departman hiç gönderilmez.
type KisiAlani = {
  adSoyad: string;
  telefon: string;
  cepTelefon: string;
  email: string;
};

const bosKisi = (): KisiAlani => ({ adSoyad: "", telefon: "", cepTelefon: "", email: "" });

const KART_ALANLARI: { ad: string; etiket: string; placeholder?: string; tip?: string }[] = [
  { ad: "vergiDairesi", etiket: "Vergi Dairesi", placeholder: "Beşiktaş" },
  { ad: "vergiNo", etiket: "Vergi / TC No", placeholder: "1234567890" },
  { ad: "ilce", etiket: "İlçe", placeholder: "Şişli" },
  { ad: "il", etiket: "İl", placeholder: "İstanbul" },
  { ad: "postaKodu", etiket: "Posta Kodu", placeholder: "34394" },
  { ad: "telefon", etiket: "Santral Telefonu", placeholder: "0212 000 00 00", tip: "tel" },
  { ad: "faks", etiket: "Faks", placeholder: "0212 000 00 01", tip: "tel" },
  { ad: "genelEmail", etiket: "Genel E-posta", placeholder: "info@firma.com", tip: "email" },
  { ad: "web", etiket: "Web Sitesi", placeholder: "www.firma.com" },
];

export default function PublicCrmForm() {
  const [, params] = useRoute("/firma-bilgi/:token");
  const token = params?.token;

  const [kart, setKart] = useState<Record<string, string>>({});
  // departmanId -> kişi alanı
  const [kisiler, setKisiler] = useState<Record<string, KisiAlani>>({});
  const [gonderenAd, setGonderenAd] = useState("");
  const [gonderenEmail, setGonderenEmail] = useState("");
  const [gonderildi, setGonderildi] = useState(false);
  const [hataMesaji, setHataMesaji] = useState("");

  const { data, isLoading, error } = useQuery<FormVerisi>({
    queryKey: [`/api/crm/form/${token}`],
    queryFn: async () => {
      const res = await fetch(`/api/crm/form/${token}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Form açılamadı");
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  // Mevcut şirket bilgileri ön doldurulur; her departman için boş bir kişi alanı açılır.
  useEffect(() => {
    if (!data) return;
    setKart(data.kart ?? {});
    setKisiler(Object.fromEntries(data.departmanlar.map((d) => [d.id, bosKisi()])));
  }, [data]);

  const gonder = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/crm/form/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gonderenAd,
          gonderenEmail,
          kart,
          // Yalnız adı girilmiş departmanlar gönderilir.
          kisiler: Object.entries(kisiler)
            .filter(([, k]) => k.adSoyad.trim())
            .map(([departmanId, k]) => ({ departmanId, ...k })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gönderilemedi");
      return res.json();
    },
    onSuccess: () => setGonderildi(true),
    onError: (e: Error) => setHataMesaji(e.message),
  });

  const kisiGuncelle = (departmanId: string, alan: keyof KisiAlani, deger: string) =>
    setKisiler((onceki) => ({
      ...onceki,
      [departmanId]: { ...(onceki[departmanId] ?? bosKisi()), [alan]: deger },
    }));

  if (!token) {
    return <Merkez><p className="text-slate-600">Geçersiz bağlantı.</p></Merkez>;
  }

  if (isLoading) {
    return (
      <Merkez>
        <Card className="w-full max-w-2xl">
          <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </Merkez>
    );
  }

  if (error || !data) {
    return (
      <Merkez>
        <Card className="w-full max-w-lg border-t-4 border-t-slate-900 p-8 text-center shadow-lg">
          <CardTitle className="mb-2 text-xl">Bağlantı açılamadı</CardTitle>
          <CardDescription className="text-base">
            {(error as Error)?.message ?? "Bu bağlantı geçersiz ya da kapatılmış olabilir."}
            <br />
            Lütfen size bağlantıyı gönderen yetkiliyle iletişime geçin.
          </CardDescription>
        </Card>
      </Merkez>
    );
  }

  if (gonderildi) {
    return (
      <Merkez>
        <Card className="w-full max-w-lg border-t-4 border-t-slate-900 p-8 text-center shadow-lg">
          <div className="mb-8 flex justify-center">
            <img src="/CNC_tranparanLOGO.png" alt="CNC Logo" className="h-40 max-w-full object-contain" />
          </div>
          <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-500" />
          <CardTitle className="mb-2 text-2xl">Teşekkür Ederiz</CardTitle>
          <CardDescription className="text-base">
            Bilgileriniz kaydedildi. Doğru ve güncel iletişim bilgileri, işlemlerinizi
            daha hızlı yürütmemizi sağlıyor.
          </CardDescription>
        </Card>
      </Merkez>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-t-4 border-t-slate-900 shadow-lg">
          <CardHeader className="border-b pb-8 text-center">
            <div className="mb-6 flex justify-center">
              <img src="/CNC_tranparanLOGO.png" alt="CNC Logo" className="h-40 max-w-full object-contain" />
            </div>
            <CardTitle className="mb-2 text-3xl font-bold tracking-tight text-slate-900">
              Firma Bilgi Formu
            </CardTitle>
            <CardDescription className="text-base">
              <strong className="text-slate-800">{data.musteriAd}</strong>
              <br />
              Aşağıdaki bilgileri kontrol edip güncelleyebilir, departmanlarımızın
              iletişime geçeceği kişileri yazabilirsiniz.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-8">
            <form
              className="space-y-8"
              onSubmit={(e) => {
                e.preventDefault();
                setHataMesaji("");
                gonder.mutate();
              }}
            >
              {/* ── Firma bilgileri ── */}
              <section className="space-y-4 rounded-lg border bg-slate-50 p-6">
                <h3 className="text-[15px] font-bold text-slate-900">Firma Bilgileri</h3>

                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold">Adres</Label>
                  <Textarea
                    rows={2}
                    value={kart.adres ?? ""}
                    placeholder="Cadde, sokak, no, daire"
                    onChange={(e) => setKart({ ...kart, adres: e.target.value })}
                    className="bg-white"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {KART_ALANLARI.map((a) => (
                    <div key={a.ad} className="space-y-2">
                      <Label className="text-[13px] font-semibold">{a.etiket}</Label>
                      <Input
                        type={a.tip ?? "text"}
                        value={kart[a.ad] ?? ""}
                        placeholder={a.placeholder}
                        onChange={(e) => setKart({ ...kart, [a.ad]: e.target.value })}
                        className="bg-white"
                      />
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Departman bazlı iletişim kişileri ── */}
              <section className="space-y-4">
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900">İletişim Kişileri</h3>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Her departman için o konuda muhatap olacak kişiyi yazın.
                    <strong className="text-slate-700"> Size uymayan departmanları boş bırakabilirsiniz</strong> —
                    yalnız doldurduklarınız kaydedilir.
                  </p>
                </div>

                {data.departmanlar.map((d) => {
                  const k = kisiler[d.id] ?? bosKisi();
                  const dolu = !!k.adSoyad.trim();
                  return (
                    <div
                      key={d.id}
                      className={`rounded-lg border p-5 transition-colors ${dolu ? "border-slate-300 bg-white" : "bg-white"}`}
                    >
                      <h4 className="mb-4 text-[13.5px] font-extrabold uppercase tracking-wide text-slate-600">
                        {d.ad}
                      </h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-[13px] font-semibold">Ad Soyad</Label>
                          <Input
                            value={k.adSoyad}
                            placeholder="Ahmet Yılmaz"
                            onChange={(e) => kisiGuncelle(d.id, "adSoyad", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[13px] font-semibold">E-posta</Label>
                          <Input
                            type="email" value={k.email}
                            placeholder="ahmet@firma.com"
                            onChange={(e) => kisiGuncelle(d.id, "email", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[13px] font-semibold">Telefon</Label>
                          <Input
                            type="tel" value={k.telefon}
                            placeholder="0212 000 00 00"
                            onChange={(e) => kisiGuncelle(d.id, "telefon", e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[13px] font-semibold">Cep Telefonu</Label>
                          <Input
                            type="tel" value={k.cepTelefon}
                            placeholder="0532 000 00 00"
                            onChange={(e) => kisiGuncelle(d.id, "cepTelefon", e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* ── Formu dolduran ── */}
              <section className="grid gap-4 rounded-lg border bg-slate-50 p-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <h3 className="text-[15px] font-bold text-slate-900">Formu Dolduran</h3>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Bir sorumuz olursa size ulaşabilmemiz için.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold">Ad Soyad</Label>
                  <Input
                    value={gonderenAd}
                    onChange={(e) => setGonderenAd(e.target.value)}
                    className="bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold">E-posta</Label>
                  <Input
                    type="email" value={gonderenEmail}
                    onChange={(e) => setGonderenEmail(e.target.value)}
                    className="bg-white"
                  />
                </div>
              </section>

              {hataMesaji && (
                <p className="rounded-md bg-red-50 p-3 text-center text-[13px] font-semibold text-red-700">
                  {hataMesaji}
                </p>
              )}

              <Button
                type="submit"
                className="h-11 w-full bg-slate-900 text-base text-white hover:bg-slate-800"
                disabled={gonder.isPending}
              >
                {gonder.isPending ? "Gönderiliyor…" : "Bilgileri Gönder"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Merkez({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 p-4">
      {children}
    </div>
  );
}
