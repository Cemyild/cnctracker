# Data Models - Backend

This document describes the database schema used in the application, implemented using Drizzle ORM and PostgreSQL (Neon).

## Schema Overview

The database consists of several tables managing users, customs data, transportation, employees, expenses, and insurance.

### Users (`users`)
Stores application users for authentication.
- `id`: UUID (Primary Key)
- `username`: Text (Unique)
- `password`: Text

### Customs Data (`gumruk_verileri`)
Main tracking table for customs operations.
- `id`: UUID (Primary Key)
- `ay`: Text (Month)
- `yil`: Integer (Year)
- `tip`: Text (Operation type: H, T, A, B, @)
- `dosyaNo`: Text
- `firmaUnvan`: Text (Customer name)
- `rejim`: Text
- `faturaNo`: Text
- `faturaTarihi`: Text
- `gumruk`: Text (Customs office)
- `tescilTarihi`: Text
- `tescilNo`: Text
- `faturayiKesen`: Text (Employee)
- `dovizKiymeti`: Text
- `doviz`: Text
- `girisElemani`: Text (Employee who entered data)
- `malBedeli`: Decimal (Base amount)
- `topIskonto`: Decimal
- `topKdvTutar`: Decimal
- `topFaturaTutar`: Decimal (Total including VAT)
- `rowHash`: Text (Unique hash per row to prevent duplicate uploads)

### Vehicles (`araclar`)
Tracks fleet vehicles and their insurance status.
- `id`: UUID (Primary Key)
- `plaka`: Text (Plate number, Unique)
- `trafikPoliceNo`: Text
- `trafikBitisTarihi`: Text
- `kaskoPoliceNo`: Text
- `kaskoBitisTarihi`: Text

### Transportation (`nakliye_verileri`)
Logistics and transportation billing data.
- `id`: UUID (Primary Key)
- `faturaNo`: Text
- `faturaTarihi`: Text
- `malHizmet`: Text
- `miktar`: Decimal
- `birimFiyat`: Decimal
- `kdvOrani`: Integer
- `kdvTutari`: Decimal
- `malHizmetToplamTutari`: Decimal
- `hesaplananKdv20`: Decimal
- `hesaplananKdvTevkifat20`: Decimal
- `vergilerDahilToplamTutar`: Decimal
- `odenecekTutar`: Decimal
- `olusturmaTarihi`: Date
- `musteri`: Text
- `konteynerler`: Text
- `rawJson`: Text (Storage for unstructured source data)

### Employees (`calisanlar`)
Payroll and employee management data.
- `id`: UUID (Primary Key)
- `tcNo`: Text (Turkish ID)
- `adSoyad`: Text
- `isGirisTarihi`: Text
- `brutUcret`: Decimal (Gross salary)
- `netUcret`: Decimal (Net salary)
- `sgkMatrahi`: Decimal
- `gelirVergisiMatrahi`: Decimal
- `kumulatifVergiMatrahi`: Decimal
- `gelirVergisi`: Decimal
- `damgaVergisi`: Decimal
- `sigortaKesintisi`: Decimal
- `issizlikSigortasiKesintisi`: Decimal
- `isverenSgkPayi`: Decimal
- `isverenIssizlikPayi`: Decimal
- `toplamIsverenMaliyeti`: Decimal (Total cost to employer)
- `sube`: Text (Branch/Department)
- `statu`: Text (NORMAL, EMEKLİ, YÖNETİCİ)
- `ay`: Text
- `yil`: Integer

### Expenses (`giderler`)
Operational expenses tracking.
- `id`: UUID (Primary Key)
- `tarih`: Text
- `firma`: Text
- `faturaNo`: Text
- `malBedeli`: Decimal
- `kdvTutari`: Decimal
- `toplamTutar`: Decimal
- `paraBirimi`: Text
- `kur`: Decimal
- `tryTutar`: Decimal
- `ay`: Text
- `yil`: Integer
- `olusturmaTarihi`: Date

### Insurance Policies (`sigorta_policeleri`)
Tracking for agency insurance business.
- `id`: UUID (Primary Key)
- `brans`: Text
- `policeNo`: Text (Primary Key component)
- `sigortali`: Text
- `tanzimTarihi`: Text
- `netPrim`: Decimal
- `brutPrim`: Decimal
- `komisyon`: Decimal
- `sigortaBedeli`: Decimal
- `dekontDurumu`: Text
- `sirket`: Text (Insurance company)
- `ay`: Text
- `yil`: Integer

### Insurance Accounting (`sigorta_muhasebe_kayitlari`)
Accounting records for verification against policies.
- `id`: UUID (Primary Key)
- `tarih`: Text
- `aciklama`: Text
- `belgeNo`: Text
- `borc`: Decimal
- `alacak`: Decimal
- `bakiye`: Decimal
- `eslestiMi`: Integer (Matching status)
- `eslesenPolicyId`: Text (Relation to policy)
- `sirket`: Text
- `ay`: Text
- `yil`: Integer
- `rowHash`: Text
