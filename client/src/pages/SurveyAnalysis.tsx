import { useQuery, useMutation } from "@tanstack/react-query";
import { type Survey, type SurveyResponse } from "@shared/schema";
import { useRoute } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function SurveyAnalysis() {
  const [, params] = useRoute("/anket-sonuclari/:id");
  const surveyId = params?.id;
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/surveys/responses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId, "responses"] });
      toast({ title: "Başarılı", description: "Yanıt silindi." });
    }
  });

  const { data: survey, isLoading: isSurveyLoading } = useQuery<Survey>({
    queryKey: [`/api/surveys/${surveyId}`],
    enabled: !!surveyId,
  });

  const { data: responses, isLoading: isResponsesLoading } = useQuery<SurveyResponse[]>({
    queryKey: ["/api/surveys", surveyId, "responses"],
    enabled: !!surveyId,
  });

  if (isSurveyLoading || isResponsesLoading) {
    return <div className="p-8"><Skeleton className="h-[400px] w-full" /></div>;
  }

  if (!survey) {
    return <div className="p-8 text-center text-red-500">Anket bulunamadı.</div>;
  }

  const questionsList = Array.isArray(survey.questions) ? survey.questions : [];
  const ratingQuestions = questionsList.filter((q: any) => q.type === 'rating' || !q.type);
  const textQuestions = questionsList.filter((q: any) => q.type === 'text');
  
  const targetScore = survey.targetScore ?? 80;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50";
    if (score >= 60) return "text-yellow-600 bg-yellow-50";
    if (score > 0) return "text-red-600 bg-red-50";
    return "text-slate-500 bg-slate-50";
  };

  const calculateQuestionAverage = (qId: string) => {
    if (!responses || responses.length === 0) return 0;
    let sum = 0;
    let count = 0;
    responses.forEach(r => {
      const answers = Array.isArray(r.answers) ? r.answers : [];
      const ans = answers.find((a: any) => a.questionId === qId);
      if (ans && ans.adjustedScore != null) {
        sum += ans.adjustedScore;
        count++;
      }
    });
    return count > 0 ? (sum / count) : 0;
  };

  const getPersonAverage = (r: SurveyResponse) => {
    const answers = Array.isArray(r.answers) ? r.answers : [];
    let sum = 0;
    let count = 0;
    ratingQuestions.forEach(q => {
      const a = answers.find((ans: any) => ans.questionId === q.id);
      if (a && a.adjustedScore != null) {
        sum += a.adjustedScore;
        count++;
      }
    });
    return count > 0 ? (sum / count) : 0;
  };

  const globalAverage = ratingQuestions.reduce((acc, q) => acc + calculateQuestionAverage(q.id), 0) / (ratingQuestions.length || 1);

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white z-10 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => window.history.back()} size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Geri
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{survey.title}</h1>
            <p className="text-sm text-muted-foreground">Anket Analiz Sonuçları ({responses?.length || 0} Yanıt)</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right flex items-center gap-4 bg-slate-50 py-2 px-4 rounded-xl border">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-1">Genel Ortalama (Hedef: {targetScore})</p>
              <p className={`text-2xl font-bold ${getScoreColor(globalAverage).split(' ')[0]}`}>
                {globalAverage > 0 ? globalAverage.toFixed(2) : "0.00"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-8">
        <div className="bg-white border rounded-xl shadow-lg ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-xs text-slate-700 bg-slate-100 uppercase sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-4 font-bold w-16 whitespace-nowrap bg-slate-100 sticky left-0 z-30 border-b border-r border-slate-200">Sıra</th>
                  <th className="px-4 py-4 font-bold min-w-[250px] whitespace-nowrap bg-slate-100 sticky left-[64px] z-30 border-b border-r border-slate-200">Kişi / Firma</th>
                  {ratingQuestions.map((q, i) => (
                    <th key={q.id} className="px-3 py-4 font-bold text-center whitespace-nowrap border-b border-r border-slate-200 cursor-help" title={q.text}>
                      S{i + 1}
                    </th>
                  ))}
                  <th className="px-4 py-4 text-center font-extrabold whitespace-nowrap bg-slate-200 border-b border-slate-300">ORTALAMA</th>
                  <th className="px-4 py-4 text-center font-bold whitespace-nowrap bg-slate-100 border-b border-l border-slate-200">İŞLEM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {responses?.map((r, index) => {
                  let nameInfo = r.customerName || "İsimsiz Yanıt";
                  if (r.contactInfo && typeof r.contactInfo === 'object') {
                    const vals = Object.values(r.contactInfo).filter(Boolean);
                    if (vals.length > 0) nameInfo = vals.join(" - ");
                  }
                  
                  const avg = getPersonAverage(r);
                  
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3 font-medium text-slate-500 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-900 sticky left-[64px] bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 truncate max-w-[250px]" title={String(nameInfo)}>
                        <Dialog>
                          <DialogTrigger asChild>
                            <span className="cursor-pointer hover:underline text-primary font-semibold">{nameInfo}</span>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>{nameInfo} - Yanıt Detayları</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-6 mt-4">
                              {!!r.contactInfo && Object.keys(r.contactInfo as Record<string, string>).length > 0 && (
                                <div className="grid gap-2 p-4 bg-slate-50 rounded-lg border text-sm">
                                  <h4 className="font-semibold text-xs text-primary uppercase tracking-wider mb-2">Müşteri / İletişim Bilgileri</h4>
                                  {Object.entries(r.contactInfo as Record<string, string>).map(([id, val]) => {
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
                              
                              <div className="space-y-4">
                                <h4 className="font-semibold text-sm border-b pb-2">Puanlama Yanıtları</h4>
                                {ratingQuestions.map((q, idx) => {
                                  const ans = Array.isArray(r.answers) ? r.answers.find((a:any) => a.questionId === q.id) : null;
                                  return (
                                    <div key={q.id} className="flex justify-between items-start gap-4">
                                      <p className="text-sm flex-1">{idx + 1}. {q.text}</p>
                                      {ans && ans.adjustedScore != null ? (
                                        <div className={`px-3 py-1 rounded font-bold text-sm ${getScoreColor(ans.adjustedScore)}`}>
                                          {ans.adjustedScore}
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 text-sm">Yanıt yok</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              {textQuestions.length > 0 && (
                                <div className="space-y-4">
                                  <h4 className="font-semibold text-sm border-b pb-2">Yazılı Görüşler</h4>
                                  {textQuestions.map((q, idx) => {
                                    const ans = Array.isArray(r.answers) ? r.answers.find((a:any) => a.questionId === q.id) : null;
                                    return (
                                      <div key={q.id} className="space-y-2">
                                        <p className="text-sm font-medium">{q.text}</p>
                                        <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-md border whitespace-pre-wrap">{ans?.textValue || "Yanıt yok"}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {r.comments && (
                                <div className="p-4 bg-muted/50 rounded-lg">
                                  <h4 className="text-sm font-semibold mb-2">Genel Yorum</h4>
                                  <p className="text-sm text-foreground whitespace-pre-wrap">{r.comments}</p>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </td>
                      
                      {ratingQuestions.map(q => {
                        const ans = Array.isArray(r.answers) ? r.answers.find((a:any) => a.questionId === q.id) : null;
                        const score = ans ? ans.adjustedScore : null;
                        return (
                          <td key={q.id} className="px-2 py-3 text-center border-r border-slate-100">
                            {score != null ? (
                              <div className={`inline-block px-2 py-1 rounded font-semibold min-w-[40px] text-xs shadow-sm border border-transparent ${getScoreColor(score)}`}>
                                {score}
                              </div>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })}
                      
                      <td className={`px-4 py-3 text-center font-bold border-l-2 border-slate-200 bg-slate-50 group-hover:bg-slate-100 transition-colors ${getScoreColor(avg).split(' ')[0]}`}>
                        {avg > 0 ? avg.toFixed(2) : "-"}
                      </td>
                      <td className="px-4 py-3 text-center border-l border-slate-200">
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-red-50 hover:text-red-500" onClick={() => {
                          if (confirm("Bu yanıtı silmek istediğinize emin misiniz?")) {
                             deleteMutation.mutate(r.id);
                          }
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-100 z-20 font-bold border-t-2 border-slate-300">
                <tr>
                  <td className="px-4 py-4 text-slate-900 sticky left-0 z-30 bg-slate-100 border-r border-slate-200" colSpan={1}></td>
                  <td className="px-4 py-4 text-slate-900 sticky left-[64px] z-30 bg-slate-100 border-r border-slate-200 tracking-wide">GENEL ORTALAMA</td>
                  {ratingQuestions.map(q => {
                    const qAvg = calculateQuestionAverage(q.id);
                    return (
                      <td key={q.id} className={`px-3 py-4 text-center border-r border-slate-200 ${getScoreColor(qAvg).split(' ')[0]}`}>
                         {qAvg > 0 ? qAvg.toFixed(2) : "-"}
                      </td>
                    )
                  })}
                  <td className="px-4 py-4 text-center text-lg bg-slate-200 border-l border-slate-300 text-slate-900">
                    {globalAverage > 0 ? globalAverage.toFixed(2) : "-"}
                  </td>
                  <td className="px-4 py-4 bg-slate-100 border-l border-slate-200" colSpan={1}></td>
                </tr>
                <tr className="bg-slate-200/50 border-t border-slate-300">
                  <td className="px-4 py-3 text-slate-600 sticky left-0 z-30 bg-slate-200/50 border-r border-slate-300" colSpan={1}></td>
                  <td className="px-4 py-3 text-slate-600 sticky left-[64px] z-30 bg-slate-200/50 border-r border-slate-300 tracking-wide">HEDEF</td>
                  {ratingQuestions.map(q => (
                    <td key={q.id} className="px-3 py-3 text-center text-slate-600 border-r border-slate-300">
                       80
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center text-slate-600 bg-slate-300/50 border-l border-slate-300">
                    {targetScore}
                  </td>
                  <td className="px-4 py-3 bg-slate-200/50 border-l border-slate-300" colSpan={1}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
