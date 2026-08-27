// Türkiye ilçe listesi — adres metninden ilçe çıkarımını DOĞRULAMAK için.
//
// Neden liste gerekiyor: adreslerde ilçe hep il adının hemen öncesinde duruyor
// ("NİLÜFER/BURSA"), ama aynı konumda mahalle adı da olabiliyor
// ("YEŞİLKÖY İSTANBUL", "KOZYATAĞI İSTANBUL") ya da yazım hatası
// ("NLUFER", "OSMAGAZI"). Serbest çıkarım bunları ilçe sanıp yanlış veri yazar.
// Doğrulama İL BAZLIDIR: bir ilin ilçesi başka ilde kabul edilmez.
//
// Liste eksik kalırsa o kayıt boş geçer (kayıp), fazla olursa yanlış veri
// yazılır (hata). Bu yüzden şüpheli isimler bilerek DIŞARIDA bırakıldı.

// Anahtarlar ve değerler ASCII'ye katlanmış BÜYÜK harftir (bkz. ilceNormalize).
export const ILCELER: Record<string, string[]> = {
  BURSA: ["OSMANGAZI", "NILUFER", "YILDIRIM", "GEMLIK", "INEGOL", "MUSTAFAKEMALPASA",
    "KARACABEY", "MUDANYA", "ORHANGAZI", "GURSU", "KESTEL", "YENISEHIR", "IZNIK",
    "ORHANELI", "BUYUKORHAN", "HARMANCIK", "KELES"],
  ISTANBUL: ["ADALAR", "ARNAVUTKOY", "ATASEHIR", "AVCILAR", "BAGCILAR", "BAHCELIEVLER",
    "BAKIRKOY", "BASAKSEHIR", "BAYRAMPASA", "BESIKTAS", "BEYKOZ", "BEYLIKDUZU",
    "BEYOGLU", "BUYUKCEKMECE", "CATALCA", "CEKMEKOY", "ESENLER", "ESENYURT",
    "EYUPSULTAN", "EYUP", "FATIH", "GAZIOSMANPASA", "GUNGOREN", "KADIKOY",
    "KAGITHANE", "KARTAL", "KUCUKCEKMECE", "MALTEPE", "PENDIK", "SANCAKTEPE",
    "SARIYER", "SILIVRI", "SULTANBEYLI", "SULTANGAZI", "SILE", "SISLI", "TUZLA",
    "UMRANIYE", "USKUDAR", "ZEYTINBURNU"],
  ANKARA: ["ALTINDAG", "AKYURT", "AYAS", "BALA", "BEYPAZARI", "CAMLIDERE", "CANKAYA",
    "CUBUK", "ELMADAG", "ETIMESGUT", "EVREN", "GOLBASI", "GUDUL", "HAYMANA",
    "KAHRAMANKAZAN", "KALECIK", "KECIOREN", "KIZILCAHAMAM", "MAMAK", "NALLIHAN",
    "POLATLI", "PURSAKLAR", "SEREFLIKOCHISAR", "SINCAN", "YENIMAHALLE"],
  KOCAELI: ["BASISKELE", "CAYIROVA", "DARICA", "DERINCE", "DILOVASI", "GEBZE",
    "GOLCUK", "IZMIT", "KANDIRA", "KARAMURSEL", "KARTEPE", "KORFEZ"],
  IZMIR: ["ALIAGA", "BALCOVA", "BAYINDIR", "BAYRAKLI", "BERGAMA", "BEYDAG", "BORNOVA",
    "BUCA", "CESME", "CIGLI", "DIKILI", "FOCA", "GAZIEMIR", "GUZELBAHCE",
    "KARABAGLAR", "KARABURUN", "KARSIYAKA", "KEMALPASA", "KINIK", "KIRAZ", "KONAK",
    "MENDERES", "MENEMEN", "NARLIDERE", "ODEMIS", "SEFERIHISAR", "SELCUK", "TIRE",
    "TORBALI", "URLA"],
  KONYA: ["SELCUKLU", "MERAM", "KARATAY", "EREGLI", "AKSEHIR", "BEYSEHIR", "CUMRA",
    "ILGIN", "SEYDISEHIR", "KULU", "KARAPINAR", "CIHANBEYLI", "KADINHANI",
    "SARAYONU", "BOZKIR", "DOGANHISAR", "HUYUK", "AKOREN", "ALTINEKIN", "DERBENT",
    "DEREBUCAK", "EMIRGAZI", "GUNEYSINIR", "HADIM", "HALKAPINAR", "TASKENT",
    "TUZLUKCU", "YALIHUYUK", "YUNAK", "CELTIK"],
  BALIKESIR: ["ALTIEYLUL", "KARESI", "BANDIRMA", "EDREMIT", "GONEN", "BURHANIYE",
    "AYVALIK", "SUSURLUK", "DURSUNBEY", "BIGADIC", "SINDIRGI", "IVRINDI", "HAVRAN",
    "ERDEK", "MANYAS", "SAVASTEPE", "KEPSUT", "BALYA", "GOMEC", "MARMARA"],
  ESKISEHIR: ["ODUNPAZARI", "TEPEBASI", "ALPU", "BEYLIKOVA", "CIFTELER", "GUNYUZU",
    "HAN", "INONU", "MAHMUDIYE", "MIHALGAZI", "MIHALICCIK", "SARICAKAYA",
    "SEYITGAZI", "SIVRIHISAR"],
  TEKIRDAG: ["SULEYMANPASA", "CORLU", "CERKEZKOY", "ERGENE", "KAPAKLI", "MALKARA",
    "MARMARAEREGLISI", "MURATLI", "SARAY", "SARKOY", "HAYRABOLU"],
  DENIZLI: ["PAMUKKALE", "MERKEZEFENDI", "HONAZ", "ACIPAYAM", "TAVAS", "CIVRIL",
    "SARAYKOY", "BULDAN", "KALE", "CAL", "GUNEY", "BOZKURT", "CAMELI", "BABADAG",
    "BEKILLI", "BEYAGAC", "BAKLAN", "CARDAK", "SERINHISAR"],
  SAKARYA: ["ADAPAZARI", "SERDIVAN", "ERENLER", "ARIFIYE", "HENDEK", "AKYAZI",
    "KARASU", "GEYVE", "PAMUKOVA", "SAPANCA", "FERIZLI", "KAYNARCA", "KOCAALI",
    "SOGUTLU", "TARAKLI"],
  KAYSERI: ["MELIKGAZI", "KOCASINAN", "TALAS", "HACILAR", "INCESU", "DEVELI",
    "YAHYALI", "BUNYAN", "PINARBASI", "TOMARZA", "SARIOGLAN", "SARIZ", "AKKISLA",
    "FELAHIYE", "OZVATAN", "YESILHISAR"],
  ADANA: ["SEYHAN", "CUKUROVA", "YUREGIR", "SARICAM", "CEYHAN", "KOZAN", "IMAMOGLU",
    "KARAISALI", "KARATAS", "POZANTI", "SAIMBEYLI", "TUFANBEYLI", "YUMURTALIK",
    "ALADAG", "FEKE"],
  MANISA: ["SEHZADELER", "YUNUSEMRE", "AKHISAR", "TURGUTLU", "SALIHLI", "SOMA",
    "ALASEHIR", "SARUHANLI", "KULA", "DEMIRCI", "GORDES", "KIRKAGAC", "SARIGOL",
    "SELENDI", "AHMETLI", "GOLMARMARA", "KOPRUBASI"],
  GAZIANTEP: ["SEHITKAMIL", "SAHINBEY", "NIZIP", "ISLAHIYE", "NURDAGI", "OGUZELI",
    "ARABAN", "YAVUZELI", "KARKAMIS"],
  YALOVA: ["CIFTLIKKOY", "ALTINOVA", "CINARCIK", "TERMAL", "ARMUTLU", "MERKEZ"],
  ANTALYA: ["MURATPASA", "KEPEZ", "KONYAALTI", "DOSEMEALTI", "AKSU", "ALANYA",
    "MANAVGAT", "SERIK", "KUMLUCA", "KAS", "KEMER", "FINIKE", "GAZIPASA",
    "KORKUTELI", "DEMRE", "ELMALI", "GUNDOGMUS", "IBRADI", "AKSEKI"],
  SAMSUN: ["ILKADIM", "ATAKUM", "CANIK", "TEKKEKOY", "BAFRA", "CARSAMBA", "TERME",
    "VEZIRKOPRU", "HAVZA", "LADIK", "KAVAK", "ALACAM", "AYVACIK", "ASARCIK",
    "SALIPAZARI", "YAKAKENT", "19MAYIS"],
  MUGLA: ["BODRUM", "FETHIYE", "MARMARIS", "MILAS", "MENTESE", "ORTACA", "DATCA",
    "DALAMAN", "KOYCEGIZ", "ULA", "YATAGAN", "SEYDIKEMER", "KAVAKLIDERE"],
  NEVSEHIR: ["ACIGOL", "AVANOS", "DERINKUYU", "GULSEHIR", "HACIBEKTAS", "KOZAKLI",
    "URGUP", "MERKEZ"],
  VAN: ["TUSBA", "IPEKYOLU", "EDREMIT", "ERCIS", "MURADIYE", "OZALP", "GEVAS",
    "CALDIRAN", "BASKALE", "SARAY", "CATAK", "GURPINAR", "BAHCESARAY"],
  CANAKKALE: ["AYVACIK", "BAYRAMIC", "BIGA", "BOZCAADA", "CAN", "ECEABAT", "EZINE",
    "GELIBOLU", "GOKCEADA", "LAPSEKI", "YENICE", "MERKEZ"],
  USAK: ["BANAZ", "ESME", "KARAHALLI", "SIVASLI", "ULUBEY", "MERKEZ"],
  ERZURUM: ["YAKUTIYE", "PALANDOKEN", "AZIZIYE", "HORASAN", "OLTU", "PASINLER",
    "ISPIR", "TORTUM", "HINIS", "KARAYAZI", "NARMAN", "OLUR", "SENKAYA", "TEKMAN",
    "UZUNDERE", "CAT", "KOPRUKOY", "PAZARYOLU", "KARACOBAN"],
  HATAY: ["ANTAKYA", "DEFNE", "ISKENDERUN", "DORTYOL", "SAMANDAG", "KIRIKHAN",
    "REYHANLI", "ALTINOZU", "ARSUZ", "BELEN", "ERZIN", "HASSA", "KUMLU", "PAYAS",
    "YAYLADAGI"],
  ICEL: ["AKDENIZ", "YENISEHIR", "TOROSLAR", "MEZITLI", "TARSUS", "ERDEMLI",
    "SILIFKE", "ANAMUR", "MUT", "GULNAR", "BOZYAZI", "AYDINCIK", "CAMLIYAYLA"],
  "K.MARAS": ["ONIKISUBAT", "DULKADIROGLU", "ELBISTAN", "AFSIN", "ANDIRIN",
    "GOKSUN", "PAZARCIK", "TURKOGLU", "CAGLAYANCERIT", "EKINOZU", "NURHAK"],
  CORUM: ["MERKEZ", "SUNGURLU", "OSMANCIK", "ISKILIP", "ALACA", "BAYAT", "KARGI",
    "MECITOZU", "ORTAKOY", "UGURLUDAG", "DODURGA", "LACIN", "OGUZLAR", "BOGAZKALE"],
  TOKAT: ["MERKEZ", "ERBAA", "TURHAL", "NIKSAR", "ZILE", "RESADIYE", "ALMUS",
    "ARTOVA", "BASCIFTLIK", "PAZAR", "SULUSARAY", "YESILYURT"],
  AGRI: ["MERKEZ", "DOGUBAYAZIT", "PATNOS", "DIYADIN", "ELESKIRT", "HAMUR",
    "TASLICAY", "TUTAK"],
  GUMUSHANE: ["MERKEZ", "KELKIT", "SIRAN", "TORUL", "KURTUN", "KOSE"],
  BARTIN: ["MERKEZ", "AMASRA", "KURUCASILE", "ULUS"],
};

const TR_KATLA: Record<string, string> = {
  "İ": "I", "ı": "I", "Ş": "S", "ş": "S", "Ğ": "G", "ğ": "G",
  "Ü": "U", "ü": "U", "Ö": "O", "ö": "O", "Ç": "C", "ç": "C",
};

/** Türkçe harfleri ASCII'ye katlar, büyütür, harf/rakam dışını atar. */
export function ilceNormalize(s: unknown): string {
  return String(s ?? "")
    .replace(/[İıŞşĞğÜüÖöÇç]/g, (c) => TR_KATLA[c])
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// İl adı eşanlamlıları — kaynakta iki türlü de yazılıyor.
const IL_ESANLAM: Record<string, string> = { ISTANBUL: "ISTANBUL", ICEL: "ICEL", MERSIN: "ICEL" };

/**
 * Adres metninden ilçeyi çıkarır. İl adının hemen öncesindeki kelime aday
 * sayılır ve O İLİN ilçe listesinde varsa kabul edilir; yoksa null döner
 * (mahalle adı ya da yazım hatası olabilir, tahmin edilmez).
 *
 * Doğrulama ASCII'ye katlanmış hâlde yapılır ama dönen değer ADRESTEKİ ÖZGÜN
 * yazımdır — böylece kartta "NİLÜFER" görünür, "NILUFER" değil.
 */
export function adrestenIlce(adres: unknown, il: unknown): string | null {
  const ilAnahtar = IL_ESANLAM[ilceNormalize(il)] ?? ilceNormalize(il);
  const liste = ILCELER[ilAnahtar];
  if (!liste) return null;

  // Özgün kelimeler korunur; karşılaştırma katlanmış kopya üzerinden yapılır.
  const ozgun = String(adres ?? "").split(/[^0-9A-Za-zÇĞİıÖŞÜçğıöşü]+/).filter(Boolean);
  const katli = ozgun.map((k) => ilceNormalize(k));
  const ilKelimeleri = ilAnahtar.split(" ");

  // İl adı metnin sonlarında geçer; en sondan başlayarak aranır.
  for (let i = katli.length - 1; i >= ilKelimeleri.length; i--) {
    let uyar = true;
    for (let j = 0; j < ilKelimeleri.length; j++) {
      if (katli[i - ilKelimeleri.length + 1 + j] !== ilKelimeleri[j]) { uyar = false; break; }
    }
    if (!uyar) continue;
    const sira = i - ilKelimeleri.length;
    if (sira >= 0 && liste.includes(katli[sira])) return ozgun[sira].toLocaleUpperCase("tr");
    return null;
  }

  // İl adı adreste hiç geçmiyorsa: metinde o ilin bir ilçesi var mı?
  for (let i = 0; i < katli.length; i++) {
    if (liste.includes(katli[i])) return ozgun[i].toLocaleUpperCase("tr");
  }
  return null;
}
