
import { db } from './server/db.ts';
import { calisanlar } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import { calculateGrossFromNet } from './server/payroll-engine.ts';

const userTruth = {
    "calisanlar": [
        { "sube": "Bursa Merkez", "ad_soyad": "Onur Karadağ", "statu": "Normal", "brut_maas": 105858.41, "net_maas": 69500.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Özkan Ersevinç", "statu": "Normal", "brut_maas": 98516.39, "net_maas": 65000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Hasan Süleyman Demirci", "statu": "Normal", "brut_maas": 81385.01, "net_maas": 54500.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Levent Can", "statu": "Emekli", "brut_maas": 69094.58, "net_maas": 50750.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Şafak Üner", "statu": "Normal", "brut_maas": 31798.59, "net_maas": 26000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Hasan Burhan", "statu": "Emekli", "brut_maas": 61231.29, "net_maas": 45500.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Ayşe Baykan", "statu": "Emekli", "brut_maas": 60482.41, "net_maas": 45000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Gülbin Arslan", "statu": "Emekli", "brut_maas": 97926.62, "net_maas": 70000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Şebnem Eren", "statu": "Normal", "brut_maas": 74042.98, "net_maas": 50000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Sultan Kılıçarslan", "statu": "Normal", "brut_maas": 81385.01, "net_maas": 54500.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Süleyman Uncu", "statu": "Emekli", "brut_maas": 145106.32, "net_maas": 101500.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Elif Yükselşar", "statu": "Normal", "brut_maas": 38833.91, "net_maas": 28420.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Gönül Vatansever", "statu": "Normal", "brut_maas": 31483.30, "net_maas": 25788.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Emirhan Özdemir", "statu": "Normal", "brut_maas": 82200.79, "net_maas": 55000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Ahmet Gencer", "statu": "Emekli", "brut_maas": 119045.15, "net_maas": 63075.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Özgür Balsak", "statu": "Emekli", "brut_maas": 119045.15, "net_maas": 84100.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Vural Yeniay", "statu": "Emekli", "brut_maas": 61231.29, "net_maas": 45500.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Halil İbrahim Karakoç", "statu": "Normal", "brut_maas": 72411.42, "net_maas": 49000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Büşra Karakoç", "statu": "Normal", "brut_maas": 57727.37, "net_maas": 40000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Alperen Osmanoğlu", "statu": "Normal", "brut_maas": 40573.00, "net_maas": 31900.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Mustafa Eryılmaz", "statu": "Emekli", "brut_maas": 97926.62, "net_maas": 70000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Emircan Alkan", "statu": "Normal", "brut_maas": 81385.01, "net_maas": 54500.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Cihangir Özden", "statu": "Normal", "brut_maas": 65885.18, "net_maas": 45000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Emin Pehlivan", "statu": "Normal", "brut_maas": 81385.01, "net_maas": 54500.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Kaan Akşar", "statu": "Emekli", "brut_maas": 120393.13, "net_maas": 85000.00 },
        { "sube": "Bursa Merkez", "ad_soyad": "Asiye Uncu", "statu": "Emekli", "brut_maas": 59701.18, "net_maas": 50000.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Bayram Mehmet Aksoy", "statu": "Emekli", "brut_maas": 60107.97, "net_maas": 44750.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Avni Temel", "statu": "Normal", "brut_maas": 72411.42, "net_maas": 49000.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Zeynep Yıldırım", "statu": "Normal", "brut_maas": 77306.10, "net_maas": 49681.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Adem Aydın", "statu": "Normal", "brut_maas": 73635.09, "net_maas": 49750.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Ramazan Ülker", "statu": "Normal", "brut_maas": 77306.10, "net_maas": 49681.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Bahadır Fırtına", "statu": "Normal", "brut_maas": 73635.09, "net_maas": 49750.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Neslihan Karadağ", "statu": "Normal", "brut_maas": 0.00, "net_maas": 0.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Taner Atak", "statu": "Normal", "brut_maas": 64416.78, "net_maas": 44100.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Mehmet Murat Özkurt", "statu": "Emekli", "brut_maas": 69843.46, "net_maas": 51250.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Rezan Ülker", "statu": "Normal", "brut_maas": 73635.09, "net_maas": 49750.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Dursun Kaldırım", "statu": "Normal", "brut_maas": 93213.82, "net_maas": 61750.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Yılmaz Kudalak", "statu": "Emekli", "brut_maas": 75460.10, "net_maas": 55000.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Cem Bilem", "statu": "Normal", "brut_maas": 41465.30, "net_maas": 32500.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Umut Ali Güler", "statu": "Normal", "brut_maas": 26005.50, "net_maas": 22104.67 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Uğur Dolgun", "statu": "Normal", "brut_maas": 80569.23, "net_maas": 54000.00 },
        { "sube": "İstanbul Şubesi", "ad_soyad": "Mücahit Öztürk", "statu": "Normal", "brut_maas": 44043.20, "net_maas": 33679.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Ercan Kaan Eren", "statu": "Normal", "brut_maas": 100147.95, "net_maas": 66000.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Harun Sunduk", "statu": "Normal", "brut_maas": 87095.46, "net_maas": 58000.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Orhan Arslan", "statu": "Normal", "brut_maas": 64661.51, "net_maas": 44250.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Alperen Yıldız", "statu": "Normal", "brut_maas": 63437.84, "net_maas": 43500.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Emre Marmara", "statu": "Normal", "brut_maas": 58706.31, "net_maas": 40600.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Ali Can", "statu": "Normal", "brut_maas": 56095.82, "net_maas": 39000.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Merve Kutlu", "statu": "Normal", "brut_maas": 51653.67, "net_maas": 37000.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Ömer Faruk Çakır", "statu": "Normal", "brut_maas": 65885.18, "net_maas": 45000.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Özlem Turan", "statu": "Normal", "brut_maas": 31947.30, "net_maas": 26100.00 },
        { "sube": "Gemlik Şubesi", "ad_soyad": "Yusuf Şaş", "statu": "Normal", "brut_maas": 79998.17, "net_maas": 53650.00 },
        { "sube": "Yönetim", "ad_soyad": "Neşe Yıldırım", "statu": "Yönetim", "brut_maas": 698640.61, "net_maas": 418500.00 },
        { "sube": "Yönetim", "ad_soyad": "Cengiz Üner", "statu": "Yönetim", "brut_maas": 455132.52, "net_maas": 297000.00 },
        { "sube": "Yönetim", "ad_soyad": "Coşkun Yıldırım", "statu": "Yönetim", "brut_maas": 455132.52, "net_maas": 297000.00 },
        { "sube": "Yönetim", "ad_soyad": "Özcan Eren", "statu": "Yönetim", "brut_maas": 257439.46, "net_maas": 170000.00 },
        { "sube": "Yönetim", "ad_soyad": "Özgür Köse", "statu": "Yönetim", "brut_maas": 179607.55, "net_maas": 120000.00 },
        { "sube": "Yönetim", "ad_soyad": "Cem Yıldırım", "statu": "Yönetim", "brut_maas": 802453.84, "net_maas": 480000.00 },
        { "sube": "Yönetim", "ad_soyad": "Enis Üner", "statu": "Yönetim", "brut_maas": 802453.84, "net_maas": 480000.00 }
    ]
};

async function fixDataNetDriven() {
    console.log("Starting NET-DRIVEN recalculation...");
    const currentRecords = await db.select().from(calisanlar);
    let updates = 0;

    for (const truth of userTruth.calisanlar) {
        // Find match (case insensitive)
        const match = currentRecords.find(r =>
            r.adSoyad.toLocaleLowerCase('tr-TR') === truth.ad_soyad.toLocaleLowerCase('tr-TR')
        );

        if (match) {
            // Target Net is the SOURCE OF TRUTH explicitly
            const targetNet = truth.net_maas;
            if (targetNet === 0) continue; // Skip Neslihan Karadağ if 0

            // Estimate Previous Cumulative Base from DB
            // (Current Cumulative - Current GVM) is safest approximation of "Before this month"
            const currentKumulatif = parseFloat(match.kumulatifVergiMatrahi || "0");
            const currentGVM = parseFloat(match.gelirVergisiMatrahi || "0");
            const prevBase = Math.max(0, currentKumulatif - currentGVM);

            // Correct Status from User Truth
            const truthStatu = truth.statu.toLocaleUpperCase('tr-TR');

            // REVERSE CALCULATE
            const result = calculateGrossFromNet(targetNet, prevBase, truthStatu);

            // Update Database
            await db.update(calisanlar)
                .set({
                    brutUcret: result.gross.toFixed(2), // Derived
                    netUcret: targetNet.toFixed(2),     // Fixed
                    statu: truthStatu,
                    sube: truth.sube === "Bursa Merkez" ? "Bursa" :
                        truth.sube === "İstanbul Şubesi" ? "İstanbul - Erenköy" :
                            truth.sube === "Gemlik Şubesi" ? "Gemlik" : "Yönetim",

                    sgkMatrahi: result.sgkMatrah.toFixed(2),
                    gelirVergisiMatrahi: result.gvm.toFixed(2),
                    kumulatifVergiMatrahi: (prevBase + result.gvm).toFixed(2),
                    gelirVergisi: result.odenecekGV.toFixed(2),
                    damgaVergisi: result.odenecekDV.toFixed(2),
                    sigortaKesintisi: result.sgkIsci.toFixed(2),
                    issizlikSigortasiKesintisi: result.issizlikIsci.toFixed(2),
                    isverenSgkPayi: (result.isverenSgk - result.tesvik5510).toFixed(2),
                    isverenIssizlikPayi: result.isverenIssizlik.toFixed(2),
                    toplamIsverenMaliyeti: result.toplamIsveren.toFixed(2)
                })
                .where(eq(calisanlar.id, match.id));

            updates++;
        }
    }

    console.log(`Recalculated (Reverse) for ${updates} employees.`);
    process.exit(0);
}

fixDataNetDriven();
