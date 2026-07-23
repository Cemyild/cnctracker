import { useQuery } from "@tanstack/react-query";

type OtoLog = {
  id: string;
  durum: string;
  kayitSayisi: number;
  mesaj: string | null;
  zaman: string;      // "YYYY-MM-DD HH:mm:ss"
  dosyaAdi: string;
};

export function OtomatikYuklemeRozeti({ tip, baslik }: { tip: "mizan" | "beyanname" | "beyanname-ex"; baslik?: string }) {
  const { data: loglar } = useQuery<OtoLog[]>({
    queryKey: [`/api/otomatik-yukleme/log?tip=${tip}&limit=5`],
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });

  if (!loglar || loglar.length === 0) return null;
  const son = loglar[0];
  // Tarih dd/mm/yyyy HH:mm — string slice ile; new Date() YÖNLENDİRMESİ YOK (timezone güvenliği)
  const tarih = `${son.zaman.slice(8, 10)}/${son.zaman.slice(5, 7)}/${son.zaman.slice(0, 4)} ${son.zaman.slice(11, 16)}`;
  const renk =
    son.durum === "hata" ? "text-red-600"
    : son.durum === "atlandi" ? "text-muted-foreground"
    : "text-green-600";

  return (
    <div className="rounded-md border p-3 text-sm space-y-1" data-testid={`oto-yukleme-${tip}`}>
      <div className="font-medium">
        {baslik ? `${baslik} — son yükleme: ` : "Son otomatik yükleme: "}{tarih} — <span className={renk}>{son.mesaj || son.durum}</span>
      </div>
      {loglar.length > 1 && (
        <ul className="text-xs text-muted-foreground">
          {loglar.slice(1).map((l) => (
            <li key={l.id}>{l.zaman.slice(11, 16)} · {l.dosyaAdi} · {l.durum}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
