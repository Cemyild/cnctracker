// Sigorta poliçeleri ve muhasebe kayıtlarını 2025+2026 için tamamen sıfırlar.
// Kullanıcının yeniden yüklemesi için temiz bir sayfa açar.
//
// Çalıştırma: npx tsx scripts/reset_sigorta_2025_2026.ts
//
// Güvenlik: SADECE yil IN (2025, 2026) filtresiyle siler. Diğer yıllar dokunulmaz.
// Önce/sonra sayımları konsola basar.

import "dotenv/config";
import { db } from "../server/db";
import { sigortaPoliceleri, sigortaMuhasebeKayitlari } from "../shared/schema";
import { inArray, sql } from "drizzle-orm";

const HEDEF_YILLAR = [2025, 2026];

async function sayim(yillar: number[]) {
  const policeResult = await db
    .select({
      yil: sigortaPoliceleri.yil,
      sirket: sigortaPoliceleri.sirket,
      adet: sql<number>`count(*)`,
    })
    .from(sigortaPoliceleri)
    .where(inArray(sigortaPoliceleri.yil, yillar))
    .groupBy(sigortaPoliceleri.yil, sigortaPoliceleri.sirket);

  const muhasebeResult = await db
    .select({
      yil: sigortaMuhasebeKayitlari.yil,
      sirket: sigortaMuhasebeKayitlari.sirket,
      adet: sql<number>`count(*)`,
    })
    .from(sigortaMuhasebeKayitlari)
    .where(inArray(sigortaMuhasebeKayitlari.yil, yillar))
    .groupBy(sigortaMuhasebeKayitlari.yil, sigortaMuhasebeKayitlari.sirket);

  return { policeResult, muhasebeResult };
}

function tabloYaz(baslik: string, satirlar: Array<{ yil: number | null; sirket: string; adet: number }>) {
  console.log(`\n  ${baslik}:`);
  if (satirlar.length === 0) {
    console.log("    (kayıt yok)");
    return;
  }
  let toplam = 0;
  for (const s of satirlar) {
    console.log(`    ${s.yil} • ${s.sirket.padEnd(15)} → ${Number(s.adet)} kayıt`);
    toplam += Number(s.adet);
  }
  console.log(`    ─────────── TOPLAM: ${toplam}`);
}

async function main() {
  console.log("═════════════════════════════════════════════════════════════");
  console.log(`  SİGORTA RESET — ${HEDEF_YILLAR.join(", ")} (sadece bu yıllar)`);
  console.log("═════════════════════════════════════════════════════════════");

  console.log("\n[1/3] Mevcut durum sayılıyor...");
  const onceki = await sayim(HEDEF_YILLAR);
  tabloYaz("POLİÇELER (öncesi)", onceki.policeResult.map(r => ({ yil: r.yil, sirket: r.sirket, adet: r.adet })));
  tabloYaz("MUHASEBE (öncesi)", onceki.muhasebeResult.map(r => ({ yil: r.yil, sirket: r.sirket, adet: r.adet })));

  console.log("\n[2/3] Silme işlemi başlatılıyor...");

  // Önce muhasebe (poliçeye FK var olsa bile, ON DELETE SET NULL ama biz zaten her ikisini de silmek istiyoruz)
  const silinenMuhasebe = await db
    .delete(sigortaMuhasebeKayitlari)
    .where(inArray(sigortaMuhasebeKayitlari.yil, HEDEF_YILLAR))
    .returning({ id: sigortaMuhasebeKayitlari.id });
  console.log(`  ✓ ${silinenMuhasebe.length} muhasebe kaydı silindi`);

  const silinenPolice = await db
    .delete(sigortaPoliceleri)
    .where(inArray(sigortaPoliceleri.yil, HEDEF_YILLAR))
    .returning({ id: sigortaPoliceleri.id });
  console.log(`  ✓ ${silinenPolice.length} poliçe silindi`);

  console.log("\n[3/3] Son durum doğrulanıyor...");
  const sonra = await sayim(HEDEF_YILLAR);
  tabloYaz("POLİÇELER (sonrası)", sonra.policeResult.map(r => ({ yil: r.yil, sirket: r.sirket, adet: r.adet })));
  tabloYaz("MUHASEBE (sonrası)", sonra.muhasebeResult.map(r => ({ yil: r.yil, sirket: r.sirket, adet: r.adet })));

  console.log("\n═════════════════════════════════════════════════════════════");
  console.log("  ✅ TAMAMLANDI — Yeniden yüklemeye hazır");
  console.log("═════════════════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ HATA:", err);
  process.exit(1);
});
