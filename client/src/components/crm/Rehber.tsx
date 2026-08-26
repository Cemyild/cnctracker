import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Search, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aramaEslesir, DEPARTMANSIZ, type CrmRehberSatiri } from "./tipler";

// Tüm müşterilerin iletişim kişileri tek tabloda. "Bu numara kimdi?",
// "X firmasının muhasebecisi kimdi?" sorularının tek adresi.
export function Rehber({ onMusteriAc }: { onMusteriAc: (musteriId: string) => void }) {
  const [arama, setArama] = useState("");
  const [sadeceAktif, setSadeceAktif] = useState(true);

  const { data: satirlar = [], isLoading } = useQuery<CrmRehberSatiri[]>({
    queryKey: ["/api/crm/rehber"],
  });

  const suzulmus = useMemo(
    () =>
      satirlar
        .filter((s) => (sadeceAktif ? s.aktif : true))
        .filter((s) =>
          aramaEslesir(arama, s.adSoyad, s.musteriAd, s.hesapKodu, s.departmanAd, s.unvan, s.telefon, s.cepTelefon, s.email),
        ),
    [satirlar, arama, sadeceAktif],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="İsim, firma, departman, telefon veya e-posta ara…"
            className="h-[38px] text-[13px]"
            style={{ paddingLeft: "2.35rem" }}
          />
        </div>
        <Button
          variant={sadeceAktif ? "default" : "outline"}
          className={cn("h-[38px] text-[12.5px]", sadeceAktif && "bg-slate-900 text-white hover:bg-slate-800")}
          onClick={() => setSadeceAktif((v) => !v)}
        >
          {sadeceAktif ? "Sadece aktifler" : "Pasifler dahil"}
        </Button>
        <span className="text-[12px] font-semibold text-muted-foreground">
          {suzulmus.length} kişi
        </span>
      </div>

      <div className="overflow-hidden rounded-[14px] border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b bg-slate-50 dark:bg-slate-900/40">
              <tr>
                {["Kişi", "Firma", "Departman", "Telefon", "E-posta", ""].map((b, i) => (
                  <th
                    key={b || `bos-${i}`}
                    className="p-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-slate-500"
                  >
                    {b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="p-8 text-center text-[13px] text-muted-foreground">Yükleniyor…</td></tr>
              )}
              {!isLoading && suzulmus.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[13px] text-muted-foreground">
                    {satirlar.length === 0
                      ? "Henüz hiç iletişim kişisi girilmemiş."
                      : "Aramaya uyan kişi bulunamadı."}
                  </td>
                </tr>
              )}
              {suzulmus.map((s) => (
                <tr key={s.id} className={cn("border-b border-border/60", !s.aktif && "opacity-55")}>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      {s.birincil && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />}
                      <span className="font-bold">{s.adSoyad}</span>
                    </div>
                    {s.unvan && <div className="mt-0.5 text-[11.5px] text-muted-foreground">{s.unvan}</div>}
                  </td>
                  <td className="p-3">
                    <div className="font-semibold">{s.musteriAd}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">{s.hesapKodu}</div>
                  </td>
                  <td className="p-3 text-[12.5px]">{s.departmanAd ?? DEPARTMANSIZ}</td>
                  <td className="p-3 text-[12.5px]">
                    {s.telefon && <a href={`tel:${s.telefon}`} className="block hover:underline">{s.telefon}</a>}
                    {s.cepTelefon && <a href={`tel:${s.cepTelefon}`} className="block hover:underline">{s.cepTelefon}</a>}
                    {!s.telefon && !s.cepTelefon && <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-[12.5px]">
                    {s.email
                      ? <a href={`mailto:${s.email}`} className="hover:underline">{s.email}</a>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      className="h-[28px] gap-1.5 px-2 text-[11.5px] font-bold"
                      onClick={() => onMusteriAc(s.musteriId)}
                    >
                      Firmayı aç <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
