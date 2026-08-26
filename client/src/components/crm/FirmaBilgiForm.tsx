import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { CrmMusteriBilgi } from "./tipler";

const ALANLAR = [
  "vergiDairesi", "vergiNo", "adres", "ilce", "il", "postaKodu",
  "telefon", "faks", "genelEmail", "web", "notlar",
] as const;

type Alan = (typeof ALANLAR)[number];
type Form = Record<Alan, string>;

const bosForm = Object.fromEntries(ALANLAR.map((a) => [a, ""])) as Form;

const formDoldur = (bilgi: CrmMusteriBilgi | null): Form =>
  Object.fromEntries(ALANLAR.map((a) => [a, bilgi?.[a] ?? ""])) as Form;

export function FirmaBilgiForm({ musteriId, bilgi }: { musteriId: string; bilgi: CrmMusteriBilgi | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(bosForm);

  // Müşteri değişince form o müşterinin kartıyla yeniden kurulur; aksi halde
  // önceki firmanın adresi yeni firmada görünür kalırdı.
  useEffect(() => { setForm(formDoldur(bilgi)); }, [musteriId, bilgi]);

  const kaydet = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/crm/musteriler/${musteriId}/bilgi`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Kaydedilemedi");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/crm/musteriler", musteriId] });
      qc.invalidateQueries({ queryKey: ["/api/crm/musteriler"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/stats"] });
      toast({ title: "Firma bilgileri kaydedildi" });
    },
    onError: (e: Error) => toast({ title: "Hata", description: e.message, variant: "destructive" }),
  });

  const alan = (ad: Alan, etiket: string, placeholder?: string, tip = "text") => (
    <div className="grid min-w-0 gap-1.5">
      <Label className="text-[12.5px] font-semibold">{etiket}</Label>
      <Input
        type={tip}
        value={form[ad]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [ad]: e.target.value })}
      />
    </div>
  );

  // Kaydedilmemiş değişiklik varsa düğme vurgulanır.
  const degisti = ALANLAR.some((a) => form[a] !== (bilgi?.[a] ?? ""));

  return (
    <div className="rounded-[14px] border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-bold tracking-tight">Firma Bilgileri</h3>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Adres, vergi ve santral iletişim bilgileri
          </p>
        </div>
        <Button
          className="h-[34px] gap-1.5 bg-slate-900 text-white hover:bg-slate-800"
          disabled={!degisti || kaydet.isPending}
          onClick={() => kaydet.mutate()}
        >
          <Save className="h-3.5 w-3.5" />
          {kaydet.isPending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        {alan("vergiDairesi", "Vergi Dairesi", "Beşiktaş")}
        {alan("vergiNo", "Vergi / TC No", "1234567890")}
      </div>

      <div className="mt-3.5 grid min-w-0 gap-1.5">
        <Label className="text-[12.5px] font-semibold">Adres</Label>
        <Textarea
          rows={2}
          value={form.adres}
          placeholder="Cadde, sokak, no, daire"
          onChange={(e) => setForm({ ...form, adres: e.target.value })}
        />
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-3">
        {alan("ilce", "İlçe", "Şişli")}
        {alan("il", "İl", "İstanbul")}
        {alan("postaKodu", "Posta Kodu", "34394")}
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        {alan("telefon", "Santral Telefonu", "0212 000 00 00", "tel")}
        {alan("faks", "Faks", "0212 000 00 01", "tel")}
      </div>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        {alan("genelEmail", "Genel E-posta", "info@firma.com", "email")}
        {alan("web", "Web Sitesi", "www.firma.com")}
      </div>

      <div className="mt-3.5 grid min-w-0 gap-1.5">
        <Label className="text-[12.5px] font-semibold">Notlar</Label>
        <Textarea
          rows={3}
          value={form.notlar}
          placeholder="Firmayla çalışma şekli, dikkat edilecekler…"
          onChange={(e) => setForm({ ...form, notlar: e.target.value })}
        />
      </div>
    </div>
  );
}
