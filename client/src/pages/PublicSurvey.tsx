import { useQuery, useMutation } from "@tanstack/react-query";
import { type Survey } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { useRoute } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2 } from "lucide-react";

export default function PublicSurvey() {
  const [, params] = useRoute("/survey/:id");
  const surveyId = params?.id;
  const { toast } = useToast();

  const [contactInfo, setContactInfo] = useState<Record<string, string>>({});
  const [comments, setComments] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const { data: survey, isLoading, error } = useQuery<Survey>({
    queryKey: [`/api/surveys/${surveyId}`],
    enabled: !!surveyId,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/surveys/submit", data);
      return res.json();
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Başarılı",
        description: "Anketiniz başarıyla kaydedildi. Değerli geri bildiriminiz için teşekkür ederiz.",
      });
    },
    onError: () => {
      toast({
        title: "Hata",
        description: "Anket kaydedilirken bir hata oluştu. Lütfen tekrar deneyin.",
        variant: "destructive"
      });
    }
  });

  const handleRating = (questionId: string, score: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: score }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!survey || !surveyId) return;

    const questionsList = Array.isArray(survey.questions) ? survey.questions : [];
    const ratingQuestions = questionsList.filter((q: any) => q.type === 'rating' || !q.type);
    const feedbackQuestions = questionsList.filter((q: any) => q.type === 'text');
    
    // Check if all rating questions are answered
    const unansweredRating = ratingQuestions.filter((q: any) => !answers[q.id]);
    if (unansweredRating.length > 0) {
      toast({
        title: "Eksik Alanlar",
        description: "Lütfen tüm soruları oylayın.",
        variant: "destructive"
      });
      return;
    }

    let fields = Array.isArray(survey.contactFields) ? survey.contactFields : [];
    if (fields.length === 0 && survey.identityLabel) {
       fields = [{ id: 'legacy', label: survey.identityLabel, placeholder: 'Lütfen giriniz', required: survey.requireIdentity !== 0 }];
    }

    let hasError = false;
    fields.forEach((f: any) => {
      if (f.required && !(contactInfo[f.id] || "").trim()) {
        if (!hasError) {
          toast({
            title: "Eksik Alanlar",
            description: `Lütfen "${f.label}" alanını girin.`,
            variant: "destructive"
          });
          hasError = true;
        }
      }
    });

    if (hasError) return;

    let hasFeedbackError = false;
    feedbackQuestions.forEach((q: any) => {
      if (q.required && !(textAnswers[q.id] || "").trim()) {
        if (!hasFeedbackError) {
          toast({
            title: "Eksik Alanlar",
            description: `Lütfen zorunlu geri bildirim sorularını doldurun.`,
            variant: "destructive"
          });
          hasFeedbackError = true;
        }
      }
    });

    if (hasFeedbackError) return;

    const formattedRatingAnswers = Object.entries(answers).map(([qId, score]) => {
      // 1:20, 2:40, 3:60, 4:80, 5:100
      const adjustedScore = score * 20;
      return { questionId: qId, score, adjustedScore };
    });

    const formattedFeedbackAnswers = Object.entries(textAnswers).map(([qId, textValue]) => {
      return { questionId: qId, textValue, score: null, adjustedScore: null };
    });

    const formattedAnswers = [...formattedRatingAnswers, ...formattedFeedbackAnswers];
    const averageScore = formattedRatingAnswers.length > 0 ? (formattedRatingAnswers.reduce((acc, curr) => acc + curr.adjustedScore, 0) / formattedRatingAnswers.length) : 0;

    const primaryName = fields.length > 0 ? (contactInfo[fields[0].id] || "") : "İsimsiz Yanıt";

    submitMutation.mutate({
      surveyId: survey!.id,
      customerName: primaryName,
      contactInfo,
      answers: formattedAnswers,
      averageScore,
      comments
    });
  };

  if (!surveyId) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-slate-50"><p>Geçersiz Anket Bağlantısı</p></div>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
        <Card className="w-full max-w-2xl">
          <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !survey) {
    return <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 text-red-500"><p>Anket bulunamadı veya yüklenemedi.</p></div>;
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-slate-50">
        <Card className="w-full max-w-lg text-center p-8 border-t-4 border-t-slate-900 shadow-lg">
          <div className="flex justify-center mb-8">
            <img src="/CNC_tranparanLOGO.png" alt="CNC Logo" className="h-40 max-w-full object-contain" />
          </div>
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <CardTitle className="text-2xl mb-2">Teşekkür Ederiz</CardTitle>
          <CardDescription className="text-base">
            Geri bildiriminiz başarıyla kaydedilmiştir. Sizlere daha iyi hizmet verebilmek için görüşlerinizi önemsiyoruz.
          </CardDescription>
        </Card>
      </div>
    );
  }

  const questionsList = Array.isArray(survey.questions) ? survey.questions : [];
  const ratingQuestions = questionsList.filter((q: any) => q.type === 'rating' || !q.type);
  const feedbackQuestions = questionsList.filter((q: any) => q.type === 'text');
  
  let fieldsToRender = Array.isArray(survey.contactFields) ? survey.contactFields : [];
  if (fieldsToRender.length === 0 && survey.identityLabel) {
     fieldsToRender = [{ id: 'legacy', label: survey.identityLabel, placeholder: 'Lütfen giriniz', required: survey.requireIdentity !== 0 }];
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center py-12 px-4 bg-slate-50">
      <div className="w-full max-w-3xl mx-auto">
        <Card className="border-t-4 border-t-slate-900 shadow-lg">
          <CardHeader className="text-center pb-8 border-b">
            <div className="flex justify-center mb-6">
              <img src="/CNC_tranparanLOGO.png" alt="CNC Logo" className="h-40 max-w-full object-contain" />
            </div>
            <CardTitle className="text-3xl font-bold tracking-tight text-slate-900 mb-2">{survey.title}</CardTitle>
            <CardDescription className="text-base text-muted-foreground whitespace-pre-wrap">{survey.description}</CardDescription>
          </CardHeader>
          <CardContent className="pt-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              {fieldsToRender.length > 0 && fieldsToRender.map((f: any) => (
                <div key={f.id} className="space-y-3 bg-slate-50 p-6 rounded-lg border">
                  <Label htmlFor={f.id} className="text-base font-semibold">
                    {f.label} {f.required && <span className="text-red-500">*</span>}
                  </Label>
                  <Input 
                    id={f.id} 
                    placeholder={f.placeholder || ""} 
                    value={contactInfo[f.id] || ""}
                    onChange={(e) => setContactInfo(prev => ({ ...prev, [f.id]: e.target.value }))}
                    className="bg-white"
                  />
                </div>
              ))}

              <div className="space-y-6">
                <div className="bg-slate-100 p-4 rounded text-sm text-center mb-6 text-muted-foreground">
                  Lütfen aşağıdaki alanları 1 (En Düşük) ile 5 (En Yüksek) arasında değerlendiriniz.
                </div>
                
                {ratingQuestions.map((q: any, idx: number) => (
                  <div key={q.id} className="p-6 rounded-lg border shadow-sm bg-white transition-all hover:border-slate-900/50">
                    <Label className="text-base font-medium mb-4 block leading-relaxed">
                      <span className="text-slate-900 font-bold mr-2">{idx + 1}.</span> 
                      {q.text} <span className="text-red-500">*</span>
                    </Label>
                    <div className="flex flex-wrap gap-3 mt-4">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          type="button"
                          onClick={() => handleRating(q.id, score)}
                          className={`
                            w-12 h-12 rounded-full font-bold text-lg transition-all
                            flex items-center justify-center border-2
                            ${answers[q.id] === score 
                              ? 'bg-slate-900 text-white border-slate-900 scale-110 shadow-md' 
                              : 'bg-white text-muted-foreground border-slate-200 hover:border-slate-900/50 hover:bg-slate-50'}
                          `}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {feedbackQuestions.length > 0 && (
                <div className="space-y-6">
                  {feedbackQuestions.map((q: any, idx: number) => (
                    <div key={q.id} className="p-6 rounded-lg border shadow-sm bg-white transition-all hover:border-slate-900/50">
                      <Label className="text-base font-medium mb-4 block leading-relaxed">
                        <span className="text-slate-900 font-bold mr-2">{ratingQuestions.length + idx + 1}.</span> 
                        {q.text} {q.required && <span className="text-red-500">*</span>}
                      </Label>
                      <Textarea 
                        placeholder="Yanıtınızı buraya yazabilirsiniz..." 
                        value={textAnswers[q.id] || ""}
                        onChange={(e) => setTextAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                        className="bg-white min-h-[100px] mt-4 text-base p-4"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-3 p-6 rounded-lg border bg-white shadow-sm">
                <Label htmlFor="comments" className="text-base font-medium">Eklemek istediğiniz görüş veya önerileriniz (Opsiyonel)</Label>
                <Textarea 
                  id="comments" 
                  placeholder="Görüşlerinizi buraya yazabilirsiniz..." 
                  className="min-h-[120px] resize-y"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>

              <div className="pt-4 flex justify-end">
                <Button 
                  type="submit" 
                  size="lg" 
                  className="w-full sm:w-auto px-8 py-6 text-lg bg-slate-900 hover:bg-slate-800 text-white"
                  disabled={submitMutation.isPending}
                >
                  {submitMutation.isPending ? "Gönderiliyor..." : "Anketi Gönder"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
