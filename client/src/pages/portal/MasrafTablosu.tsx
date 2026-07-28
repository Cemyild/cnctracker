import { ChevronDown, ChevronRight, Download, Trash2 } from "lucide-react";
import type { OperasyonMasraf } from "@shared/schema";
import type { GruplamaSonucu } from "./masrafGruplama";
import { formatPara, formatTarihKisa } from "./portalUtils";
import { RejimRozeti, REJIM_STIL, rejimAnahtar } from "./kasaUI";

// Başlık, grup satırı ve açılan alt kalemler AYNI ızgarayı paylaşır → sütunlar hizalı kalır.
const GRID = "grid grid-cols-[64px_92px_100px_160px_minmax(0,1fr)_116px_52px] gap-3 items-center";

function bas2(s: string | null | undefined) {
  return (s ?? "?").trim().slice(0, 2).toUpperCase();
}

const rozetSayi = "rounded-full border bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground";

export function MasrafTablosu({
  gruplarSonucu, acikSet, onToggle, varsayilanAcik = false, onKaldir, anahtarOnEk = "",
}: {
  gruplarSonucu: GruplamaSonucu;
  acikSet: Set<string>;
  onToggle: (anahtar: string) => void;
  varsayilanAcik?: boolean; // false: Açık Hareketler (sette-olan-açık) · true: Kapanmış gün içi (sette-olan-kapalı, negatif)
  onKaldir?: (masrafId: string) => void; // verilirse alt kalemlerde "Kaldır" ikonu
  anahtarOnEk?: string; // kapanış içi benzersizlik (ör. k.id)
}) {
  const { gruplar, ofisMasraflar, ofisToplam } = gruplarSonucu;
  const acikMi = (a: string) => (varsayilanAcik ? !acikSet.has(a) : acikSet.has(a));

  const altKalem = (m: OperasyonMasraf) => (
    <div key={m.id} className={GRID + " border-b border-dashed border-border/60 px-5 py-2 text-sm last:border-b-0"} data-testid={`row-masraf-${m.id}`}>
      <span className="col-start-1 tabular-nums text-xs text-muted-foreground">{formatTarihKisa(m.tarih)}</span>
      <span className="col-start-3 font-medium">{m.masrafTuru ?? "Masraf"}</span>
      <span className="col-start-5 truncate text-xs text-muted-foreground">{m.aciklama ?? ""}</span>
      <span className="col-start-6 text-right font-semibold tabular-nums text-rose-600">−{formatPara(m.tutar, "₺")}</span>
      <span className="col-start-7 flex items-center justify-end gap-1.5">
        {m.belgeDosya && (
          <a className="flex h-6 w-6 items-center justify-center rounded-md border text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40" href={"/" + m.belgeDosya.replace(/^\/+/, "")} target="_blank" rel="noreferrer" title="Belgeyi indir">
            <Download className="h-3.5 w-3.5" />
          </a>
        )}
        {onKaldir && (
          <button type="button" className="flex h-6 w-6 items-center justify-center rounded-md border text-muted-foreground hover:border-rose-300 hover:text-rose-600" title="Kaldır" onClick={() => onKaldir(m.id)} data-testid={`button-masraf-kaldir-${m.id}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className={GRID + " border-b bg-muted/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"}>
        <span>Tarih</span><span>Dosya No</span><span>Tür</span><span>Beyanname No</span><span>Firma</span><span className="text-right">Tutar</span><span />
      </div>

      {gruplar.map((g) => {
        const anahtar = anahtarOnEk ? `${anahtarOnEk}-${g.beyannameId}` : g.beyannameId;
        const acik = acikMi(anahtar);
        const b = g.beyanname;
        const k = rejimAnahtar(b?.rejim);
        return (
          <div key={anahtar} className="border-b last:border-b-0" data-testid={`group-beyanname-${g.beyannameId}`}>
            <button type="button" onClick={() => onToggle(anahtar)} className={GRID + " w-full px-5 py-3 text-left text-sm hover:bg-muted/30"} data-testid={`button-group-toggle-${anahtar}`}>
              <span className="font-bold tabular-nums">{formatTarihKisa(g.tarih)}</span>
              <span className="truncate font-semibold tabular-nums">{b?.dosyaNo ?? (b?.rejim === "TR" ? "TR" : "—")}</span>
              <span className="min-w-0"><RejimRozeti rejim={b?.rejim} /></span>
              <span className="truncate text-xs tabular-nums text-muted-foreground">{b?.beyanNo ?? "—"}</span>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${REJIM_STIL[k].avatar}`}>{bas2(b?.alici)}</span>
                <span className="truncate font-semibold" title={b?.alici ?? ""}>{b?.alici ?? "?"}</span>
              </span>
              <span className="flex items-center justify-end gap-1.5 text-right font-bold tabular-nums text-rose-600">
                −{formatPara(g.toplam, "₺")}
                {g.masraflar.length >= 2 && <span className={rozetSayi}>{g.masraflar.length}</span>}
              </span>
              <span className="flex justify-end text-muted-foreground">{acik ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
            </button>
            {acik && <div className="border-t bg-muted/20">{g.masraflar.map(altKalem)}</div>}
          </div>
        );
      })}

      {ofisMasraflar.length > 0 && (() => {
        const anahtar = anahtarOnEk ? `${anahtarOnEk}-__ofis__` : "__ofis__";
        const acik = acikMi(anahtar);
        return (
          <div className="border-t" data-testid="group-ofis">
            <button type="button" onClick={() => onToggle(anahtar)} className={GRID + " w-full px-5 py-3 text-left text-sm hover:bg-muted/30"} data-testid="button-group-toggle-ofis">
              <span className="font-bold tabular-nums">—</span>
              <span className="text-muted-foreground">—</span>
              <span className="min-w-0"><RejimRozeti rejim={null} dosyaYok /></span>
              <span className="truncate text-xs text-muted-foreground">beyannamesiz</span>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${REJIM_STIL.of.avatar}`}>OF</span>
                <span className="truncate font-semibold">Ofis Masrafları</span>
              </span>
              <span className="flex items-center justify-end gap-1.5 text-right font-bold tabular-nums text-rose-600">
                −{formatPara(ofisToplam, "₺")}
                {ofisMasraflar.length >= 2 && <span className={rozetSayi}>{ofisMasraflar.length}</span>}
              </span>
              <span className="flex justify-end text-muted-foreground">{acik ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
            </button>
            {acik && <div className="border-t bg-muted/20">{ofisMasraflar.map(altKalem)}</div>}
          </div>
        );
      })()}
    </div>
  );
}
