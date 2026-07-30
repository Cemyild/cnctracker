import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import type { Beyanname } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";

// Tam ekran listede daha fazlası rahatça görünür (eski dar popover'da 100'dü).
const LIMIT = 250;
const VARSAYILAN_PLACEHOLDER =
  "Aramak için Ref, Alıcı yada Beyanname No yazın, yada açılır listeden seçin";

type Props = {
  beyannameler: Beyanname[];
  value: string;                 // seçili beyanname id; "" = seçim yok
  onChange: (id: string) => void;
  disabled?: boolean;
  testId: string;
  placeholder?: string;
  className?: string;
};

export default function BeyannameSecici({
  beyannameler, value, onChange, disabled, testId,
  placeholder = VARSAYILAN_PLACEHOLDER, className,
}: Props) {
  const [acik, setAcik] = useState(false);
  const [arama, setArama] = useState("");
  const [rejimFiltre, setRejimFiltre] = useState<"hepsi" | "IM" | "EX" | "TR">("hepsi");

  // Serit: ic kod -> etiket. Sira sabit.
  const REJIMLER: { kod: "hepsi" | "IM" | "EX" | "TR"; etiket: string }[] = [
    { kod: "hepsi", etiket: "Hepsi" },
    { kod: "IM", etiket: "İthalat" },
    { kod: "EX", etiket: "İhracat" },
    { kod: "TR", etiket: "Transit" },
  ];
  // Satir etiketi: rejim kodu -> kisa rozet.
  const REJIM_ETIKET: Record<string, string> = { IM: "İTH", EX: "İHR", TR: "TR" };

  // Transit inline ekleme formu durumu.
  const [transitForm, setTransitForm] = useState(false);
  const [tBeyanNo, setTBeyanNo] = useState("");
  const [tAlici, setTAlici] = useState("");
  const [tGumruk, setTGumruk] = useState("");
  const [tGonderiliyor, setTGonderiliyor] = useState(false);

  const transitFormSifirla = () => {
    setTransitForm(false); setTBeyanNo(""); setTAlici(""); setTGumruk(""); setTGonderiliyor(false);
  };

  const transitEkle = async () => {
    const beyanNo = tBeyanNo.trim(), alici = tAlici.trim();
    if (!beyanNo || !alici || tGonderiliyor) return;
    setTGonderiliyor(true);
    try {
      const res = await fetch("/api/portal/transit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beyanNo, alici, gumrukIdaresi: tGumruk.trim() || null }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).error || "Eklenemedi");
      const yeni = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/portal/beyannameler"] });
      onChange(yeni.id);
      transitFormSifirla();
      acKapa(false);
    } catch {
      setTGonderiliyor(false); // form korunur, kullanici tekrar deneyebilir
    }
  };

  const secili = beyannameler.find((b) => b.id === value);
  // dosyaNo transitte null olabilir -> beyanNo'ya duser.
  const kimlik = (b: Beyanname) => b.dosyaNo ?? b.beyanNo ?? "?";

  // cmdk'nin dahili filtresi toLowerCase() tabanlidir ve Turkce I/I'yi bozar
  // ("ISTANBUL" -> noktali i, "istanbul" ile eslesmez). Bu yuzden Command'da
  // shouldFilter={false} ve filtreleme BURADA, toLocaleLowerCase("tr") ile yapilir.
  const eslesenler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    return beyannameler.filter((b) => {
      // Rejim EK filtre — basit esitlik, locale sorunu yok. null savunmasi: varsayilan IM.
      if (rejimFiltre !== "hepsi" && (b.rejim ?? "IM") !== rejimFiltre) return false;
      if (!q) return true;
      return (
        (b.dosyaNo ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q)
      );
    });
  }, [beyannameler, arama, rejimFiltre]);

  const gosterilen = eslesenler.slice(0, LIMIT);
  const kirpildi = eslesenler.length > LIMIT;

  const acKapa = (o: boolean) => {
    setAcik(o);
    if (!o) { setArama(""); setRejimFiltre("hepsi"); setTransitForm(false); setTBeyanNo(""); setTAlici(""); setTGumruk(""); }
  };
  const sec = (id: string) => { onChange(id); setArama(""); setAcik(false); };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={acik}
        disabled={disabled}
        onClick={() => acKapa(true)}
        className={cn("w-full justify-between font-normal", !secili && "text-muted-foreground", className)}
        data-testid={testId}
      >
        <span className="truncate">
          {secili ? `${kimlik(secili)} — ${secili.alici ?? "?"}` : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {/* POPOVER DEĞİL DIALOG. İki sebep:
          (1) Popover genişliği trigger'a kilitliydi (--radix-popover-trigger-width); ortadaki
              dar modalın içinde liste okunmuyordu. Dialog tam ekrana yakın açılır.
          (2) Radix modal Dialog, react-remove-scroll ile Dialog içeriğinin DIŞINDA kalan her
              yerde tekerlek olayını bloklar. Popover kendi portalıyla body'ye çıktığı için
              "dışarısı" sayılıyor ve listede fare tekerleği çalışmıyordu (scrollbar sürüklemek
              ya da ok tuşları çalışıyordu). En üstteki Dialog scroll kilidinin sahibidir. */}
      <Dialog open={acik} onOpenChange={acKapa}>
        <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-5 py-3.5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-muted-foreground" />
              Beyanname Seç
            </DialogTitle>
          </DialogHeader>
          {/* shouldFilter={false}: filtre yukarida, Turkce-dogru sekilde yapiliyor */}
          <Command shouldFilter={false} className="flex min-h-0 flex-1 flex-col">
            <CommandInput
              value={arama}
              onValueChange={setArama}
              placeholder={placeholder}
              data-testid={`${testId}-arama`}
            />
            <div className="flex shrink-0 gap-1 border-b p-1.5">
              {REJIMLER.map((r) => (
                <button
                  key={r.kod}
                  type="button"
                  onClick={() => setRejimFiltre(r.kod)}
                  className={cn(
                    "flex-1 rounded px-2 py-1.5 text-xs transition-colors",
                    rejimFiltre === r.kod
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                  data-testid={`${testId}-rejim-${r.kod}`}
                >
                  {r.etiket}
                </button>
              ))}
            </div>
            {!transitForm && (
              <div className="shrink-0 border-b px-3 py-1.5 text-[11px] text-muted-foreground" data-testid={`${testId}-sayac`}>
                {eslesenler.length} beyanname{kirpildi ? ` · ilk ${LIMIT} listeleniyor` : ""}
              </div>
            )}
            {/* max-h-none: shadcn CommandList varsayılanı 300px; burada yüksekliği Dialog verir. */}
            <CommandList className="max-h-none min-h-0 flex-1">
            {transitForm ? (
              <div className="space-y-2 p-2" data-testid={`${testId}-transit-form`}>
                <div className="text-xs font-medium text-muted-foreground">Yeni Transit</div>
                <Input placeholder="Beyanname no" value={tBeyanNo} onChange={(e) => setTBeyanNo(e.target.value)} data-testid={`${testId}-transit-beyanno`} />
                <Input placeholder="Firma" value={tAlici} onChange={(e) => setTAlici(e.target.value)} data-testid={`${testId}-transit-firma`} />
                <Input placeholder="Gümrük (opsiyonel)" value={tGumruk} onChange={(e) => setTGumruk(e.target.value)} data-testid={`${testId}-transit-gumruk`} />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={transitEkle} disabled={!tBeyanNo.trim() || !tAlici.trim() || tGonderiliyor} data-testid={`${testId}-transit-ekle`}>
                    {tGonderiliyor ? "Ekleniyor…" : "Ekle"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={transitFormSifirla} data-testid={`${testId}-transit-vazgec`}>Vazgeç</Button>
                </div>
              </div>
            ) : (
              <>
                {gosterilen.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground" data-testid={`${testId}-bos`}>
                    Beyanname bulunamadı
                  </div>
                ) : (
                  gosterilen.map((b) => (
                    <CommandItem
                      key={b.id}
                      value={b.id}
                      onSelect={() => sec(b.id)}
                      data-testid={`${testId}-item-${b.id}`}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", b.id === value ? "opacity-100" : "opacity-0")} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{kimlik(b)}</span>
                          {REJIM_ETIKET[b.rejim ?? "IM"] && (
                            <span className="shrink-0 rounded border px-1 text-[10px] leading-tight text-muted-foreground">
                              {REJIM_ETIKET[b.rejim ?? "IM"]}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{b.alici ?? "?"}</div>
                        {b.dosyaNo && b.beyanNo && <div className="truncate text-xs text-muted-foreground">{b.beyanNo}</div>}
                      </div>
                    </CommandItem>
                  ))
                )}
                {kirpildi && (
                  <div className="border-t px-3 py-2 text-xs text-muted-foreground" data-testid={`${testId}-limit`}>
                    İlk {LIMIT} gösteriliyor — aramayı daraltın
                  </div>
                )}
                {rejimFiltre === "TR" && (
                  <button
                    type="button"
                    onClick={() => setTransitForm(true)}
                    className="w-full border-t px-3 py-2 text-left text-sm text-primary hover:bg-muted"
                    data-testid={`${testId}-transit-ac`}
                  >
                    ➕ Yeni transit ekle
                  </button>
                )}
              </>
            )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
