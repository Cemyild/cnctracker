import type { Beyanname, OperasyonMasraf } from "@shared/schema";

// Kasam ve Kapanışlarım aynı gruplamayı kullanır — tek doğruluk kaynağı.
// Kural: dosyaYok=true VEYA beyannameId boş → ofis grubuna; diğerleri beyannameId bazında.
export type MasrafGrubu = {
  beyannameId: string;
  beyanname: Beyanname | undefined;
  masraflar: OperasyonMasraf[];
  toplam: number;
  tarih: string; // grubun en erken masraf tarihi (dd/mm gösterimi için)
};

export type GruplamaSonucu = {
  gruplar: MasrafGrubu[];
  ofisMasraflar: OperasyonMasraf[];
  ofisToplam: number;
};

export function masraflariGrupla(
  masraflar: OperasyonMasraf[],
  beyannameMap: Map<string, Beyanname>,
): GruplamaSonucu {
  const harita = new Map<string, OperasyonMasraf[]>();
  const ofis: OperasyonMasraf[] = [];
  for (const m of masraflar) {
    if (m.dosyaYok || !m.beyannameId) { ofis.push(m); continue; }
    const g = harita.get(m.beyannameId);
    if (g) g.push(m); else harita.set(m.beyannameId, [m]);
  }
  const topla = (list: OperasyonMasraf[]) =>
    Math.round(list.reduce((s, m) => s + parseFloat(m.tutar), 0) * 100) / 100;
  const gruplar = Array.from(harita.entries()).map(([beyannameId, list]) => ({
    beyannameId, beyanname: beyannameMap.get(beyannameId), masraflar: list, toplam: topla(list),
    tarih: list.reduce((min, m) => (m.tarih < min ? m.tarih : min), list[0].tarih),
  }));
  // Kronolojik sırala (YYYY-MM-DD lexicographic = kronolojik); eşit tarihte dosya no.
  gruplar.sort((a, b) =>
    a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 :
    (a.beyanname?.dosyaNo ?? "").localeCompare(b.beyanname?.dosyaNo ?? "", "tr"));
  return { gruplar, ofisMasraflar: ofis, ofisToplam: topla(ofis) };
}
