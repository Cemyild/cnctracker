import { useQuery, useMutation } from "@tanstack/react-query";
import { type Survey, type SurveyResponse } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Copy, ExternalLink, Leaf, Plus, Edit, BarChart, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";

function ScoreHeatmap({ score }: { score: number }) {
  let color = "bg-green-500";
  if (score < 50) color = "bg-red-500";
  else if (score < 80) color = "bg-yellow-500";
  
  return (
    <div className="flex items-center gap-2">
      <span className="font-semibold text-sm w-8">{score.toFixed(0)}</span>
      <Progress value={score} className={`h-2 w-24 ${color}`} />
    </div>
  );
}

function SurveyResponses({ survey, responses, isLoading }: { survey: Survey, responses: SurveyResponse[] | undefined, isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-[200px] w-full mt-4" />;
  if (!responses?.length) return <div className="text-center py-8 text-muted-foreground">Henüz yanıt bulunmuyor.</div>;

  const { toast } = useToast();
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/surveys/responses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({ title: "Başarılı", description: "Yanıt silindi." });
    }
  });

  return (
    <Table className="mt-4">
      <TableHeader>
        <TableRow>
          <TableHead>Firma / Müşteri</TableHead>
          <TableHead>Tarih</TableHead>
          <TableHead>Ortalama Skor</TableHead>
          <TableHead className="text-right">Detay</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {responses.map((resp) => (
          <TableRow key={resp.id}>
            <TableCell className="font-medium">{resp.customerName || "İsimsiz Yanıt"}</TableCell>
            <TableCell>
              {resp.submittedAt ? format(new Date(resp.submittedAt), "dd MMM yyyy, HH:mm", { locale: tr }) : "-"}
            </TableCell>
            <TableCell>
              <ScoreHeatmap score={Number(resp.averageScore)} />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm">Görüntüle</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{resp.customerName || "İsimsiz Yanıt"} - Yanıt Detayları</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      {!!resp.contactInfo && Object.keys(resp.contactInfo as Record<string, string>).length > 0 && (
                        <div className="grid gap-2 p-4 bg-slate-50 rounded-lg border text-sm mb-4">
                          <h4 className="font-semibold text-xs text-primary uppercase tracking-wider mb-2">Müşteri / İletişim Bilgileri</h4>
                          {Object.entries(resp.contactInfo as Record<string, string>).map(([id, val]) => {
                            const fieldDef = Array.isArray(survey.contactFields) && survey.contactFields.find((f:any) => f.id === id);
                            const label = fieldDef ? fieldDef.label : (id === 'legacy' ? (survey.identityLabel || "Bilgi") : id);
                            return (
                              <div key={id} className="flex flex-col">
                                <span className="text-muted-foreground font-medium text-xs">{String(label)}</span>
                                <span>{val as string || "-"}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="grid gap-4">
                        {Array.isArray(resp.answers) && resp.answers.map((ans: any, idx: number) => {
                          const qList = Array.isArray(survey.questions) ? survey.questions : [];
                          const question = qList.find((q: any) => q.id === ans.questionId);
                          return (
                            <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0 p-2">
                              {question?.type === 'text' ? (
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{question?.text || `Soru ID: ${ans.questionId}`}</p>
                                  <p className="text-sm text-foreground mt-2 bg-white p-3 rounded-md border text-left whitespace-pre-wrap">{ans.textValue || "Yanıt yok"}</p>
                                </div>
                              ) : (
                                <>
                                  <div className="flex-1 pr-4">
                                    <p className="text-sm font-medium">{question?.text || `Soru ID: ${ans.questionId}`}</p>
                                  </div>
                                  <div className="w-48">
                                    <ScoreHeatmap score={Number(ans.adjustedScore)} />
                                    <p className="text-xs text-muted-foreground mt-1 text-right">Verilen Puan: {ans.score}/5</p>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {resp.comments && (
                        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                          <h4 className="text-sm font-semibold mb-2">Ek Yorumlar</h4>
                          <p className="text-sm text-foreground">{resp.comments}</p>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="ghost" size="icon" onClick={() => {
                  if (confirm("Bu yanıtı silmek istediğinize emin misiniz?")) {
                     deleteMutation.mutate(resp.id);
                  }
                }}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SurveyCard({ survey, isActive, onSelect, onEdit }: { survey: Survey, isActive: boolean, onSelect: () => void, onEdit: () => void }) {
  const { toast } = useToast();
  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/survey/${survey.id}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Kopyalandı", description: "Bağlantı panoya kopyalandı." });
  };

  return (
    <Card className={`cursor-pointer transition-colors ${isActive ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`} onClick={onSelect}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">{survey.title}</CardTitle>
            <CardDescription className="line-clamp-2 mt-1">{survey.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleCopyLink}>
          <Copy className="h-3 w-3 mr-1" /> Link
        </Button>
        <Button variant="outline" size="sm" asChild onClick={(e) => e.stopPropagation()}>
          <a href={`/survey/${survey.id}`} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3 w-3 mr-1" /> Aç
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
          <Edit className="h-3 w-3 mr-1" /> Düzenle
        </Button>
      </CardFooter>
    </Card>
  );
}

function SurveyFormModal({ defaultSurvey, defaultQuestions, open, onOpenChange }: { 
  defaultSurvey?: Survey; 
  defaultQuestions?: string;
  open: boolean; 
  onOpenChange: (open: boolean) => void 
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questionsText, setQuestionsText] = useState("");
  const [contactFields, setContactFields] = useState<{id: string, label: string, placeholder: string, required: boolean}[]>([]);
  const [feedbackFields, setFeedbackFields] = useState<{id: string, text: string, required: boolean}[]>([]);
  const [isAddingFeedback, setIsAddingFeedback] = useState(false);
  const [newFeedback, setNewFeedback] = useState({ text: '', required: true });
  const [isAddingField, setIsAddingField] = useState(false);
  const [newField, setNewField] = useState({ label: '', placeholder: '', required: true });

  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setTitle(defaultSurvey?.title || "");
      setDescription(defaultSurvey?.description || "");
      setQuestionsText(defaultQuestions || "");
      
      let fields = Array.isArray(defaultSurvey?.contactFields) ? defaultSurvey.contactFields : [];
      if (fields.length === 0 && defaultSurvey?.identityLabel) {
        fields = [{ id: 'legacy', label: defaultSurvey.identityLabel, placeholder: 'Lütfen giriniz', required: defaultSurvey.requireIdentity !== 0 }];
      }
      setContactFields(fields);
      setIsAddingField(false);
      let fFields = Array.isArray(defaultSurvey?.questions) ? defaultSurvey.questions.filter((q: any) => q.type === 'text') : [];
      setFeedbackFields(fFields.map((f:any) => ({ id: f.id, text: f.text, required: !!f.required })));
      setIsAddingFeedback(false);
    }
  }, [open, defaultSurvey, defaultQuestions]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      let res;
      if (defaultSurvey?.id) {
        res = await apiRequest("PUT", `/api/surveys/${defaultSurvey.id}`, data);
      } else {
        res = await apiRequest("POST", `/api/surveys`, data);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({ title: "Başarılı", description: "Anket kaydedildi." });
      onOpenChange(false);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = questionsText.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) {
      toast({ title: "Eksik", description: "En az bir soru girmelisiniz.", variant: "destructive" });
      return;
    }
    const ratingQuestions = lines.map((text, idx) => ({ id: `q${idx + 1}`, text, type: "rating" }));
    const feedbackQuestions = feedbackFields.map((f, idx) => ({ id: f.id || `f${idx + 1}_${Date.now()}`, text: f.text, type: "text", required: f.required }));
    const questions = [...ratingQuestions, ...feedbackQuestions];
    
    saveMutation.mutate({
      title,
      description,
      questions,
      isActive: 1,
      contactFields
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{defaultSurvey ? "Anketi Düzenle" : "Yeni Anket Oluştur"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label>Anket Başlığı</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Açıklama (Müşterinin Göreceği Yazı)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[100px]" required />
          </div>

          <div className="space-y-4 border p-4 rounded-lg bg-slate-50">
            <div className="flex justify-between items-center">
              <Label className="text-base font-semibold">Bilgi Alanları (Firma, Ad Soyad vb.)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddingField(true)}>
                <Plus className="h-4 w-4 mr-1" /> Kutu Ekle
              </Button>
            </div>
            
            {contactFields.length > 0 && (
              <div className="space-y-2">
                {contactFields.map((cf, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white p-3 border rounded shadow-sm">
                    <div>
                      <p className="font-medium text-sm">{cf.label} {cf.required && <span className="text-red-500">*</span>}</p>
                      {cf.placeholder && <p className="text-xs text-muted-foreground">{cf.placeholder}</p>}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setContactFields(prev => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {isAddingField && (
              <div className="bg-white p-4 border flex flex-col gap-3 rounded shadow-sm border-primary/20">
                <Input 
                  placeholder="Kutu Açıklaması (Örn: Firma Adı, Ad Soyad)" 
                  value={newField.label} 
                  onChange={e => setNewField({...newField, label: e.target.value})}
                  autoFocus
                />
                <Input 
                  placeholder="Yönlendirici Açıklama (Opsiyonel)" 
                  value={newField.placeholder} 
                  onChange={e => setNewField({...newField, placeholder: e.target.value})}
                />
                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox" 
                    id="reqField" 
                    checked={newField.required} 
                    onChange={e => setNewField({...newField, required: e.target.checked})}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="reqField">Zorunlu Alan</Label>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingField(false)}>İptal</Button>
                  <Button type="button" size="sm" onClick={() => {
                    if(!newField.label.trim()) return toast({title:"Hata", description:"Lütfen kutu açıklaması girin.", variant:"destructive"});
                    setContactFields(prev => [...prev, { id: `cf_${Date.now()}`, ...newField }]);
                    setNewField({ label: '', placeholder: '', required: true });
                    setIsAddingField(false);
                  }}>Ekle</Button>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Puanlama Soruları (Her satıra bir soru yazın)</Label>
            <Textarea 
              value={questionsText} 
              onChange={(e) => setQuestionsText(e.target.value)} 
              className="min-h-[200px]"
              placeholder="Hizmet hızımızdan memnun musunuz?&#10;İletişimimiz nasıldı?"
              required 
            />
          </div>

          <div className="space-y-4 border p-4 rounded-lg bg-slate-50">
            <div className="flex justify-between items-center">
              <Label className="text-base font-semibold">Geri Bildirim Soruları (Yazılı Yanıtlar)</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddingFeedback(true)}>
                <Plus className="h-4 w-4 mr-1" /> Soru Ekle
              </Button>
            </div>
            
            {feedbackFields.length > 0 && (
              <div className="space-y-2">
                {feedbackFields.map((f, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white p-3 border rounded shadow-sm">
                    <div>
                      <p className="font-medium text-sm">{f.text} {f.required && <span className="text-red-500">*</span>}</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setFeedbackFields(prev => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {isAddingFeedback && (
              <div className="bg-white p-4 border flex flex-col gap-3 rounded shadow-sm border-primary/20">
                <Input 
                  placeholder="Geri bildirim sorunuz (Örn: Önerileriniz nelerdir?)" 
                  value={newFeedback.text} 
                  onChange={e => setNewFeedback({...newFeedback, text: e.target.value})}
                  autoFocus
                />
                <div className="flex items-center space-x-2">
                  <input 
                    type="checkbox" 
                    id="reqFeedback" 
                    checked={newFeedback.required} 
                    onChange={e => setNewFeedback({...newFeedback, required: e.target.checked})}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="reqFeedback">Zorunlu Alan</Label>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingFeedback(false)}>İptal</Button>
                  <Button type="button" size="sm" onClick={() => {
                    if(!newFeedback.text.trim()) return toast({title:"Hata", description:"Lütfen soru metni girin.", variant:"destructive"});
                    setFeedbackFields(prev => [...prev, { id: `fb_${Date.now()}`, ...newFeedback }]);
                    setNewFeedback({ text: '', required: true });
                    setIsAddingFeedback(false);
                  }}>Ekle</Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Anketler() {
  const { toast } = useToast();
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editSurvey, setEditSurvey] = useState<Survey | undefined>(undefined);
  const [editQuestions, setEditQuestions] = useState<string>("");

  const { data: surveys, isLoading: isSurveysLoading } = useQuery<Survey[]>({
    queryKey: ["/api/surveys"],
  });

  const activeSurvey = surveys?.find(s => s.id === activeSurveyId) || surveys?.[0];

  useEffect(() => {
    if (activeSurvey && !activeSurveyId) {
      setActiveSurveyId(activeSurvey.id);
    }
  }, [activeSurvey, activeSurveyId]);

  const { data: responses, isLoading: isResponsesLoading } = useQuery<SurveyResponse[]>({
    queryKey: ["/api/surveys", activeSurvey?.id, "responses"],
    enabled: !!activeSurvey?.id,
  });

  const handleEdit = (survey: Survey) => {
    setEditSurvey(survey);
    const qList = Array.isArray(survey.questions) ? survey.questions : [];
    const qText = qList.filter((q: any) => q.type === 'rating' || !q.type).map((q: any) => q.text).join('\n');
    setEditQuestions(qText);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditSurvey(undefined);
    setEditQuestions("");
    setIsModalOpen(true);
  };

  if (isSurveysLoading) {
    return <div className="p-8"><Skeleton className="h-[400px] w-full" /></div>;
  }

  return (
    <div className="flex-1 flex flex-col space-y-4 p-4 md:p-8 pt-6 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Anketler</h2>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> Yeni Anket
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Mevcut Anketler</h3>
          {!surveys?.length ? (
            <div className="p-8 text-center border rounded-lg bg-muted/20 text-muted-foreground">
              Sistemde hiç anket bulunamadı.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {surveys.map(s => (
                <SurveyCard 
                  key={s.id} 
                  survey={s} 
                  isActive={activeSurvey?.id === s.id}
                  onSelect={() => setActiveSurveyId(s.id)}
                  onEdit={() => handleEdit(s)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {activeSurvey ? (
            <Card className="h-full border-t-4 border-t-primary shadow-sm flex flex-col">
              <CardHeader className="bg-muted/10 border-b">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-xl flex items-center">
                    <BarChart className="h-5 w-5 mr-2 text-primary" />
                    {activeSurvey.title} - Sonuçları
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto p-4">
                <SurveyResponses survey={activeSurvey} responses={responses} isLoading={isResponsesLoading} />
              </CardContent>
            </Card>
          ) : (
            <div className="h-full flex items-center justify-center border rounded-lg border-dashed p-8 text-muted-foreground">
              Detayları görmek için sol taraftan bir anket seçin.
            </div>
          )}
        </div>
      </div>

      <SurveyFormModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        defaultSurvey={editSurvey} 
        defaultQuestions={editQuestions} 
      />
    </div>
  );
}
