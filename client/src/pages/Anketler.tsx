import { useQuery, useMutation } from "@tanstack/react-query";
import { type Survey, type SurveyResponse } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Link } from "wouter";
import { Copy, Navigation, ExternalLink, Leaf } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

export default function Anketler() {
  const { toast } = useToast();

  const { data: surveys, isLoading: isSurveysLoading } = useQuery<Survey[]>({
    queryKey: ["/api/surveys"],
  });

  // For simplicity, we just pick the first survey if it exists
  const activeSurvey = surveys?.[0];

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/surveys/seed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({ title: "Başarılı", description: "Varsayılan anket oluşturuldu." });
    }
  });

  const { data: responses, isLoading: isResponsesLoading } = useQuery<SurveyResponse[]>({
    queryKey: ["/api/surveys", activeSurvey?.id, "responses"],
    enabled: !!activeSurvey?.id,
  });

  const handleCopyLink = () => {
    if (!activeSurvey) return;
    const url = `${window.location.origin}/survey/${activeSurvey.id}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Bağlantı Kopyalandı",
      description: "Anket bağlantısı panoya kopyalandı.",
    });
  };

  if (isSurveysLoading) {
    return <div className="p-8"><Skeleton className="h-[400px] w-full" /></div>;
  }

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Anketler</h2>
      </div>

      {!activeSurvey ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground flex flex-col items-center gap-4">
            <p>Sistemde aktif bir anket bulunamadı. Lütfen varsayılan anketi oluşturun.</p>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Leaf className="mr-2 h-4 w-4" />
              Müşteri Memnuniyet Anketi Oluştur
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{activeSurvey.title}</CardTitle>
                  <CardDescription>{activeSurvey.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCopyLink} size="sm">
                    <Copy className="h-4 w-4 mr-2" />
                    Linki Kopyala
                  </Button>
                  <Button variant="default" size="sm" asChild>
                    <a href={`/survey/${activeSurvey.id}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Aç
                    </a>
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Yanıtlar</CardTitle>
            </CardHeader>
            <CardContent>
              {isResponsesLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : !responses?.length ? (
                <div className="text-center py-4 text-muted-foreground">
                  Henüz yanıt bulunmuyor.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Firma / Müşteri</TableHead>
                      <TableHead>Tarih</TableHead>
                      <TableHead>Ortalama Skor</TableHead>
                      <TableHead className="text-right">İşlem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {responses.map((resp) => (
                      <TableRow key={resp.id}>
                        <TableCell className="font-medium">{resp.customerName}</TableCell>
                        <TableCell>
                          {resp.submittedAt ? format(new Date(resp.submittedAt), "dd MMM yyyy, HH:mm", { locale: tr }) : "-"}
                        </TableCell>
                        <TableCell>
                          <ScoreHeatmap score={Number(resp.averageScore)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">Detay Gör</Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>{resp.customerName} - Yanıt Detayları</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 mt-4">
                                <div className="grid gap-4">
                                  {Array.isArray(resp.answers) && resp.answers.map((ans: any, idx: number) => {
                                    // Find question text
                                    const qList = Array.isArray(activeSurvey.questions) ? activeSurvey.questions : [];
                                    const question = qList.find((q: any) => q.id === ans.questionId);
                                    
                                    return (
                                      <div key={idx} className="flex justify-between items-center border-b pb-2 last:border-0 p-2">
                                        <div className="flex-1 pr-4">
                                          <p className="text-sm font-medium">{question?.text || `Soru ID: ${ans.questionId}`}</p>
                                        </div>
                                        <div className="w-48">
                                          <ScoreHeatmap score={Number(ans.adjustedScore)} />
                                          <p className="text-xs text-muted-foreground mt-1 text-right">Verilen Puan: {ans.score}/5</p>
                                        </div>
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
