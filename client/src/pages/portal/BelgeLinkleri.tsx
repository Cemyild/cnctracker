import { type TalepDetay, BELGE_ETIKET, belgeUrl } from "./portalUtils";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function BelgeLinkleri({ talep, kompakt }: { talep: TalepDetay; kompakt?: boolean }) {
  if (!talep.belgeler.length) return <span className="text-xs text-muted-foreground">—</span>;

  // Kompakt (tablo): tek buton — tıklayınca tüm belgeleri sırayla indir.
  if (kompakt) {
    const hepsiniIndir = () => {
      talep.belgeler.forEach((b, i) => {
        // Ardışık tetikle ki tarayıcı çoklu indirmeyi engellemesin (aynı origin /uploads → download çalışır).
        setTimeout(() => {
          const a = document.createElement("a");
          a.href = belgeUrl(b);
          a.download = b.filename;
          a.target = "_blank";
          a.rel = "noreferrer";
          document.body.appendChild(a);
          a.click();
          a.remove();
        }, i * 250);
      });
    };
    return (
      <Button variant="outline" size="sm" className="h-8 gap-1.5 whitespace-nowrap" onClick={hepsiniIndir} data-testid={`button-belgeler-${talep.id}`}>
        <Download className="h-3.5 w-3.5" /> Belgeler ({talep.belgeler.length})
      </Button>
    );
  }

  // Varsayılan (dialog vb.): dikey link listesi.
  return (
    <div className="flex flex-col gap-0.5">
      {talep.belgeler.map((b) => (
        <a
          key={b.id}
          href={belgeUrl(b)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-primary underline"
        >
          {BELGE_ETIKET[b.belgeTipi] ?? b.belgeTipi}: {b.filename}
        </a>
      ))}
    </div>
  );
}
