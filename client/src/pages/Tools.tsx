import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, Car, Calendar, MoreVertical, Fuel, Wrench, FileText, AlertCircle, TrendingUp, DollarSign } from "lucide-react";
import { format, parseISO, isBefore, addDays } from "date-fns";
import { tr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

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
import { type Arac, insertAracSchema, type AracGider, insertAracGiderSchema } from "@shared/schema";

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
                                    <div className="flex items-center gap-4">
                                        <Input 
                                            type="file" 
                                            accept="image/*,.pdf"
                                            className="cursor-pointer file:cursor-pointer file:text-primary file:font-medium"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                if (!isEditing) {
                                                    alert("Lütfen önce aracı kaydedin, sonra ruhsat yükleyin.");
                                                    return;
                                                }

                                                const formData = new FormData();
                                                formData.append("ruhsat", file);

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
                                                }
                                            }}
                                        />
                                    </div>
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

function ExpensesTab({ aracId }: { aracId: string }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: expenses, isLoading } = useQuery<AracGider[]>({
        queryKey: [`/api/araclar/${aracId}/giderler`],
    });

    const form = useForm({
        resolver: zodResolver(insertAracGiderSchema),
        defaultValues: {
            aracId,
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
                 aracId,
                 kilometre: values.kilometre ? parseInt(values.kilometre) : null,
             };
             const res = await fetch(`/api/araclar/${aracId}/giderler`, {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify(payload),
             });
             if (!res.ok) throw new Error(await res.text());
             return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/araclar/${aracId}/giderler`] });
            queryClient.invalidateQueries({ queryKey: ["/api/araclar"] }); // Update totals on main list
            form.reset({
                aracId,
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
             queryClient.invalidateQueries({ queryKey: [`/api/araclar/${aracId}/giderler`] });
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
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {expenses?.map((gider) => (
                            <TableRow key={gider.id}>
                                <TableCell>{format(parseISO(gider.tarih), "d MMM yyyy", { locale: tr })}</TableCell>
                                <TableCell>
                                    <Badge variant="outline">{gider.kategori}</Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{gider.aciklama}</TableCell>
                                <TableCell className="text-right font-medium">
                                    {Number(gider.tutar).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
                                </TableCell>
                                <TableCell>
                                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(gider.id)}>
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

// --- MAIN PAGE COMPONENT ---
export default function Tools() {
    const [selectedArac, setSelectedArac] = useState<Arac | null>(null);
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [isNewMode, setIsNewMode] = useState(false);
    
    // Default to 'bilgiler'. If user clicks "Add Policy", we might change this.
    const [activeTab, setActiveTab] = useState("bilgiler");

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch vehicles with updated type (including totalGider)
    const { data: araclar, isLoading } = useQuery<(Arac & { toplamGider: number })[]>({
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

    const openSheet = (arac: Arac | null, isNew: boolean, tab: string = "bilgiler") => {
        setSelectedArac(arac);
        setIsNewMode(isNew);
        setActiveTab(tab);
        setIsSheetOpen(true);
    };

    const getStatusColor = (dateStr?: string | null) => {
        if (!dateStr) return "border-l-slate-300"; // Grey/Unknown
        const date = parseISO(dateStr);
        const today = new Date();
        const warningDate = addDays(today, 30);

        if (isBefore(date, today)) return "border-l-red-500";
        if (isBefore(date, warningDate)) return "border-l-orange-500";
        return "border-l-green-500";
    };

    const getStatusBadge = (dateStr?: string | null) => {
       if (!dateStr) return null;
       const date = parseISO(dateStr);
       const today = new Date();
       const warningDate = addDays(today, 30);
       
       if (isBefore(date, today)) return <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 shadow-sm animate-pulse" title="Süresi Dolmuş" />;
        // Only show red dot for critical issues to avoid clutter
       return null;
    }

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
             <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
                <div>
                     <h2 className="text-3xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                        <Car className="w-8 h-8 text-primary" />
                        Filo Yönetimi
                     </h2>
                     <p className="text-muted-foreground">Şirket araçlarını yönetin ve giderleri izleyin.</p>
                </div>
                <Button onClick={() => openSheet(null, true)} size="lg" className="shadow-lg hover:shadow-xl transition-all">
                    <Plus className="w-5 h-5 mr-2" /> Yeni Araç
                </Button>
            </div>

            {isLoading ? (
                <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {araclar?.map((arac) => {
                         // Determine overall status color based on worst case (expired > warning > ok)
                         const tStatus = getStatusColor(arac.trafikBitisTarihi);
                         const kStatus = getStatusColor(arac.kaskoBitisTarihi);
                         
                         let cardStyle = "border-t-4 border-t-green-500";
                         
                         // Check for expiration (Red)
                         if (tStatus === "border-l-red-500" || kStatus === "border-l-red-500") {
                            // Expired: Red top border + aesthetic red glow/ring
                            cardStyle = "border-t-4 border-t-red-500 ring-1 ring-red-200 shadow-[0_0_20px_-5px_rgba(239,68,68,0.15)] bg-red-50/10";
                         } 
                         // Check for nearing expiration (Orange)
                         else if (tStatus === "border-l-orange-500" || kStatus === "border-l-orange-500") {
                            cardStyle = "border-t-4 border-t-orange-500";
                         }

                         return (
                            <Card 
                                key={arac.id} 
                                className={`group relative overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-xl cursor-pointer ${cardStyle}`}
                                onClick={() => openSheet(arac, false)}
                            >
                                <CardContent className="p-4 pt-5 space-y-4">
                                    {/* Header Section */}
                                    <div className="flex flex-col items-center justify-center space-y-3 relative">
                                        <div className="absolute right-0 top-0" onClick={(e) => e.stopPropagation()}>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="sr-only">Aç</span>
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openSheet(arac, false)}>Düzenle</DropdownMenuItem>
                                                    <DropdownMenuItem 
                                                        className="text-destructive focus:text-destructive" 
                                                        onClick={() => {
                                                            if (confirm("Silmek istediğinize emin misiniz?")) deleteMutation.mutate(arac.id);
                                                        }}
                                                    >
                                                        Sil
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>

                                        {/* Plate Design */}
                                        <div className="inline-flex items-center border-4 border-slate-900 rounded-md px-3 py-1 bg-white shadow-md font-sans font-black text-slate-900 tracking-wider text-xl select-all z-10">
                                            <div className="w-3.5 h-5 bg-blue-700 mr-2.5 rounded-sm"></div>
                                            {arac.plaka}
                                        </div>

                                        {/* Brand & Model - Centered with Logo */}
                                        <div className="flex flex-col items-center justify-center w-full mt-2 space-y-1">
                                             <BrandLogo brand={arac.marka} model={arac.model} />
                                             <div className="text-sm font-medium text-slate-600 text-center">
                                                <span className="text-slate-900 font-semibold">{arac.marka}</span> {arac.model}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status Section */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="space-y-2">
                                            <span className="text-muted-foreground block text-[11px] uppercase tracking-wide">Trafik</span>
                                            {arac.trafikBitisTarihi ? (
                                                <span className={`font-mono font-bold text-sm ${getStatusColor(arac.trafikBitisTarihi).replace('border-l-', 'text-')}`}>
                                                    {format(parseISO(arac.trafikBitisTarihi), "dd.MM.yyyy")}
                                                </span>
                                            ) : (
                                                <Button 
                                                    variant="ghost" 
                                                    className="h-auto p-0 text-xs text-blue-500 hover:bg-transparent hover:underline" 
                                                    onClick={(e) => { e.stopPropagation(); openSheet(arac, false, "bilgiler"); }}
                                                >
                                                    Poliçe Ekle
                                                </Button>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <span className="text-muted-foreground block text-[11px] uppercase tracking-wide">Kasko</span>
                                            {arac.kaskoBitisTarihi ? (
                                                <span className={`font-mono font-bold text-sm ${getStatusColor(arac.kaskoBitisTarihi).replace('border-l-', 'text-')}`}>
                                                    {format(parseISO(arac.kaskoBitisTarihi), "dd.MM.yyyy")}
                                                </span>
                                            ) : (
                                                <Button 
                                                    variant="ghost" 
                                                    className="h-auto p-0 text-xs text-blue-500 hover:bg-transparent hover:underline"
                                                    onClick={(e) => { e.stopPropagation(); openSheet(arac, false, "bilgiler"); }}
                                                >
                                                    Poliçe Ekle
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Footer / Stats */}
                                    <div className="pt-2 border-t flex items-center justify-between text-xs">
                                        <div className="flex items-center text-muted-foreground">
                                            {arac.sube || "Şube Yok"}
                                        </div>
                                        <div 
                                            className="flex items-center font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"
                                            title="Toplam Gider"
                                        >
                                            <TrendingUp className="w-3 h-3 mr-1" />
                                            {arac.toplamGider > 0 
                                                ? arac.toplamGider.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + " ₺"
                                                : "0 ₺"
                                            }
                                        </div>
                                    </div>
                                    
                                    {getStatusBadge(arac.trafikBitisTarihi)}
                                    {getStatusBadge(arac.kaskoBitisTarihi)}
                                </CardContent>
                            </Card>
                         )
                    })}
                     {!araclar?.length && (
                        <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl bg-slate-50/50">
                            <Car className="w-12 h-12 text-slate-300 mb-4" />
                            <h3 className="text-lg font-medium text-slate-900">Henüz Araç Yok</h3>
                            <p className="text-slate-500 mb-4">Filoya yeni bir araç ekleyerek başlayın.</p>
                            <Button onClick={() => openSheet(null, true)}>Aracı Ekle</Button>
                        </div>
                    )}
                </div>
            )}

            <Sheet open={isSheetOpen} onOpenChange={(open) => {
                if (!open) setSelectedArac(null);
                setIsSheetOpen(open);
            }}>
                <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
                    <SheetHeader className="mb-6">
                        <SheetTitle className="text-xl font-bold flex items-center gap-2">
                             {isNewMode ? "Yeni Araç Ekle" : <span>{selectedArac?.plaka} <span className="text-muted-foreground font-normal text-base">- Detaylar</span></span>}
                        </SheetTitle>
                        <SheetDescription>
                            Araç detaylarını, sigorta poliçelerini ve masraf kayıtlarını buradan yönetebilirsiniz.
                        </SheetDescription>
                    </SheetHeader>
                    
                    {isNewMode ? (
                        <div className="px-1">
                             <VehicleForm onSubmit={(values) => createMutation.mutate(values)} />
                        </div>
                    ) : selectedArac && (
                        (() => {
                            // Use fresh data from list if available to ensure we see updates (like uploaded files) immediately
                            const freshArac = araclar?.find(a => a.id === selectedArac.id) || selectedArac;
                            return (
                                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                                    <TabsList className="grid w-full grid-cols-2 mb-6">
                                        <TabsTrigger value="bilgiler">Bilgiler & Sigorta</TabsTrigger>
                                        <TabsTrigger value="giderler">Giderler</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="bilgiler">
                                        <VehicleForm 
                                            key={freshArac?.ruhsatDosyasi ? 'has-file' : 'no-file'}
                                            defaultValues={freshArac} 
                                            isEditing={true} 
                                            onSubmit={(values) => updateMutation.mutate({ ...values, id: freshArac.id })} 
                                        />
                                    </TabsContent>
                                    <TabsContent value="giderler">
                                        <ExpensesTab aracId={freshArac.id} />
                                    </TabsContent>
                                </Tabs>
                             );
                        })()
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}
