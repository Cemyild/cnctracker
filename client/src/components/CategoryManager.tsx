import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Category = {
  id: string;
  name: string;
};

interface CategoryManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CategoryManager({ open, onOpenChange }: CategoryManagerProps) {
  const [newCategory, setNewCategory] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Kategori eklenemedi");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setNewCategory("");
      toast({ title: "Başarılı", description: "Kategori eklendi" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Hata", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Silinemedi");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Başarılı", description: "Kategori silindi" });
    },
  });

  const handleAdd = () => {
    if (!newCategory.trim()) return;
    addMutation.mutate(newCategory.trim().toUpperCase());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Kategori Yönetimi</DialogTitle>
        </DialogHeader>
        
        <div className="flex gap-2 py-4">
          <Input 
            value={newCategory} 
            onChange={(e) => setNewCategory(e.target.value)} 
            placeholder="Yeni kategori adı..."
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={addMutation.isPending}>
            {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-md p-2">
            {isLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>
            ) : categories?.length === 0 ? (
                <div className="text-center text-muted-foreground p-4">Kategori bulunamadı.</div>
            ) : (
                categories?.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between bg-muted/30 p-2 rounded hover:bg-muted">
                        <span className="font-medium text-sm">{cat.name}</span>
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate(cat.id)}
                            disabled={deleteMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                ))
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
