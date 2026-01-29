
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, User, Loader2, Database, Table as TableIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  data?: any[];
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Merhaba! Gümrük ve finans verilerinizle ilgili bana soru sorabilirsiniz. Size nasıl yardımcı olabilirim?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom directly accessing the viewport element if possible or ref
  useEffect(() => {
    if (scrollAreaRef.current) {
        // Find the viewport within scroll area to scroll
        const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
             viewport.scrollTop = viewport.scrollHeight;
        }
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content }),
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.message,
        sql: data.sql,
        data: data.data,
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Üzgünüm, bir hata oluştu: " + error.message,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="h-[750px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          AI Asistan
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden relative">
        <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
          <div className="space-y-4 pb-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${
                  msg.role === "assistant" ? "justify-start" : "justify-end"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}

                <div className="max-w-[85%] space-y-2">
                  <div
                    className={`rounded-lg px-4 py-2 text-sm ${
                      msg.role === "assistant"
                        ? "bg-muted text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {msg.content}
                  </div>

                  {/* SQL Debug Info */}
                  {msg.sql && (
                    <div className="text-xs bg-slate-950 text-slate-300 p-2 rounded font-mono overflow-auto border border-slate-800">
                      <div className="flex items-center gap-1 mb-1 text-slate-500">
                        <Database className="w-3 h-3" />
                        SQL Query
                      </div>
                      {msg.sql}
                    </div>
                  )}

                  {/* Data Table Preview */}
                  {msg.data && msg.data.length > 0 && (
                     <div className="border rounded-md bg-card overflow-hidden text-xs">
                       <div className="bg-muted px-3 py-1 flex items-center gap-1 border-b">
                         <TableIcon className="w-3 h-3" />
                         Sonuçlar ({msg.data.length})
                       </div>
                       <div className="overflow-auto max-h-[300px]">
                         <Table>
                           <TableHeader>
                             <TableRow>
                               {Object.keys(msg.data[0]).map((key) => (
                                 <TableHead key={key} className="h-8 px-2 font-bold">{key}</TableHead>
                               ))}
                             </TableRow>
                           </TableHeader>
                           <TableBody>
                             {msg.data.slice(0, 10).map((row: any, i: number) => (
                               <TableRow key={i}>
                                 {Object.values(row).map((val: any, j: number) => (
                                   <TableCell key={j} className="py-1 px-2">
                                     {val !== null ? String(val) : "-"}
                                   </TableCell>
                                 ))}
                               </TableRow>
                             ))}
                           </TableBody>
                         </Table>
                       </div>
                       {msg.data.length > 10 && (
                          <div className="bg-muted/50 p-1 text-center text-xs text-muted-foreground">
                            {msg.data.length - 10} satır daha var...
                          </div>
                       )}
                     </div>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
               <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                  <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Düşünüyor...</span>
                  </div>
               </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2 w-full">
          <Input
            placeholder="Bir soru sorun... (örn: 'Ocak ayında en yüksek satış?')"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" disabled={isLoading || !input.trim()}>
            <Send className="w-4 h-4 mr-2" />
            Gönder
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
