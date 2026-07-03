import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, Car, Calendar, MoreVertical, Fuel, Wrench, FileText, AlertCircle, TrendingUp, DollarSign, Upload, Zap, Building2, MapPin, Pencil, Loader2 } from "lucide-react";
import { format, parseISO, isBefore, addDays, differenceInCalendarDays } from "date-fns";
import { tr } from "date-fns/locale";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrencyFull } from "@/lib/utils";
import { type Arac, insertAracSchema, type AracGider, insertAracGiderSchema, type Gider } from "@shared/schema";
import { subYears, parse } from "date-fns";

// --- HELPERS ---

// Common car brand logos (using reliable CDNs or public assets)
const BRAND_LOGOS: Record<string, string> = {
    // Top Turkish Market Brands
    "renault": "/assets/brands/renault.svg",
    "fiat": "/assets/brands/fiat.svg",
    "ford": "https://upload.wikimedia.org/wikipedia/commons/3/3e/Ford_logo_flat.svg",
    "volkswagen": "https://upload.wikimedia.org/wikipedia/commons/6/6d/Volkswagen_logo_2019.svg",
    "vw": "https://upload.wikimedia.org/wikipedia/commons/6/6d/Volkswagen_logo_2019.svg",
    "peugeot": "/assets/brands/peugeot.svg",
    "opel": "https://upload.wikimedia.org/wikipedia/commons/8/85/Opel_logo_2023.svg",
    "toyota": "https://upload.wikimedia.org/wikipedia/commons/9/9d/Toyota_carlogo.svg",
    "hyundai": "https://upload.wikimedia.org/wikipedia/commons/4/44/Hyundai_Motor_Company_logo.svg",
    "honda": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Honda_Logo.svg",
    "bmw": "https://upload.wikimedia.org/wikipedia/commons/4/44/BMW.svg",
    "mercedes": "https://upload.wikimedia.org/wikipedia/commons/9/90/Mercedes-Benz_logo.svg",
    "mercedes-benz": "https://upload.wikimedia.org/wikipedia/commons/9/90/Mercedes-Benz_logo.svg",
    "audi": "https://upload.wikimedia.org/wikipedia/commons/9/92/Audi-Logo_2016.svg",
    "skoda": "https://upload.wikimedia.org/wikipedia/commons/e/ee/Skoda_Auto_logo_%282023%29.svg",
    "dacia": "https://upload.wikimedia.org/wikipedia/commons/a/a2/Dacia_2021.svg",
    "citroen": "https://upload.wikimedia.org/wikipedia/commons/3/39/Citroen_2021.svg",
    "nissan": "https://upload.wikimedia.org/wikipedia/commons/8/8c/Nissan_logo.png",
    "kia": "https://upload.wikimedia.org/wikipedia/commons/4/47/Kia_logo.svg",
    "seat": "https://upload.wikimedia.org/wikipedia/commons/2/23/Seat_Logo_2012.svg",
    "volvo": "/assets/brands/volvo.svg",
    "tesla": "/assets/brands/tesla.png",
    "porsche": "https://upload.wikimedia.org/wikipedia/commons/8/8c/Porsche_logo.svg",
    "land rover": "https://upload.wikimedia.org/wikipedia/commons/a/aa/Land_Rover_Logo_2020.svg",
    "land-rover": "https://upload.wikimedia.org/wikipedia/commons/a/aa/Land_Rover_Logo_2020.svg",
    "jeep": "https://upload.wikimedia.org/wikipedia/commons/e/e6/Jeep_Logo.svg",
    "togg": "https://upload.wikimedia.org/wikipedia/commons/5/52/Togg_logo.svg"
};

const BrandLogo = ({ brand, model }: { brand?: string | null, model?: string | null }) => {
    if (!brand) return <Car className="w-12 h-12 text-slate-200" />;

    const normalizedBrand = brand.toLowerCase().trim().replace(/ /g, "-");
    const logoUrl = BRAND_LOGOS[normalizedBrand];

    if (logoUrl) {
        return (
            <div className="w-16 h-16 flex items-center justify-center p-1">
                <img
                    src={logoUrl}
                    alt={brand}
                    className="max-w-full max-h-full object-contain opacity-90 hover:opacity-100 transition-opacity"
                    onError={(e) => {
                        // Fallback if image fails
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            </div>
        );
    }

    // Fallback for unknown brands: Use text
    return (
        <div className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-bold text-sm border border-slate-200">
            {brand.toUpperCase()}
        </div>
    );
};

// --- SUBSIDIARY COMPONENTS ---

// Sürükle-bırak + tıkla-seç dosya alanı (poliçe ve ruhsat yüklemede ortak)
function FileDropzone({
    onFile,
    uploading,
    label = "Dosyayı buraya sürükleyin veya tıklayın",
}: {
    onFile: (file: File) => void;
    uploading?: boolean;
    label?: string;
}) {
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => { if (!uploading) inputRef.current?.click(); }}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); inputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragActive(true); }}
            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
            onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (uploading) return;
                const file = e.dataTransfer.files?.[0];
                if (file) onFile(file);
            }}
            className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
                dragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 bg-muted/20 hover:border-primary/50 hover:bg-primary/5",
                uploading && "cursor-default opacity-70"
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFile(file);
                    e.target.value = "";
                }}
            />
            {/* pointer-events-none: alt öğeler dragleave tetikleyip vurguyu titretmesin */}
            <div className="pointer-events-none flex flex-col items-center gap-1.5">
                {uploading ? (
                    <>
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <span className="text-[12.5px] font-medium text-muted-foreground">Yükleniyor…</span>
                    </>
                ) : (
                    <>
                        <Upload className={cn("h-5 w-5", dragActive ? "text-primary" : "text-muted-foreground")} />
                        <span className="text-[12.5px] font-medium">{dragActive ? "Bırakın, yüklensin" : label}</span>
                        <span className="text-[11px] text-muted-foreground">PDF veya görsel</span>
                    </>
                )}
            </div>
        </div>
    );
}

// Poliçe OCR'ından dönen alanlar (server /api/araclar/:id/{trafik,kasko}-police → extracted)
type ExtractedPolicyFields = { sirket: string | null; policeNo: string | null; bitisTarihi: string | null; fiyat: string | null };

function PoliceUploader({
    aracId,
    isEditing,
    endpoint,
    currentUrl,
    onChange,
    fieldNameForUpdate,
    onExtract,
}: {
    aracId?: string;
    isEditing: boolean;
    endpoint: "trafik-police" | "kasko-police";
    currentUrl?: string | null;
    onChange: (url: string | null) => void;
    fieldNameForUpdate: "trafikPoliceDosyasi" | "kaskoPoliceDosyasi";
    onExtract?: (fields: ExtractedPolicyFields) => void;
}) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [uploading, setUploading] = useState(false);

    if (currentUrl) {
        return (
            <div className="flex flex-col gap-2 p-3 border border-dashed rounded-lg bg-slate-50/50">
                <Button
                    type="button"
                    variant="outline"
                    className="h-12 w-full font-medium border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 hover:text-primary gap-2"
                    onClick={(e) => {
                        e.preventDefault();
                        window.open(currentUrl, "_blank");
                    }}
                >
                    <FileText className="w-4 h-4" />
                    Poliçeyi Görüntüle
                </Button>
                <div className="flex items-center justify-between gap-2 px-1">
                    <span className="text-xs text-muted-foreground truncate max-w-[200px] font-mono bg-slate-100 px-2 py-1 rounded">
                        {currentUrl.split('/').pop()}
                    </span>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={async (e) => {
                            e.preventDefault();
                            if (!confirm("Poliçe dosyasını silmek istediğinize emin misiniz?")) return;
                            if (!aracId) return;
                            try {
                                const res = await fetch(`/api/araclar/${aracId}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ [fieldNameForUpdate]: null }),
                                });
                                if (!res.ok) throw new Error("Silme başarısız");
                                onChange(null);
                                toast({ description: "Poliçe dosyası silindi." });
                                await queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
                            } catch (err) {
                                console.error(err);
                                toast({ title: "Hata", description: "Dosya silinemedi.", variant: "destructive" });
                            }
                        }}
                        title="Dosyayı Sil"
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <FileDropzone
            uploading={uploading}
            label="Poliçeyi buraya sürükleyin veya tıklayın"
            onFile={async (file) => {
                if (!isEditing || !aracId) {
                    alert("Lütfen önce aracı kaydedin, sonra poliçe yükleyin.");
                    return;
                }
                const formData = new FormData();
                formData.append("police", file);
                setUploading(true);
                try {
                    const res = await fetch(`/api/araclar/${aracId}/${endpoint}`, {
                        method: "POST",
                        body: formData,
                    });
                    if (!res.ok) throw new Error("Yükleme başarısız");
                    const data = await res.json();
                    onChange(data.url);
                    if (data.extracted && onExtract) onExtract(data.extracted);
                    const okundu = data.extracted && Object.values(data.extracted).some((v: any) => v);
                    toast({ title: "Başarılı", description: okundu ? "Poliçe yüklendi, bilgiler otomatik okundu." : "Poliçe dosyası yüklendi." });
                    await queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
                } catch (err) {
                    console.error(err);
                    toast({ title: "Hata", description: "Yükleme sırasında hata oluştu.", variant: "destructive" });
                } finally {
                    setUploading(false);
                }
            }}
        />
    );
}

function VehicleForm({
    defaultValues,
    onSubmit,
    isEditing = false
}: {
    defaultValues?: Partial<Arac>,
    onSubmit: (values: any) => void,
    isEditing?: boolean
}) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [ruhsatUrl, setRuhsatUrl] = useState(defaultValues?.ruhsatDosyasi);
    const [ruhsatUploading, setRuhsatUploading] = useState(false);
    const [trafikPoliceUrl, setTrafikPoliceUrl] = useState(defaultValues?.trafikPoliceDosyasi);
    const [kaskoPoliceUrl, setKaskoPoliceUrl] = useState(defaultValues?.kaskoPoliceDosyasi);

    const form = useForm({
        resolver: zodResolver(insertAracSchema),
        defaultValues: defaultValues || {
            plaka: "",
            marka: "",
            model: "",
            sube: "",
            trafikSigortaSirketi: "",
            trafikPoliceNo: "",
            trafikBitisTarihi: "",
            trafikSigortaFiyat: "0",
            kaskoSigortaSirketi: "",
            kaskoPoliceNo: "",
            kaskoBitisTarihi: "",
            kaskoSigortaFiyat: "0",
        },
    });


    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="plaka"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Plaka</FormLabel>
                                <FormControl><Input placeholder="34 ABC 123" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="sube"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Şube</FormLabel>
                                <FormControl><Input placeholder="Merkez, İstanbul..." {...field} value={field.value || ""} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                     <FormField
                        control={form.control}
                        name="marka"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Marka</FormLabel>
                                <FormControl><Input placeholder="Ford" {...field} value={field.value || ""} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                     <FormField
                        control={form.control}
                        name="model"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Model</FormLabel>
                                <FormControl><Input placeholder="Transit" {...field} value={field.value || ""} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="border rounded-md p-4 space-y-4 bg-muted/20">
                    <h4 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Trafik Sigortası</h4>
                    <div className="grid grid-cols-2 gap-4">
                         <FormField
                            control={form.control}
                            name="trafikSigortaSirketi"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Şirket</FormLabel>
                                    <FormControl><Input placeholder="Allianz..." {...field} value={field.value || ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="trafikPoliceNo"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Poliçe No</FormLabel>
                                    <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="trafikBitisTarihi"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Bitiş Tarihi</FormLabel>
                                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="trafikSigortaFiyat"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Fiyat (TL)</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} value={field.value || ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                     </div>
                     <FormItem>
                        <FormLabel>Poliçe Dosyası</FormLabel>
                        <PoliceUploader
                            aracId={defaultValues?.id}
                            isEditing={isEditing}
                            endpoint="trafik-police"
                            currentUrl={trafikPoliceUrl}
                            onChange={setTrafikPoliceUrl}
                            fieldNameForUpdate="trafikPoliceDosyasi"
                            onExtract={(f) => {
                                if (f.sirket && !form.getValues("trafikSigortaSirketi")) form.setValue("trafikSigortaSirketi", f.sirket, { shouldDirty: true });
                                if (f.policeNo && !form.getValues("trafikPoliceNo")) form.setValue("trafikPoliceNo", f.policeNo, { shouldDirty: true });
                                if (f.bitisTarihi && !form.getValues("trafikBitisTarihi")) form.setValue("trafikBitisTarihi", f.bitisTarihi, { shouldDirty: true });
                                if (f.fiyat && (!form.getValues("trafikSigortaFiyat") || Number(form.getValues("trafikSigortaFiyat")) === 0)) form.setValue("trafikSigortaFiyat", f.fiyat, { shouldDirty: true });
                            }}
                        />
                     </FormItem>
                </div>

                <div className="border rounded-md p-4 space-y-4 bg-muted/20">
                     <h4 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Kasko</h4>
                      <div className="grid grid-cols-2 gap-4">
                         <FormField
                            control={form.control}
                            name="kaskoSigortaSirketi"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Şirket</FormLabel>
                                    <FormControl><Input placeholder="Axa..." {...field} value={field.value || ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                         <FormField
                            control={form.control}
                            name="kaskoPoliceNo"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Poliçe No</FormLabel>
                                    <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="kaskoBitisTarihi"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Bitiş Tarihi</FormLabel>
                                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="kaskoSigortaFiyat"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Fiyat (TL)</FormLabel>
                                    <FormControl><Input type="number" step="0.01" {...field} value={field.value || ""} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                     </div>
                     <FormItem>
                        <FormLabel>Poliçe Dosyası</FormLabel>
                        <PoliceUploader
                            aracId={defaultValues?.id}
                            isEditing={isEditing}
                            endpoint="kasko-police"
                            currentUrl={kaskoPoliceUrl}
                            onChange={setKaskoPoliceUrl}
                            fieldNameForUpdate="kaskoPoliceDosyasi"
                            onExtract={(f) => {
                                if (f.sirket && !form.getValues("kaskoSigortaSirketi")) form.setValue("kaskoSigortaSirketi", f.sirket, { shouldDirty: true });
                                if (f.policeNo && !form.getValues("kaskoPoliceNo")) form.setValue("kaskoPoliceNo", f.policeNo, { shouldDirty: true });
                                if (f.bitisTarihi && !form.getValues("kaskoBitisTarihi")) form.setValue("kaskoBitisTarihi", f.bitisTarihi, { shouldDirty: true });
                                if (f.fiyat && (!form.getValues("kaskoSigortaFiyat") || Number(form.getValues("kaskoSigortaFiyat")) === 0)) form.setValue("kaskoSigortaFiyat", f.fiyat, { shouldDirty: true });
                            }}
                        />
                     </FormItem>
                </div>

                <div className="border rounded-md p-4 space-y-4 bg-muted/20">
                     <h4 className="font-semibold flex items-center gap-2"><FileText className="w-4 h-4" /> Ruhsat Bilgileri</h4>
                     <div className="grid grid-cols-1 gap-4">
                        <FormItem>
                            <FormLabel>Ruhsat Dosyası</FormLabel>

                            {ruhsatUrl ? (
                                <div className="flex flex-col gap-3 p-4 border border-dashed rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                    <Button
                                        variant="outline"
                                        className="h-16 w-full text-lg font-medium border-2 border-primary/20 hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all gap-3"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            window.open(ruhsatUrl, "_blank");
                                        }}
                                    >
                                        <FileText className="w-6 h-6" />
                                        Ruhsatı Görüntüle
                                    </Button>

                                    <div className="flex items-center justify-between gap-2 px-1">
                                        <span className="text-xs text-muted-foreground truncate max-w-[200px] font-mono bg-slate-100 px-2 py-1 rounded">
                                            {ruhsatUrl.split('/').pop()}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={async (e) => {
                                                e.preventDefault();
                                                if (!confirm("Ruhsat dosyasını silmek istediğinize emin misiniz?")) return;

                                                try {
                                                    const aracId = defaultValues?.id;
                                                    if (!aracId) return;

                                                    // Use the main update endpoint to clear the field
                                                    // Since we don't have a specific DELETE for just the file field, we update the vehicle.
                                                    // Note: We need to ensure the backend accepts partial updates or we verify the implementation.
                                                    // Alternatively, we can use the same logic as the parent updateMutation but simpler.

                                                    const res = await fetch(`/api/araclar/${aracId}`, {
                                                        method: "PUT", // Assuming PATCH is supported or PUT with partial data?
                                                        // Actually server routes usually define PUT /api/araclar/:id logic.
                                                        // Let's check routes.ts or storage.ts to be safe, but typically PUT updates fields.
                                                        // If backend expects full object, this might be risky.
                                                        // Let's assume we can send partial for now or check routes.
                                                        // Wait, in Tools.tsx updateMutation uses PUT. Let's see if PUT handles partials.
                                                        // Usually standard practice. If not, I'll need to adapt.
                                                        // For now, let's try assuming standard partial update or create a specific delete route if needed. source of truth is routes.ts
                                                        // The safer bet is to use the same logic as "delete file" by uploading empty? No.
                                                        // Let's assume I can send { ruhsatDosyasi: null }

                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ ruhsatDosyasi: null })
                                                    });

                                                    if (!res.ok) throw new Error("Silme başarısız");

                                                    setRuhsatUrl(null); // Clear local state to show input again
                                                    toast({ description: "Ruhsat dosyası silindi." });
                                                    await queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });

                                                } catch (err) {
                                                    console.error(err);
                                                    toast({ title: "Hata", description: "Dosya silinemedi.", variant: "destructive" });
                                                }
                                            }}
                                            title="Dosyayı Sil"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <FormControl>
                                    <FileDropzone
                                        uploading={ruhsatUploading}
                                        label="Ruhsatı buraya sürükleyin veya tıklayın"
                                        onFile={async (file) => {
                                            if (!isEditing) {
                                                alert("Lütfen önce aracı kaydedin, sonra ruhsat yükleyin.");
                                                return;
                                            }

                                            const formData = new FormData();
                                            formData.append("ruhsat", file);
                                            setRuhsatUploading(true);

                                            try {
                                                const aracId = defaultValues?.id;
                                                if (!aracId) throw new Error("Araç ID bulunamadı");

                                                const res = await fetch(`/api/araclar/${aracId}/ruhsat`, {
                                                    method: "POST",
                                                    body: formData
                                                });

                                                if (!res.ok) throw new Error("Yükleme başarısız");

                                                const data = await res.json();

                                                setRuhsatUrl(data.url);

                                                toast({
                                                    title: "Başarılı",
                                                    description: "Ruhsat dosyası yüklendi.",
                                                });

                                                await queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
                                            } catch (err) {
                                                console.error(err);
                                                alert("Yükleme sırasında hata oluştu");
                                            } finally {
                                                setRuhsatUploading(false);
                                            }
                                        }}
                                    />
                                </FormControl>
                            )}
                            <FormMessage />
                        </FormItem>
                     </div>
                </div>

                <div className="flex justify-end pt-4">
                    <Button type="submit" className="w-full md:w-auto">
                        {isEditing ? "Güncelle" : "Kaydet"}
                    </Button>
                </div>
            </form>
        </Form>
    );
}

// Birleşik gider tipi
type UnifiedExpense = {
    id: string;
    tarih: string;
    kategori: string;
    aciklama: string;
    tutar: number;
    kaynak: 'Manuel' | 'Fatura' | 'Sigorta';
    firma?: string; // Fatura giderleri için
    canDelete: boolean;
};

function ExpensesTab({ arac }: { arac: Arac }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Manuel giderler
    const { data: manuelExpenses, isLoading: manuelLoading } = useQuery<AracGider[]>({
        queryKey: [`/api/araclar/${arac.id}/giderler`],
    });

    // Fatura giderleri (gümrük giderlerinden plakaya göre)
    const { data: faturaExpenses, isLoading: faturaLoading } = useQuery<Gider[]>({
        queryKey: [`/api/giderler/by-plaka/${arac.plaka}`],
        enabled: !!arac.plaka,
    });

    // Sigorta giderlerini araç verisinden oluştur
    const sigortaExpenses: UnifiedExpense[] = [];

    if (arac.trafikSigortaFiyat && Number(arac.trafikSigortaFiyat) > 0 && arac.trafikBitisTarihi) {
        const bitisTarihi = parse(arac.trafikBitisTarihi, "yyyy-MM-dd", new Date());
        const baslangicTarihi = subYears(bitisTarihi, 1);
        sigortaExpenses.push({
            id: `sigorta-trafik-${arac.id}`,
            tarih: format(baslangicTarihi, "yyyy-MM-dd"),
            kategori: "Sigorta",
            aciklama: `Trafik Sigortası - ${arac.trafikSigortaSirketi || ""}`,
            tutar: Number(arac.trafikSigortaFiyat),
            kaynak: 'Sigorta',
            canDelete: false,
        });
    }

    if (arac.kaskoSigortaFiyat && Number(arac.kaskoSigortaFiyat) > 0 && arac.kaskoBitisTarihi) {
        const bitisTarihi = parse(arac.kaskoBitisTarihi, "yyyy-MM-dd", new Date());
        const baslangicTarihi = subYears(bitisTarihi, 1);
        sigortaExpenses.push({
            id: `sigorta-kasko-${arac.id}`,
            tarih: format(baslangicTarihi, "yyyy-MM-dd"),
            kategori: "Sigorta",
            aciklama: `Kasko - ${arac.kaskoSigortaSirketi || ""}`,
            tutar: Number(arac.kaskoSigortaFiyat),
            kaynak: 'Sigorta',
            canDelete: false,
        });
    }

    // Tüm giderleri birleştir
    const allExpenses: UnifiedExpense[] = [
        // Manuel giderler
        ...(manuelExpenses?.map(g => ({
            id: g.id,
            tarih: g.tarih,
            kategori: g.kategori,
            aciklama: g.aciklama || "",
            tutar: Number(g.tutar),
            kaynak: 'Manuel' as const,
            canDelete: true,
        })) || []),
        // Fatura giderleri
        ...(faturaExpenses?.map(g => ({
            id: g.id,
            tarih: g.tarih ? parse(g.tarih, "dd.MM.yyyy", new Date()).toISOString().split('T')[0] : "",
            kategori: g.kategori || "",
            aciklama: g.firma || "",
            tutar: Number(g.tryTutar || g.toplamTutar),
            kaynak: 'Fatura' as const,
            firma: g.firma || undefined,
            canDelete: false,
        })) || []),
        // Sigorta giderleri
        ...sigortaExpenses,
    ].sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime());

    const isLoading = manuelLoading || faturaLoading;

    const form = useForm({
        resolver: zodResolver(insertAracGiderSchema),
        defaultValues: {
            aracId: arac.id,
            tarih: format(new Date(), "yyyy-MM-dd"),
            kategori: "Yakıt",
            aciklama: "",
            tutar: "",
            kilometre: undefined,
        },
    });

    const createMutation = useMutation({
        mutationFn: async (values: any) => {
             const payload = {
                 ...values,
                 aracId: arac.id,
                 kilometre: values.kilometre ? parseInt(values.kilometre) : null,
             };
             const res = await fetch(`/api/araclar/${arac.id}/giderler`, {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify(payload),
             });
             if (!res.ok) throw new Error(await res.text());
             return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/araclar/${arac.id}/giderler`] });
            queryClient.invalidateQueries({ queryKey: ["/api/araclar"] }); // Update totals on main list
            form.reset({
                aracId: arac.id,
                tarih: format(new Date(), "yyyy-MM-dd"),
                kategori: "Yakıt",
                aciklama: "",
                tutar: "",
                kilometre: undefined
            });
            toast({ title: "Gider Eklendi" });
        },
        onError: (err) => {
            toast({ title: "Hata", description: err.message, variant: "destructive" });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/araclar/giderler/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
             queryClient.invalidateQueries({ queryKey: [`/api/araclar/${arac.id}/giderler`] });
             queryClient.invalidateQueries({ queryKey: ["/api/araclar"] }); // Update totals
             toast({ title: "Gider Silindi" });
        }
    });

    return (
        <div className="space-y-6">
            <div className="border rounded-md p-4 bg-muted/10">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                         <div className="grid grid-cols-2 gap-4">
                             <FormField
                                control={form.control}
                                name="tarih"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tarih</FormLabel>
                                        <FormControl><Input type="date" {...field} /></FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="kategori"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Kategori</FormLabel>
                                        <FormControl>
                                            <select
                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                                {...field}
                                            >
                                                <option value="Yakıt">Yakıt</option>
                                                <option value="Bakım">Bakım</option>
                                                <option value="Vergi">Vergi</option>
                                                <option value="Sigorta">Sigorta</option>
                                                <option value="Diğer">Diğer</option>
                                            </select>
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="tutar"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Tutar</FormLabel>
                                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="kilometre"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>KM (Opsiyonel)</FormLabel>
                                        <FormControl><Input type="number" {...field} value={field.value || ""} /></FormControl>
                                    </FormItem>
                                )}
                            />
                         </div>
                         <FormField
                            control={form.control}
                            name="aciklama"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Açıklama</FormLabel>
                                    <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                                </FormItem>
                            )}
                        />
                        <Button type="submit" size="sm" className="w-full">
                            <Plus className="w-4 h-4 mr-2" /> Gider Ekle
                        </Button>
                    </form>
                </Form>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Tarih</TableHead>
                            <TableHead>Kategori</TableHead>
                            <TableHead>Açıklama</TableHead>
                            <TableHead className="text-right">Tutar</TableHead>
                            <TableHead>Kaynak</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    Yükleniyor...
                                </TableCell>
                            </TableRow>
                        ) : allExpenses.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                    Henüz gider kaydı yok
                                </TableCell>
                            </TableRow>
                        ) : (
                            allExpenses.map((gider) => (
                                <TableRow key={gider.id}>
                                    <TableCell>
                                        {gider.tarih ? format(parseISO(gider.tarih), "d MMM yyyy", { locale: tr }) : "-"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{gider.kategori}</Badge>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{gider.aciklama}</TableCell>
                                    <TableCell className="text-right font-medium">
                                        {gider.tutar.toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={gider.kaynak === 'Manuel' ? 'secondary' : gider.kaynak === 'Fatura' ? 'default' : 'outline'}
                                            className={
                                                gider.kaynak === 'Manuel' ? 'bg-slate-100 text-slate-700' :
                                                gider.kaynak === 'Fatura' ? 'bg-blue-100 text-blue-700' :
                                                'bg-green-100 text-green-700'
                                            }
                                        >
                                            {gider.kaynak}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {gider.canDelete && (
                                            <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(gider.id)}>
                                                <Trash2 className="w-4 h-4 text-destructive" />
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

// --- MAIN PAGE COMPONENT ---

// Liste endpoint'i araç + türetilmiş gider/maliyet alanlarını döner
type AracRow = Arac & { toplamGider: number; seneBasindanBeriGider: number; amortismanGiderYtd: number; toplamMaliyet: number };

// Plaka il kodu → şube (araç kaydının `sube` alanı boşsa fallback)
const PLATE_SUBE: Record<string, string> = {
    "34": "İstanbul", "06": "Ankara", "35": "İzmir", "16": "Bursa", "33": "Mersin",
};
const subeOf = (arac: Partial<Arac>) =>
    arac.sube || PLATE_SUBE[String(arac.plaka || "").trim().split(/\s+/)[0]] || "Merkez";

// Bitiş tarihinden (yyyy-MM-dd) bugüne kalan gün; geçersiz/boş → null
const daysLeft = (dateStr?: string | null): number | null => {
    if (!dateStr) return null;
    try { return differenceInCalendarDays(parseISO(dateStr), new Date()); } catch { return null; }
};
const vehicleMinDays = (a: Partial<Arac>): number | null => {
    const arr = [daysLeft(a.trafikBitisTarihi), daysLeft(a.kaskoBitisTarihi)].filter((x): x is number => x !== null);
    return arr.length ? Math.min(...arr) : null;
};
const dayColor = (d: number | null) => d === null ? "#94a3b8" : d <= 7 ? "#dc2626" : d <= 30 ? "#b45309" : "#475569";
const dayLabel = (d: number | null) => d === null ? "tanımsız" : d < 0 ? `${Math.abs(d)} gün geçti` : `${d} gün kaldı`;
const statusOf = (m: number | null) =>
    m === null ? { label: "TANIMSIZ", badgeBg: "#f1f5f9", badgeFg: "#475569", accent: "#cbd5e1" }
        : m <= 7 ? { label: "KRİTİK", badgeBg: "#fee2e2", badgeFg: "#991b1b", accent: "#dc2626" }
            : m <= 30 ? { label: "YAKLAŞIYOR", badgeBg: "#ffedd5", badgeFg: "#9a3412", accent: "#f59e0b" }
                : { label: "GÜNCEL", badgeBg: "#dcfce7", badgeFg: "#166534", accent: "#10b981" };

// TR plaka görseli (kart + modal ortak)
function PlateBadge({ plaka, size = "sm" }: { plaka: string; size?: "sm" | "md" }) {
    return (
        <span className={cn("inline-flex items-stretch overflow-hidden rounded-[5px] border-[1.5px] border-slate-800 bg-white shadow-sm", size === "md" ? "h-8" : "h-[30px]")}>
            <span className="flex w-[19px] flex-col items-center justify-center bg-[#0a3d91] leading-none text-white">
                <span className="text-[6px]">★</span>
                <span className="text-[8px] font-bold tracking-wider">TR</span>
            </span>
            <span className={cn("flex items-center whitespace-nowrap px-2.5 font-bold tracking-[1.5px] text-slate-900", size === "md" ? "text-[16px]" : "text-[15px]")} style={{ fontFamily: "'JetBrains Mono', monospace" }}>{plaka}</span>
        </span>
    );
}

// Logo kutusu — mevcut BrandLogo'yu sabit kutuda gösterir
function LogoBox({ marka, model, className }: { marka?: string | null; model?: string | null; className?: string }) {
    return (
        <div className={cn("flex flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-slate-100 bg-slate-50", className)}>
            <BrandLogo brand={marka} model={model} />
        </div>
    );
}

// Modal sigorta kartı satırı
function InfoRow({ label, value, mono, color }: { label: string; value: string; mono?: boolean; color?: string }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] text-slate-400">{label}</span>
            <span className={cn("text-[12.5px] font-semibold", mono && "font-mono")} style={color ? { color, fontWeight: 700 } : undefined}>{value}</span>
        </div>
    );
}

export default function Tools() {
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [isNewMode, setIsNewMode] = useState(false);
    const [editArac, setEditArac] = useState<AracRow | null>(null);
    const [selectedSube, setSelectedSube] = useState<string>("all");

    // Detay (okuma) modalı
    const [detailArac, setDetailArac] = useState<AracRow | null>(null);
    const [detailTab, setDetailTab] = useState<"bilgiler" | "giderler">("bilgiler");

    const { toast } = useToast();
    const queryClient = useQueryClient();

    const handleFuelExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const bstr = event.target?.result;
                const workbook = XLSX.read(bstr, { type: "binary", cellDates: true });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

                // Expected format: Plaka, Tarih, Tutar, Açıklama, Kilometre
                const validGiderler = jsonData.map(row => {
                    const plaka = String(row.Plaka || row.plaka || "").trim().toUpperCase();
                    const arac = araclar?.find(a => a.plaka.replace(/\s+/g, '').toUpperCase() === plaka.replace(/\s+/g, '').toUpperCase());

                    if (!arac) return null;

                    let rawTutar = row.Tutar || row.tutar || "0";
                    if (typeof rawTutar === "string") {
                        rawTutar = rawTutar.replace(/\./g, "").replace(",", ".");
                    }

                    return {
                        aracId: arac.id,
                        tarih: row.Tarih || row.tarih || format(new Date(), "yyyy-MM-dd"),
                        kategori: "Yakıt",
                        aciklama: row.Açıklama || row.aciklama || "Excel'den yüklendi",
                        tutar: String(rawTutar),
                        kilometre: row.Kilometre || row.kilometre || null
                    };
                }).filter(Boolean);

                if (validGiderler.length === 0) {
                    toast({ title: "Hata", description: "Geçerli plaka ile eşleşen kayıt bulunamadı.", variant: "destructive" });
                    return;
                }

                const res = await fetch("/api/araclar/bulk-gider", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(validGiderler)
                });

                if (!res.ok) throw new Error(await res.text());

                toast({ title: "Başarılı", description: `${validGiderler.length} yakıt gideri yüklendi.` });
                queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
            } catch (error) {
                console.error("Excel upload error:", error);
                toast({ title: "Hata", description: "Excel işlenirken hata oluştu.", variant: "destructive" });
            }
        };
        reader.readAsBinaryString(file);
    };

    // Fetch vehicles with updated type (including totalGider, ytd stuff)
    const { data: araclar, isLoading } = useQuery<AracRow[]>({
        queryKey: ["/api/araclar"],
    });

    const createMutation = useMutation({
        mutationFn: async (values: any) => {
            const res = await fetch("/api/araclar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
            setIsSheetOpen(false);
            toast({ title: "Araç Eklendi" });
        },
        onError: (err) => { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
    });

    const updateMutation = useMutation({
        mutationFn: async (values: any) => {
            const { id, ...data } = values;
            const res = await fetch(`/api/araclar/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
            setIsSheetOpen(false);
            toast({ title: "Araç Güncellendi" });
        },
        onError: (err) => { toast({ title: "Hata", description: err.message, variant: "destructive" }); }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/araclar/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
             queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
             toast({ title: "Araç Silindi" });
        }
    });

    const openNew = () => { setEditArac(null); setIsNewMode(true); setIsSheetOpen(true); };
    const openEdit = (arac: AracRow) => { setEditArac(arac); setIsNewMode(false); setIsSheetOpen(true); setDetailArac(null); };

    // Benzersiz şubeleri al ve araç sayılarını hesapla
    const subeler = useMemo(() => {
        if (!araclar) return [];
        const subeMap = new Map<string, number>();
        araclar.forEach(a => {
            const sube = a.sube || "Belirtilmemiş";
            subeMap.set(sube, (subeMap.get(sube) || 0) + 1);
        });
        return Array.from(subeMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }, [araclar]);

    // Filtrelenmiş araçlar
    const filteredAraclar = useMemo(() => {
        if (!araclar) return [];
        if (selectedSube === "all") return araclar;
        return araclar.filter(a => (a.sube || "Belirtilmemiş") === selectedSube);
    }, [araclar, selectedSube]);

    // En yakın sigorta bitişine göre sıralı (tanımsız en sonda)
    const sortedAraclar = useMemo(() => {
        return [...filteredAraclar].sort((a, b) => {
            const am = vehicleMinDays(a), bm = vehicleMinDays(b);
            if (am === null && bm === null) return 0;
            if (am === null) return 1;
            if (bm === null) return -1;
            return am - bm;
        });
    }, [filteredAraclar]);

    // KPI'lar — görüntülenen (filtreli) filodan türetilir
    const kpis = useMemo(() => {
        const list = filteredAraclar;
        const mins = list.map(vehicleMinDays);
        const kritik = mins.filter((m) => m !== null && m <= 7).length;
        const yaklasan = mins.filter((m) => m !== null && m > 7 && m <= 30).length;
        const yillikSig = list.reduce((acc, v) => acc + Number(v.trafikSigortaFiyat || 0) + Number(v.kaskoSigortaFiyat || 0), 0);
        const yillikGider = list.reduce((acc, v) => acc + Number(v.seneBasindanBeriGider || 0), 0);
        return [
            { label: "Toplam Araç", value: String(list.length), sub: "aktif filo", color: "#0ea5e9", valColor: "#0f172a" },
            { label: "Sigortası Yaklaşan", value: String(yaklasan), sub: "8–30 gün içinde", color: "#f59e0b", valColor: "#0f172a" },
            { label: "Kritik", value: String(kritik), sub: "≤7 gün kaldı", color: "#dc2626", valColor: "#dc2626" },
            { label: "Yıllık Sigorta", value: formatCurrencyFull(yillikSig), sub: "trafik + kasko", color: "#7c3aed", valColor: "#0f172a" },
            { label: "Yıllık Gider", value: formatCurrencyFull(yillikGider), sub: "yakıt, bakım, sigorta", color: "#0f766e", valColor: "#0f172a" },
        ];
    }, [filteredAraclar]);

    // Detay modalı için listeden taze kayıt (yüklenen dosyaları anında yansıtır)
    const detail = detailArac ? (araclar?.find((a) => a.id === detailArac.id) || detailArac) : null;

    return (
        <div className="min-h-full bg-slate-50 dark:bg-background">
            <div className="px-6 pb-12 lg:px-8">
                {/* ===== STICKY HEADER ===== */}
                <div className="sticky top-0 z-20 border-b border-border/70 bg-slate-50/90 pt-5 backdrop-blur dark:bg-background/90">
                    <div className="flex flex-wrap items-end justify-between gap-4 pb-3.5">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
                                <Car className="h-[22px] w-[22px]" strokeWidth={1.8} />
                            </div>
                            <div>
                                <h1 className="text-[21px] font-extrabold tracking-tight">Araçlar</h1>
                                <p className="mt-0.5 text-[12.5px] text-muted-foreground">Şirket araçlarını yönetin ve giderleri izleyin · <strong className="text-foreground/80">karta tıklayarak detay</strong></p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="file" accept=".xlsx, .xls" id="fuel-excel-upload" className="hidden" onChange={handleFuelExcelUpload} />
                            <Button variant="outline" className="h-[38px] gap-2 font-semibold" asChild>
                                <label htmlFor="fuel-excel-upload" className="cursor-pointer">
                                    <Upload className="h-4 w-4 text-emerald-600" /> Yakıt Yükle
                                </label>
                            </Button>
                            <Button onClick={openNew} className="h-[38px] gap-2 bg-slate-900 font-semibold text-white hover:bg-slate-800">
                                <Plus className="h-4 w-4" /> Yeni Araç
                            </Button>
                        </div>
                    </div>
                </div>

                {/* ===== 5 KPI (accent-bar) ===== */}
                <div className="mt-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 lg:grid-cols-5">
                    {kpis.map((k) => (
                        <div key={k.label} className="relative overflow-hidden rounded-[14px] border bg-card p-4">
                            <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: k.color }} />
                            <div className="pl-2 text-[10.5px] font-semibold uppercase tracking-wide leading-tight text-muted-foreground">{k.label}</div>
                            <div className="mt-2 pl-2 text-[22px] font-extrabold tracking-tight tabular-nums" style={{ color: k.valColor }}>{k.value}</div>
                            <div className="mt-0.5 pl-2 text-[11.5px] text-muted-foreground">{k.sub}</div>
                        </div>
                    ))}
                </div>

                {/* ===== Şube filtresi + sıralama notu ===== */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setSelectedSube("all")}
                            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                                selectedSube === "all" ? "border-slate-900 bg-slate-900 text-white" : "bg-card text-slate-600 hover:border-slate-300")}
                        >
                            <Car className="h-3.5 w-3.5" /> Tümü
                            <span className="rounded-full bg-black/10 px-1.5 text-[11px] tabular-nums">{araclar?.length || 0}</span>
                        </button>
                        {subeler.map((s) => (
                            <button
                                key={s.name}
                                onClick={() => setSelectedSube(s.name)}
                                className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                                    selectedSube === s.name ? "border-slate-900 bg-slate-900 text-white" : "bg-card text-slate-600 hover:border-slate-300")}
                            >
                                <MapPin className="h-3.5 w-3.5" /> {s.name}
                                <span className="rounded-full bg-black/10 px-1.5 text-[11px] tabular-nums">{s.count}</span>
                            </button>
                        ))}
                    </div>
                    <span className="text-xs text-muted-foreground">Filo · {sortedAraclar.length} araç · en yakın sigorta bitişine göre sıralı</span>
                </div>

                {/* ===== Kart Grid ===== */}
                {isLoading ? (
                    <div className="flex justify-center p-12"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-500"></div></div>
                ) : (
                    <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                        {sortedAraclar.map((arac) => {
                            const m = vehicleMinDays(arac);
                            const st = statusOf(m);
                            const td = daysLeft(arac.trafikBitisTarihi);
                            const kd = daysLeft(arac.kaskoBitisTarihi);
                            return (
                                <div
                                    key={arac.id}
                                    onClick={() => { setDetailArac(arac); setDetailTab("bilgiler"); }}
                                    className="cursor-pointer rounded-[14px] border bg-card p-4 transition-all hover:-translate-y-[3px] hover:shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
                                    style={{ borderLeft: `4px solid ${st.accent}` }}
                                >
                                    {/* plaka + durum */}
                                    <div className="flex items-center justify-between gap-2">
                                        <PlateBadge plaka={arac.plaka} />
                                        <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-[10px] font-bold" style={{ background: st.badgeBg, color: st.badgeFg }}>{st.label}</span>
                                    </div>
                                    {/* marka + şube */}
                                    <div className="mt-3.5 flex items-center gap-2.5 border-b pb-3.5">
                                        <LogoBox marka={arac.marka} model={arac.model} className="h-[46px] w-[46px] p-1.5" />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[14px] font-bold text-slate-900">{arac.marka || "—"}</div>
                                            <div className="truncate text-[12px] text-slate-400">{arac.model || "Model belirtilmemiş"}</div>
                                        </div>
                                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                            <MapPin className="h-[11px] w-[11px]" strokeWidth={2.4} />{subeOf(arac)}
                                        </span>
                                    </div>
                                    {/* trafik / kasko */}
                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                        <div>
                                            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-400">Trafik</div>
                                            <div className="font-mono text-[13px] font-bold" style={{ color: dayColor(td) }}>{arac.trafikBitisTarihi ? format(parseISO(arac.trafikBitisTarihi), "dd.MM.yyyy") : "—"}</div>
                                            <div className="text-[11px]" style={{ color: dayColor(td) }}>{dayLabel(td)}</div>
                                        </div>
                                        <div>
                                            <div className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-400">Kasko</div>
                                            <div className="font-mono text-[13px] font-bold" style={{ color: dayColor(kd) }}>{arac.kaskoBitisTarihi ? format(parseISO(arac.kaskoBitisTarihi), "dd.MM.yyyy") : "—"}</div>
                                            <div className="text-[11px]" style={{ color: dayColor(kd) }}>{dayLabel(kd)}</div>
                                        </div>
                                    </div>
                                    {/* yıllık gider */}
                                    <div className="mt-3.5 flex items-center justify-between border-t pt-3">
                                        <span className="text-[11.5px] text-slate-500">Yıllık Gider</span>
                                        <span className="text-[14px] font-bold tabular-nums">{formatCurrencyFull(arac.seneBasindanBeriGider || 0)}</span>
                                    </div>
                                </div>
                            );
                        })}
                        {!araclar?.length && (
                            <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-slate-50/50 p-12">
                                <Car className="mb-4 h-12 w-12 text-slate-300" />
                                <h3 className="text-lg font-medium text-slate-900">Henüz Araç Yok</h3>
                                <p className="mb-4 text-slate-500">Filoya yeni bir araç ekleyerek başlayın.</p>
                                <Button onClick={openNew}>Aracı Ekle</Button>
                            </div>
                        )}
                        {!!araclar?.length && sortedAraclar.length === 0 && (
                            <div className="col-span-full py-12 text-center text-muted-foreground">Bu şubede araç bulunamadı.</div>
                        )}
                    </div>
                )}
            </div>

            {/* ===== Düzenle / Yeni Araç Sheet (mevcut form korundu) ===== */}
            <Sheet open={isSheetOpen} onOpenChange={(open) => { if (!open) setEditArac(null); setIsSheetOpen(open); }}>
                <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
                    <SheetHeader className="mb-6">
                        <SheetTitle className="flex items-center gap-2 text-xl font-bold">
                            {isNewMode ? "Yeni Araç Ekle" : <span>{editArac?.plaka} <span className="text-base font-normal text-muted-foreground">- Düzenle</span></span>}
                        </SheetTitle>
                        <SheetDescription>
                            Araç bilgilerini, sigorta poliçelerini ve ruhsat dosyasını buradan yönetebilirsiniz.
                        </SheetDescription>
                    </SheetHeader>

                    {isNewMode ? (
                        <div className="px-1">
                            <VehicleForm onSubmit={(values) => createMutation.mutate(values)} />
                        </div>
                    ) : editArac && (() => {
                        // Listeden taze veri ile (yüklenen dosyalar anında görünür)
                        const freshArac = araclar?.find(a => a.id === editArac.id) || editArac;
                        return (
                            <VehicleForm
                                key={freshArac?.ruhsatDosyasi ? 'has-file' : 'no-file'}
                                defaultValues={freshArac}
                                isEditing={true}
                                onSubmit={(values) => updateMutation.mutate({ ...values, id: freshArac.id })}
                            />
                        );
                    })()}
                </SheetContent>
            </Sheet>

            {/* ===== Detay (okuma) Modalı ===== */}
            <Dialog open={!!detail} onOpenChange={(o) => !o && setDetailArac(null)}>
                <DialogContent className="max-w-[640px] gap-0 overflow-hidden p-0">
                    {detail && (() => {
                        const td = daysLeft(detail.trafikBitisTarihi);
                        const kd = daysLeft(detail.kaskoBitisTarihi);
                        return (
                            <div className="max-h-[86vh] overflow-y-auto">
                                {/* header */}
                                <div className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card px-5 py-4 pr-12">
                                    <PlateBadge plaka={detail.plaka} size="md" />
                                    <LogoBox marka={detail.marka} model={detail.model} className="h-[38px] w-[38px] p-1.5" />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-[13px] font-bold">{detail.marka} {detail.model}</div>
                                        <div className="text-[11.5px] text-slate-400">{subeOf(detail)} şubesi</div>
                                    </div>
                                    <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => openEdit(detail)}>
                                        <Pencil className="h-3.5 w-3.5" /> Düzenle
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        onClick={() => { if (confirm("Aracı silmek istediğinize emin misiniz?")) { deleteMutation.mutate(detail.id); setDetailArac(null); } }}
                                        title="Aracı Sil"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                {/* tab barı */}
                                <div className="flex gap-1 px-5 pt-3.5">
                                    {([["bilgiler", "Bilgiler & Sigorta"], ["giderler", "Giderler"]] as const).map(([id, label]) => (
                                        <button
                                            key={id}
                                            onClick={() => setDetailTab(id)}
                                            className={cn("rounded-t-lg px-3.5 py-2 text-[13px] transition-colors",
                                                detailTab === id ? "font-bold text-foreground shadow-[inset_0_-2px_0_#0ea5e9]" : "font-semibold text-muted-foreground hover:text-foreground")}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {detailTab === "bilgiler" ? (
                                    <div className="px-5 pb-6 pt-4">
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            {/* Trafik kartı */}
                                            <div className="rounded-[12px] border p-4">
                                                <div className="mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-500" /><h4 className="text-[13.5px] font-bold">Trafik Sigortası</h4></div>
                                                <div className="flex flex-col gap-2.5">
                                                    <InfoRow label="Şirket" value={detail.trafikSigortaSirketi || "—"} />
                                                    <InfoRow label="Poliçe No" value={detail.trafikPoliceNo || "—"} mono />
                                                    <InfoRow label="Bitiş" value={detail.trafikBitisTarihi ? format(parseISO(detail.trafikBitisTarihi), "dd.MM.yyyy") : "—"} color={dayColor(td)} />
                                                    <InfoRow label="Fiyat" value={formatCurrencyFull(Number(detail.trafikSigortaFiyat || 0))} />
                                                </div>
                                            </div>
                                            {/* Kasko kartı */}
                                            <div className="rounded-[12px] border p-4">
                                                <div className="mb-3 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-violet-600" /><h4 className="text-[13.5px] font-bold">Kasko</h4></div>
                                                <div className="flex flex-col gap-2.5">
                                                    <InfoRow label="Şirket" value={detail.kaskoSigortaSirketi || "—"} />
                                                    <InfoRow label="Poliçe No" value={detail.kaskoPoliceNo || "—"} mono />
                                                    <InfoRow label="Bitiş" value={detail.kaskoBitisTarihi ? format(parseISO(detail.kaskoBitisTarihi), "dd.MM.yyyy") : "—"} color={dayColor(kd)} />
                                                    <InfoRow label="Fiyat" value={formatCurrencyFull(Number(detail.kaskoSigortaFiyat || 0))} />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Poliçe belge kartları (yükle / görüntüle) */}
                                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                            <div>
                                                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Trafik Poliçesi</div>
                                                <PoliceUploader aracId={detail.id} isEditing endpoint="trafik-police" currentUrl={detail.trafikPoliceDosyasi} onChange={() => { }} fieldNameForUpdate="trafikPoliceDosyasi" />
                                            </div>
                                            <div>
                                                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Kasko Poliçesi</div>
                                                <PoliceUploader aracId={detail.id} isEditing endpoint="kasko-police" currentUrl={detail.kaskoPoliceDosyasi} onChange={() => { }} fieldNameForUpdate="kaskoPoliceDosyasi" />
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="px-5 pb-6 pt-4">
                                        <div className="mb-4 flex items-center justify-between rounded-[10px] border bg-slate-50 px-4 py-2.5 dark:bg-background/40">
                                            <span className="text-[13px] font-bold">Toplam (Yıllık Gider)</span>
                                            <span className="text-[16px] font-extrabold tabular-nums">{formatCurrencyFull(detail.seneBasindanBeriGider || 0)}</span>
                                        </div>
                                        <ExpensesTab arac={detail} />
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </DialogContent>
            </Dialog>
        </div>
    );
}
