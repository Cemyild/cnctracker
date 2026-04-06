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

  const [customerName, setCustomerName] = useState("");
  const [comments, setComments] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
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
    
    // Check if all questions are answered
    const unanswered = questionsList.filter((q: any) => q.type === 'rating' && !answers[q.id]);
    if (unanswered.length > 0) {
      toast({
        title: "Eksik Alanlar",
        description: "Lütfen tüm soruları oylayın.",
        variant: "destructive"
      });
      return;
    }

    if (!customerName.trim()) {
      toast({
        title: "Eksik Alanlar",
        description: "Lütfen firma/müşteri adını girin.",
        variant: "destructive"
      });
      return;
    }

    const formattedAnswers = Object.entries(answers).map(([qId, score]) => {
      // 1:20, 2:40, 3:60, 4:80, 5:100
      const adjustedScore = score * 20;
      return { questionId: qId, score, adjustedScore };
    });

    const averageScore = formattedAnswers.reduce((acc, curr) => acc + curr.adjustedScore, 0) / (formattedAnswers.length || 1);

    submitMutation.mutate({
      surveyId,
      customerName,
      answers: formattedAnswers,
      averageScore,
      comments
    });
  };

  if (!surveyId) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50"><p>Geçersiz Anket Bağlantısı</p></div>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
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
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-red-500"><p>Anket bulunamadı veya yüklenemedi.</p></div>;
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
        <Card className="w-full max-w-lg text-center p-8">
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

  return (
    <div className="min-h-screen py-12 px-4 bg-slate-50">
      <div className="max-w-3xl mx-auto">
        <Card className="border-t-4 border-t-primary shadow-lg">
          <CardHeader className="text-center pb-8 border-b">
            <CardTitle className="text-3xl font-bold tracking-tight text-primary mb-2">{survey.title}</CardTitle>
            <CardDescription className="text-base text-muted-foreground whitespace-pre-wrap">{survey.description}</CardDescription>
          </CardHeader>
          <CardContent className="pt-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-3 bg-slate-50 p-6 rounded-lg border">
                <Label htmlFor="customerName" className="text-base font-semibold">Firma / Ad Soyad <span className="text-red-500">*</span></Label>
                <Input 
                  id="customerName" 
                  placeholder="Firma unvanı veya adınızı giriniz" 
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-white"
                  autoFocus
                />
              </div>

              <div className="space-y-6">
                <div className="bg-slate-100 p-4 rounded text-sm text-center mb-6 text-muted-foreground">
                  Lütfen aşağıdaki alanları 1 (En Düşük) ile 5 (En Yüksek) arasında değerlendiriniz.
                </div>
                
                {questionsList.map((q: any, idx: number) => (
                  <div key={q.id} className="p-6 rounded-lg border shadow-sm bg-white transition-all hover:border-primary/50">
                    <Label className="text-base font-medium mb-4 block leading-relaxed">
                      <span className="text-primary font-bold mr-2">{idx + 1}.</span> 
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
                              ? 'bg-primary text-primary-foreground border-primary scale-110 shadow-md' 
                              : 'bg-white text-muted-foreground border-slate-200 hover:border-primary/50 hover:bg-slate-50'}
                          `}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

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
                  className="w-full sm:w-auto px-8 py-6 text-lg"
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
