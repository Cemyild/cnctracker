import 'dotenv/config';
import fs from 'fs';
import { PDFParse } from 'pdf-parse';
import { storage } from './server/storage.js';
import { calculateGrossFromNet } from './server/payroll-engine.ts';

const pdfPath = 'e:/CEM APPS/cnctracker/CNC GÜMRÜK EYLÜL BORDRO.pdf';

const parseMoney = (s) => {
    if (!s) return 0;
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
};

async function importCalisanlar() {
    try {
        const dataBuffer = fs.readFileSync(pdfPath);
        const parser = new PDFParse({ data: dataBuffer });
        const textResult = await parser.getText();
        const text = textResult.text;

        const ay = "eylul";
        const yil = 2025;
        const pages = text.split(/-- \d+ of \d+ --/);
        const records = [];

        for (let page of pages) {
            let pageSube = "Bursa";
            if (page.includes("GEMLİK ŞUBESİ")) pageSube = "Gemlik";
            else if (page.includes("İSTANBUL ŞUBESİ")) pageSube = "İstanbul - Erenköy";

            const recordStartRegex = /(\d{2}\.\d{2}\.\d{4})\s+\d+\s+\d+\s+([\d.,]+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+([A-ZÇĞİÖŞÜ ]+)/g;
            let match;
            const pageMatches = [];
            while ((match = recordStartRegex.exec(page)) !== null) {
                pageMatches.push({
                    index: match.index,
                    isGirisTarihi: match[1],
                    adSoyad: match[3].trim()
                });
            }

            for (let i = 0; i < pageMatches.length; i++) {
                const currentMatch = pageMatches[i];
                const nextIndex = pageMatches[i + 1] ? pageMatches[i + 1].index : page.length;
                let block = page.substring(currentMatch.index, nextIndex);

                // Cleanup block text
                ["TOPLAM", "Firma Ünvanı", "İmza", "Sıra No"].forEach(w => {
                    const idx = block.indexOf(w);
                    if (idx !== -1) block = block.substring(0, idx);
                });

                const tcMatch = block.match(/\d{11}/);
                const tcNo = tcMatch ? tcMatch[0] : "";
                const amounts = block.match(/[\d.]+,\d{2}/g) || [];

                if (amounts.length >= 7) {
                    // Extract CRITICAL inputs for Reverse Calc
                    // 1. Net Salary (Target)
                    // Usually near the end, index 14 or length-3 in previous logic. 
                    // Let's use robust detection: "Net Ödenen" is usually the 2nd to last or specific index.
                    // Based on previous views: amounts[amounts.length - 3] was reliable for Net.
                    const targetNet = parseMoney(amounts[amounts.length - 3]);

                    // 2. Cumulative Tax Base (Previous Grid)
                    // amounts[6] was "Devreden GV Matrahı"
                    const kumulatifOcakAug = parseMoney(amounts[6]);

                    // 3. Status
                    let statu = "NORMAL";
                    const empSsk = amounts[10] ? parseMoney(amounts[10]) : 0;
                    const empUnemp = amounts[11] ? parseMoney(amounts[11]) : 0;

                    if (empSsk === 0 && empUnemp === 0) {
                        statu = "YÖNETİM";
                    } else if (block.includes("05510")) {
                        statu = "NORMAL";
                    } else if (block.includes("00000") || block.includes("SGDP") || empUnemp === 0) {
                        statu = "EMEKLİ";
                    }

                    // Manual Override for Neslihan Karadağ
                    if (currentMatch.adSoyad.toLocaleUpperCase('tr-TR').includes("NESLİHAN KARADAĞ")) {
                        statu = "NORMAL";
                        pageSube = "Bursa";
                    }

                    // EXECUTE REAR ENGINE
                    const result = calculateGrossFromNet(targetNet, kumulatifOcakAug, statu);

                    records.push({
                        tcNo,
                        adSoyad: currentMatch.adSoyad,
                        isGirisTarihi: currentMatch.isGirisTarihi,
                        sube: statu === "YÖNETİM" ? "Yönetim" : pageSube,
                        ay,
                        yil,
                        statu,
                        // Mapped Fields
                        brutUcret: result.gross.toFixed(2),
                        netUcret: targetNet.toFixed(2), // Source of Truth
                        sgkMatrahi: result.sgkMatrah.toFixed(2),
                        gelirVergisiMatrahi: result.gvm.toFixed(2),
                        kumulatifVergiMatrahi: (kumulatifOcakAug + result.gvm).toFixed(2),
                        gelirVergisi: result.odenecekGV.toFixed(2),
                        damgaVergisi: result.odenecekDV.toFixed(2),
                        sigortaKesintisi: result.sgkIsci.toFixed(2),
                        issizlikSigortasiKesintisi: result.issizlikIsci.toFixed(2),
                        isverenSgkPayi: (result.isverenSgk - result.tesvik5510).toFixed(2),
                        isverenIssizlikPayi: result.isverenIssizlik.toFixed(2),
                        toplamIsverenMaliyeti: result.toplamIsveren.toFixed(2)
                    });
                }
            }
        }

        console.log(`Calculated ${records.length} records.`);
        if (records.length > 0) {
            await storage.insertCalisanlar(records);
            const totalCost = records.reduce((acc, r) => acc + parseFloat(r.toplamIsverenMaliyeti), 0);
            console.log('Total Employer Cost (Calculated):', totalCost.toFixed(2));
        }

    } catch (error) {
        console.error('Import Error:', error);
    }
}

importCalisanlar();
