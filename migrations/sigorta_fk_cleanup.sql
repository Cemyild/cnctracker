-- Sigorta Muhasebe → Poliçeleri FK kısıtı eklemeden önce çalıştırılmalı.
-- eslesen_policy_id, silinmiş/yok poliçelere işaret eden orphan değerleri NULL'a çeker.
-- Bu olmadan `npm run db:push` FK ekleme adımında patlar.
--
-- Çalıştırma: psql $DATABASE_URL -f migrations/sigorta_fk_cleanup.sql
-- Sonra: npm run db:push

UPDATE sigorta_muhasebe_kayitlari m
   SET eslesen_policy_id = NULL,
       eslesti_mi = 0
 WHERE eslesen_policy_id IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM sigorta_policeleri p WHERE p.id = m.eslesen_policy_id
   );
