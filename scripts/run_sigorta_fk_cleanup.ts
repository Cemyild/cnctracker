// migrations/sigorta_fk_cleanup.sql içindeki orphan temizliğini production DB'de çalıştırır.
// Önce kaç orphan olduğunu sayar, sonra UPDATE'i uygular, sonra yine sayar.
// FK constraint'i db:push ile eklenmeden önce mutlaka çalıştırılmalı.

import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("═════════════════════════════════════════════════════════════");
  console.log("  SİGORTA MUHASEBE — Orphan eslesen_policy_id Cleanup");
  console.log("═════════════════════════════════════════════════════════════\n");

  // 1) Önce orphan say
  const onceki = await db.execute(sql`
    SELECT COUNT(*) AS cnt
      FROM sigorta_muhasebe_kayitlari m
     WHERE m.eslesen_policy_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM sigorta_policeleri p WHERE p.id = m.eslesen_policy_id
       )
  `);
  const orphanSayisi = Number((onceki.rows[0] as { cnt: string | number }).cnt);
  console.log(`[1/3] Mevcut orphan sayısı: ${orphanSayisi}`);

  if (orphanSayisi === 0) {
    console.log("\n  ✓ Hiç orphan yok — FK constraint güvenli şekilde eklenebilir.");
    console.log("\n═════════════════════════════════════════════════════════════");
    console.log("  ✅ TAMAMLANDI (no-op) — db:push yapılabilir");
    console.log("═════════════════════════════════════════════════════════════\n");
    process.exit(0);
  }

  // 2) UPDATE
  console.log("\n[2/3] Orphan referansları NULL'a çekiliyor + eslesti_mi=0...");
  await db.execute(sql`
    UPDATE sigorta_muhasebe_kayitlari m
       SET eslesen_policy_id = NULL,
           eslesti_mi = 0
     WHERE m.eslesen_policy_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM sigorta_policeleri p WHERE p.id = m.eslesen_policy_id
       )
  `);
  console.log(`  ✓ ${orphanSayisi} satır güncellendi`);

  // 3) Doğrulama
  console.log("\n[3/3] Doğrulama sayımı...");
  const sonra = await db.execute(sql`
    SELECT COUNT(*) AS cnt
      FROM sigorta_muhasebe_kayitlari m
     WHERE m.eslesen_policy_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM sigorta_policeleri p WHERE p.id = m.eslesen_policy_id
       )
  `);
  const kalanOrphan = Number((sonra.rows[0] as { cnt: string | number }).cnt);
  console.log(`  Kalan orphan: ${kalanOrphan}`);

  if (kalanOrphan === 0) {
    console.log("\n═════════════════════════════════════════════════════════════");
    console.log("  ✅ TAMAMLANDI — db:push yapılabilir");
    console.log("═════════════════════════════════════════════════════════════\n");
    process.exit(0);
  } else {
    console.error("\n❌ Beklenmeyen: cleanup sonrası orphan kaldı, push'lamadan önce araştır.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ HATA:", err);
  process.exit(1);
});
