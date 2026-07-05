import { type TalepDetay, BELGE_ETIKET, belgeUrl } from "./portalUtils";

export default function BelgeLinkleri({ talep }: { talep: TalepDetay }) {
  if (!talep.belgeler.length) return <span className="text-xs text-muted-foreground">—</span>;
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
