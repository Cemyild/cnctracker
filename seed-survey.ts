import { config } from "dotenv";
config();
import { db } from "./server/db";
import { surveys } from "./shared/schema";
import { eq } from "drizzle-orm";

async function seed() {
  const existing = await db.select().from(surveys).where(eq(surveys.title, "Müşteri Memnuniyet Anketi"));
  
  if (existing.length === 0) {
    const defaultSurvey = {
      title: "Müşteri Memnuniyet Anketi",
      description: "Değerli Müşterimiz,\n\nSizlere daha iyi hizmet sunabilmek ve süreçlerimizi mükemmelleştirmek adına görüşleriniz bizim için çok kıymetlidir. Lütfen aşağıdaki soruları bizimle olan deneyiminize göre 1 ile 5 arasında puanlayınız.",
      questions: [
        { id: "q1", text: "CNC Gümrük Müşavirliği'nin sunduğu gümrükleme hizmetlerinin genel hızından ne kadar memnunsunuz?", type: "rating" },
        { id: "q2", text: "Operasyon ekibimizin ulaşılabilirliği ve iletişim kolaylığı nasıldı?", type: "rating" },
        { id: "q3", text: "Sunduğumuz hizmetlerdeki şeffaflık (maliyet, süreç bilgilendirmesi) beklentilerinizi karşıladı mı?", type: "rating" },
        { id: "q4", text: "Karşılaştığınız bir sorun olduğunda çözüm üretme potansiyelimizi nasıl değerlendirirsiniz?", type: "rating" },
        { id: "q5", text: "Firmamızı başka iş ortaklarına tavsiye etme olasılığınız nedir?", type: "rating" }
      ],
      isActive: 1,
    };
    
    await db.insert(surveys).values(defaultSurvey);
    console.log("Müşteri Memnuniyet Anketi başarıyla oluşturuldu.");
  } else {
    console.log("Anket zaten mevcut.");
  }
}

seed().catch(console.error).finally(() => process.exit(0));
