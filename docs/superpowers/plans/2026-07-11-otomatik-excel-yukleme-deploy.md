# Otomatik Excel Yükleme — Deploy & Power Automate Kurulumu

## VPS ön koşulları (push ÖNCESİ)
1. VPS'e SSH: `ssh root@167.235.252.49`
2. `.env`'e `INGEST_TOKEN=<uzun-rastgele>` ekle (yedek: `.env.yedek-YYYYMMDD`).
   Değer üret: `openssl rand -hex 24`
3. Token'ı bir yere kaydet (Power Automate'e aynısı girilecek).

## Deploy (push = deploy)
1. Lokal `main`'de Task 1-4 commit'leri hazır.
2. `git push` → GitHub Actions: db:push → build → pm2 restart.
3. Deploy sonrası canlı DB'de tabloyu doğrula (yeşil ≠ migration):
   `psql $DATABASE_URL -c "\d otomatik_yukleme_log"`
4. Canlı smoke test (gerçek küçük dosya):
   `Invoke-RestMethod -Uri "https://cncgumruk.space/api/ingest/mizan" -Method Post -InFile mizan.xlsx -ContentType application/octet-stream -Headers @{ "X-Ingest-Token"="<token>"; "X-Dosya-Adi"="mizan.xlsx" }`
   → `{ durum: "basarili" }`. Token'sız → 401; (env varsa) → 200/atlandi.

## Power Automate Desktop akışı (her tür için bir akış)
1. **Tetikleyici:** "Dosya oluşturuldu" — izlenen klasör (ör. `C:\Otomasyon\Mizan\`).
2. **Wait:** dosya kilidi açılana kadar kısa bekleme.
3. **Run PowerShell script:**
   ```powershell
   $token = "<INGEST_TOKEN>"
   $file  = "%FileToProcess%"
   $name  = [System.IO.Path]::GetFileName($file)
   Invoke-RestMethod -Uri "https://cncgumruk.space/api/ingest/mizan" `
     -Method Post -InFile $file -ContentType "application/octet-stream" `
     -Headers @{ "X-Ingest-Token" = $token; "X-Dosya-Adi" = $name }
   ```
   (Beyanname akışında URL `.../api/ingest/beyanname` ve klasör `C:\Otomasyon\Beyanname\`.)
4. **Başarı sonrası:** dosyayı `İşlenenler\` alt klasörüne taşı (yeniden tetiklemeyi önle).
5. **Doğrulama:** klasöre bir dosya bırak → `/tahsilat` veya `/odemeler`'de "Son otomatik yükleme" rozetinin güncellendiğini gör.

## Sorun giderme
- 503 → VPS `.env`'de INGEST_TOKEN yok/yanlış yüklenmiş (pm2 restart gerekebilir).
- 401 → Power Automate'teki token ile VPS token'ı uyuşmuyor.
- 400 → dosya formatı beklenenden farklı; rozet listesinde "hata" satırı + mesaj görünür.
