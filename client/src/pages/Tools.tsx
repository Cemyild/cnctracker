
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Pencil, Trash2, Wrench } from "lucide-react";
import { format, parseISO, isBefore, addDays } from "date-fns";
import { tr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { type Arac, insertAracSchema } from "@shared/schema";

export default function Tools() {
    const [isOpen, setIsOpen] = useState(false);
    const [editingArac, setEditingArac] = useState<Arac | null>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: araclar, isLoading } = useQuery<Arac[]>({
        queryKey: ["/api/araclar"],
    });

    const form = useForm<z.infer<typeof insertAracSchema>>({
        resolver: zodResolver(insertAracSchema),
        defaultValues: {
            plaka: "",
            trafikPoliceNo: "",
            trafikBitisTarihi: "",
            kaskoPoliceNo: "",
            kaskoBitisTarihi: "",
        },
    });

    const createMutation = useMutation({
        mutationFn: async (values: z.infer<typeof insertAracSchema>) => {
            const res = await fetch("/api/araclar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
            setIsOpen(false);
            form.reset();
            toast({ title: "Başarılı", description: "Araç eklendi" });
        },
        onError: (err) => {
            toast({
                title: "Hata",
                description: err.message,
                variant: "destructive",
            });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async (values: z.infer<typeof insertAracSchema> & { id: string }) => {
            const { id, ...data } = values;
            const res = await fetch(`/api/araclar/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
            setIsOpen(false);
            setEditingArac(null);
            form.reset();
            toast({ title: "Başarılı", description: "Araç güncellendi" });
        },
        onError: (err) => {
            toast({
                title: "Hata",
                description: err.message,
                variant: "destructive",
            });
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/araclar/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error(await res.text());
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/araclar"] });
            toast({ title: "Başarılı", description: "Araç silindi" });
        },
    });

    const onSubmit = (values: z.infer<typeof insertAracSchema>) => {
        if (editingArac) {
            updateMutation.mutate({ ...values, id: editingArac.id });
        } else {
            createMutation.mutate(values);
        }
    };

    const openEdit = (arac: Arac) => {
        setEditingArac(arac);
        form.reset({
            plaka: arac.plaka,
            trafikPoliceNo: arac.trafikPoliceNo,
            trafikBitisTarihi: arac.trafikBitisTarihi,
            kaskoPoliceNo: arac.kaskoPoliceNo || "",
            kaskoBitisTarihi: arac.kaskoBitisTarihi || "",
        });
        setIsOpen(true);
    };

    const getExpirationStatus = (dateStr?: string | null) => {
        if (!dateStr) return "text-muted-foreground"; // No date
        const date = parseISO(dateStr);
        const today = new Date();
        const warningDate = addDays(today, 30); // Use 30 days warning

        if (isBefore(date, today)) return "text-red-500 font-bold";
        if (isBefore(date, warningDate)) return "text-orange-500 font-bold";
        return "text-green-600";
    };

    return (
        <div className="p-6 space-y-6">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                        <Wrench className="w-6 h-6" />
                        Araçlar
                    </CardTitle>
                    <Dialog open={isOpen} onOpenChange={(open) => {
                        setIsOpen(open);
                        if (!open) {
                            setEditingArac(null);
                            form.reset();
                        }
                    }}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="w-4 h-4 mr-2" />
                                Yeni Araç Ekle
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>{editingArac ? "Araç Düzenle" : "Yeni Araç Ekle"}</DialogTitle>
                            </DialogHeader>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="plaka"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Plaka</FormLabel>
                                                <FormControl>
                                                    <Input placeholder="34 ABC 123" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <div className="space-y-4 border rounded-md p-4">
                                        <h4 className="font-medium text-sm text-muted-foreground">Trafik Sigortası</h4>
                                        <FormField
                                            control={form.control}
                                            name="trafikPoliceNo"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Poliçe No</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="12345678" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="trafikBitisTarihi"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Bitiş Tarihi</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <div className="space-y-4 border rounded-md p-4">
                                        <h4 className="font-medium text-sm text-muted-foreground">Kasko (Opsiyonel)</h4>
                                        <FormField
                                            control={form.control}
                                            name="kaskoPoliceNo"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Poliçe No</FormLabel>
                                                    <FormControl>
                                                        <Input placeholder="Opsiyonel" {...field} value={field.value || ""} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="kaskoBitisTarihi"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Bitiş Tarihi</FormLabel>
                                                    <FormControl>
                                                        <Input type="date" {...field} value={field.value || ""} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>
                                    <Button type="submit" className="w-full">
                                        {editingArac ? "Güncelle" : "Kaydet"}
                                    </Button>
                                </form>
                            </Form>
                        </DialogContent>
                    </Dialog>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div>Yükleniyor...</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Plaka</TableHead>
                                    <TableHead>Poliçe (Trafik / Kasko)</TableHead>
                                    <TableHead>Bitiş (Trafik / Kasko)</TableHead>
                                    <TableHead className="w-[100px]">İşlemler</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {araclar?.map((arac) => (
                                    <TableRow key={arac.id}>
                                        <TableCell className="font-medium">{arac.plaka}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-sm">Tr: {arac.trafikPoliceNo}</span>
                                                {arac.kaskoPoliceNo && <span className="text-sm text-muted-foreground">Ks: {arac.kaskoPoliceNo}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className={getExpirationStatus(arac.trafikBitisTarihi)}>
                                                    Tr: {arac.trafikBitisTarihi ? format(parseISO(arac.trafikBitisTarihi), "d MMM yyyy", { locale: tr }) : "-"}
                                                </span>
                                                {arac.kaskoBitisTarihi && (
                                                    <span className={getExpirationStatus(arac.kaskoBitisTarihi)}>
                                                        Ks: {format(parseISO(arac.kaskoBitisTarihi), "d MMM yyyy", { locale: tr })}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => openEdit(arac)}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive"
                                                    onClick={() => {
                                                        if (confirm("Bu aracı silmek istediğinize emin misiniz?")) {
                                                            deleteMutation.mutate(arac.id);
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {!araclar?.length && (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                                            Kayıtlı araç bulunamadı.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
