import { type PortalMe } from "./PortalApp";

export default function TemsilciPanel({ me }: { me: PortalMe }) {
  return <div className="text-muted-foreground">Talep formu yükleniyor… ({me.adSoyad})</div>;
}
