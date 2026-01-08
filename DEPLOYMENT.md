# Hetzner VPS Deployment Update Guide

Uygulamanızda yaptığınız değişiklikleri sunucuya aktarmak için aşağıdaki adımları izleyebilirsiniz.

## 1. Sunucuya Bağlanın
Terminal veya PowerShell üzerinden sunucunuza bağlanın:
```bash
ssh root@46.224.187.211
```

## 2. Proje Klasörüne Girin
```bash
cd ~/cnctracker
```

## 3. Kodları Çekin (Git Pull)
GitHub'daki son değişiklikleri sunucuya indirin:
```bash
git pull
```
*(Eğer şifre sorarsa GitHub Personal Access Token'ınızı kullanın veya önbellekte varsa sormayacaktır)*

## 4. Bağımlılıkları Yükleyin
Yeni paket eklemiş olabilirsiniz, garanti olması için çalıştırın:
```bash
npm install
```

## 5. Veritabanını Güncelleyin (Önemli)
Eğer veritabanı şemasında (tablolarda) değişiklik yaptıysanız:
```bash
npm run db:push
```

## 6. Uygulamayı Derleyin (Build)
Typescript kodlarını Javascript'e çevirmek için:
```bash
npm run build
```

## 7. Uygulamayı Yeniden Başlatın
Değişikliklerin aktif olması için PM2 servisini yeniden başlatın:
```bash
pm2 restart cnctracker
```

---

### Tek Satırlık Hızlı Komut
İsterseniz her seferinde tek tek yazmak yerine, sunucuya bağlandıktan sonra şu komutu yapıştırarak (veritabanı güncellemesi hariç) hepsini tek seferde yapabilirsiniz:

```bash
cd ~/cnctracker && git pull && npm install && npm run build && pm2 restart cnctracker
```
