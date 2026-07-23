import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import type { Beyanname } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const LIMIT = 100;
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

  const acKapa = (o: boolean) => { setAcik(o); if (!o) { setArama(""); setRejimFiltre("hepsi"); } };
  const sec = (id: string) => { onChange(id); setArama(""); setAcik(false); };

  return (
    <Popover open={acik} onOpenChange={acKapa}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={acik}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !secili && "text-muted-foreground", className)}
          data-testid={testId}
        >
          <span className="truncate">
            {secili ? `${kimlik(secili)} — ${secili.alici ?? "?"}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        {/* shouldFilter={false}: filtre yukarida, Turkce-dogru sekilde yapiliyor */}
        <Command shouldFilter={false}>
          <CommandInput
            value={arama}
            onValueChange={setArama}
            placeholder={placeholder}
            data-testid={`${testId}-arama`}
          />
          <div className="flex gap-1 border-b p-1.5">
            {REJIMLER.map((r) => (
              <button
                key={r.kod}
                type="button"
                onClick={() => setRejimFiltre(r.kod)}
                className={cn(
                  "flex-1 rounded px-2 py-1 text-xs transition-colors",
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
          <CommandList>
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
