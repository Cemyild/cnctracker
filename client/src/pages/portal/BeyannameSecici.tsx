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

  const secili = beyannameler.find((b) => b.id === value);

  // cmdk'nin dahili filtresi toLowerCase() tabanlidir ve Turkce I/I'yi bozar
  // ("ISTANBUL" -> noktali i, "istanbul" ile eslesmez). Bu yuzden Command'da
  // shouldFilter={false} ve filtreleme BURADA, toLocaleLowerCase("tr") ile yapilir.
  const eslesenler = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    if (!q) return beyannameler;
    return beyannameler.filter(
      (b) =>
        b.dosyaNo.toLocaleLowerCase("tr").includes(q) ||
        (b.alici ?? "").toLocaleLowerCase("tr").includes(q) ||
        (b.beyanNo ?? "").toLocaleLowerCase("tr").includes(q),
    );
  }, [beyannameler, arama]);

  const gosterilen = eslesenler.slice(0, LIMIT);
  const kirpildi = eslesenler.length > LIMIT;

  const acKapa = (o: boolean) => { setAcik(o); if (!o) setArama(""); };
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
            {secili ? `${secili.dosyaNo} — ${secili.alici ?? "?"}` : placeholder}
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
                    <div className="font-semibold">{b.dosyaNo}</div>
                    <div className="truncate text-xs text-muted-foreground">{b.alici ?? "?"}</div>
                    {b.beyanNo && <div className="truncate text-xs text-muted-foreground">{b.beyanNo}</div>}
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
