import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FormVerisi = {
  musteriAd: string;
  departmanlar: { id: string; ad: string }[];
  kart: Record<string, string>;
};

const DEPARTMANSIZ_DEGER = "__yok__";

type KisiSatiri = {
  departmanId: string;
  adSoyad: string;
  unvan: string;
  telefon: string;
  cepTelefon: string;
  email: string;
};

const bosKisi = (departmanId = DEPARTMANSIZ_DEGER): KisiSatiri => ({
  departmanId, adSoyad: "", unvan: "", telefon: "", cepTelefon: "", email: "",
});

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
  const [kisiler, setKisiler] = useState<KisiSatiri[]>([bosKisi()]);
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

  // Mevcut şirket bilgileri ön doldurulur; firma düzeltip gönderir.
  // İlk departman varsa ilk kişi satırı ona ayarlanır.
  useEffect(() => {
    if (!data) return;
    setKart(data.kart ?? {});
    setKisiler([bosKisi(data.departmanlar[0]?.id ?? DEPARTMANSIZ_DEGER)]);
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
          kisiler: kisiler
            .filter((k) => k.adSoyad.trim())
            .map((k) => ({
              ...k,
              departmanId: k.departmanId === DEPARTMANSIZ_DEGER ? null : k.departmanId,
            })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Gönderilemedi");
      return res.json();
    },
    onSuccess: () => setGonderildi(true),
    onError: (e: Error) => setHataMesaji(e.message),
  });

  const kisiGuncelle = (i: number, alan: keyof KisiSatiri, deger: string) =>
    setKisiler((onceki) => onceki.map((k, j) => (j === i ? { ...k, [alan]: deger } : k)));

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
              Aşağıdaki bilgileri kontrol edip güncelleyebilir, departmanlarınız için
              iletişim kurulacak kişileri ekleyebilirsiniz.
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

              {/* ── İletişim kişileri ── */}
              <section className="space-y-4">
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900">İletişim Kişileri</h3>
                  <p className="mt-1 text-[13px] text-slate-500">
                    Her departman için bizimle iletişime geçilecek kişiyi yazın. Aynı
                    departmana birden fazla kişi ekleyebilirsiniz.
                  </p>
                </div>

                {kisiler.map((k, i) => (
                  <div key={i} className="space-y-4 rounded-lg border bg-white p-5">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-bold text-slate-500">
                        {i + 1}. Kişi
                      </span>
                      {kisiler.length > 1 && (
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setKisiler(kisiler.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Kaldır
                        </Button>
                      )}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-[13px] font-semibold">Departman</Label>
                        <Select
                          value={k.departmanId}
                          onValueChange={(v) => kisiGuncelle(i, "departmanId", v)}
                        >
                          <SelectTrigger><SelectValue placeholder="Seçiniz" /></SelectTrigger>
                          <SelectContent>
                            {data.departmanlar.map((d) => (
                              <SelectItem key={d.id} value={d.id}>{d.ad}</SelectItem>
                            ))}
                            <SelectItem value={DEPARTMANSIZ_DEGER}>Diğer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[13px] font-semibold">Ad Soyad</Label>
                        <Input
                          value={k.adSoyad}
                          placeholder="Ahmet Yılmaz"
                          onChange={(e) => kisiGuncelle(i, "adSoyad", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[13px] font-semibold">Görev / Ünvan</Label>
                        <Input
                          value={k.unvan}
                          placeholder="İthalat Şefi"
                          onChange={(e) => kisiGuncelle(i, "unvan", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[13px] font-semibold">E-posta</Label>
                        <Input
                          type="email" value={k.email}
                          placeholder="ahmet@firma.com"
                          onChange={(e) => kisiGuncelle(i, "email", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[13px] font-semibold">Telefon</Label>
                        <Input
                          type="tel" value={k.telefon}
                          placeholder="0212 000 00 00"
                          onChange={(e) => kisiGuncelle(i, "telefon", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[13px] font-semibold">Cep Telefonu</Label>
                        <Input
                          type="tel" value={k.cepTelefon}
                          placeholder="0532 000 00 00"
                          onChange={(e) => kisiGuncelle(i, "cepTelefon", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <Button
                  type="button" variant="outline" className="w-full"
                  onClick={() => setKisiler([...kisiler, bosKisi(data.departmanlar[0]?.id ?? DEPARTMANSIZ_DEGER)])}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Kişi Ekle
                </Button>
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
