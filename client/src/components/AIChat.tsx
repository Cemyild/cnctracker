import { useState, useRef, useEffect } from "react";
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Truck,
  ChevronRight,
  Send,
  Database,
  Table as TableIcon,
} from "lucide-react";
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
  streaming?: boolean;
  visibleLen?: number;
}

interface HeroCard {
  title: string;
  example: string;
  question: string;
  color: string;
  tint: string;
  Icon: typeof TrendingUp;
}

const HERO_CARDS: HeroCard[] = [
  {
    title: "Satış & Ciro",
    example: "Aralık ayı toplam satış?",
    question: "Aralık ayı toplam satış ne kadar?",
    color: "#0ea5e9",
    tint: "rgba(14,165,233,0.1)",
    Icon: TrendingUp,
  },
  {
    title: "Personel Maliyeti",
    example: "2026 personel maliyeti?",
    question: "2026 personel maliyeti nedir?",
    color: "#7c3aed",
    tint: "rgba(124,58,237,0.1)",
    Icon: Users,
  },
  {
    title: "Tahsilat Riski",
    example: "Riskli müşteriler kimler?",
    question: "Riskli müşteriler kimler?",
    color: "#e11d48",
    tint: "rgba(225,29,72,0.1)",
    Icon: AlertTriangle,
  },
  {
    title: "Araç & Sigorta",
    example: "Sigortası yaklaşan araçlar?",
    question: "Sigortası yaklaşan araçlar hangileri?",
    color: "#d97706",
    tint: "rgba(217,119,6,0.1)",
    Icon: Truck,
  },
];

const SUGGESTION_CHIPS = [
  "Aralık ayı toplam satış?",
  "En çok ciro yapan firmalar",
  "2026 personel maliyeti",
  "Riskli müşteriler kimler?",
];

const STYLE_BLOCK = `
@keyframes aichat-blink { 0%,80%,100%{opacity:0.15} 40%{opacity:1} }
@keyframes aichat-floaty { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes aichat-halo { 0%{transform:scale(0.85);opacity:0.5} 100%{transform:scale(1.5);opacity:0} }
@keyframes aichat-msgin { from{opacity:0;transform:translateY(9px)} to{opacity:1;transform:none} }
`;

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Merhaba 👋 CNC Tracker veritabanını doğal dilde sorgulayabilirim. Satış, gider, personel maliyeti, tahsilat riski veya araç verileri hakkında soru sorabilirsin.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hasStarted = messages.some((m) => m.role === "user");

  // Auto-scroll to bottom on new messages / streaming updates (only once chat started)
  useEffect(() => {
    if (!hasStarted) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, hasStarted]);

  // Cleanup the typewriter interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Time-based typewriter: computes revealed length from elapsed time vs a
  // duration. Uses setInterval (NOT requestAnimationFrame) so it completes even
  // if the tab is hidden — the bubble never stays empty.
  const startStream = (messageId: string, fullText: string) => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const dur = Math.min(1100, 240 + fullText.length * 13);
    const t0 = performance.now();

    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - t0;
      const n = Math.min(
        fullText.length,
        Math.ceil(fullText.length * (elapsed / dur)),
      );

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, visibleLen: n, streaming: n < fullText.length }
            : m,
        ),
      );

      if (n >= fullText.length && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }, 16);
  };

  // Finalize any in-progress stream immediately (e.g. when a new message starts)
  const finalizeStream = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.streaming
          ? { ...m, streaming: false, visibleLen: m.content.length }
          : m,
      ),
    );
  };

  // Real backend call. Accepts an explicit question string for card/chip clicks.
  const send = async (text?: string) => {
    const question = (text ?? input).trim();
    if (!question || isLoading) return;

    finalizeStream();

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: question,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });

      const data = await res.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const botId = (Date.now() + 1).toString();
      const botMessage: Message = {
        id: botId,
        role: "assistant",
        content: data.message ?? "",
        sql: data.sql,
        data: data.data,
        streaming: true,
        visibleLen: 0,
      };

      setMessages((prev) => [...prev, botMessage]);
      startStream(botId, botMessage.content);
    } catch (error: any) {
      const botId = (Date.now() + 1).toString();
      const content = "Üzgünüm, bir hata oluştu: " + error.message;
      setMessages((prev) => [
        ...prev,
        {
          id: botId,
          role: "assistant",
          content,
          streaming: true,
          visibleLen: 0,
        },
      ]);
      startStream(botId, content);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col h-[750px] min-h-[600px] bg-slate-50 rounded-xl border">
      <style dangerouslySetInnerHTML={{ __html: STYLE_BLOCK }} />

      <div className="flex flex-col flex-1 min-h-0 w-full max-w-[920px] mx-auto px-6 pt-6">
        {/* HEADER */}
        <div className="flex items-center gap-3 pb-4 border-b shrink-0">
          <div className="flex-1">
            <h1 className="m-0 text-[19px] font-extrabold tracking-tight text-slate-900">
              AI Asistan
            </h1>
            <p className="mt-0.5 text-[12.5px] text-slate-500">
              Tüm veritabanını doğal dilde sorgula · Gümrük, Sigorta, Çalışan,
              Tahsilat, Araç verileri
            </p>
          </div>
          <div className="flex items-center gap-[7px] px-[11px] py-[6px] bg-emerald-50 border border-emerald-200 rounded-full shrink-0">
            <span
              className="w-[7px] h-[7px] rounded-full bg-emerald-500"
              style={{ animation: "aichat-blink 1.6s infinite" }}
            />
            <span className="text-[11.5px] font-semibold text-emerald-600">
              Çevrimiçi
            </span>
          </div>
        </div>

        {/* BODY (hero or chat) */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto py-5 px-0.5 flex flex-col gap-4 min-h-0"
        >
          {!hasStarted ? (
            /* ===== WELCOME HERO ===== */
            <div className="flex flex-col items-center text-center pt-3 pb-2">
              <div className="relative mb-3 flex items-center justify-center">
                <span
                  className="absolute rounded-full"
                  style={{
                    width: 200,
                    height: 128,
                    background:
                      "radial-gradient(ellipse,rgba(14,165,233,0.15),transparent 68%)",
                    animation: "aichat-halo 3.4s ease-out infinite",
                  }}
                />
                <img
                  src="/cnc-ai-white.png"
                  alt="CNC AI ASSISTANT"
                  className="relative block w-44 h-auto"
                  style={{
                    animation: "aichat-floaty 3.4s ease-in-out infinite",
                    filter: "drop-shadow(0 8px 22px rgba(15,23,42,0.10))",
                  }}
                />
              </div>
              <h2 className="m-0 text-[22px] font-extrabold tracking-tight text-slate-900">
                Merhaba 👋 Ne öğrenmek istersin?
              </h2>
              <p className="mt-2 max-w-[430px] text-[13.5px] leading-relaxed text-slate-500">
                Tüm CNC Tracker veritabanını doğal dilde sorgula — satış,
                personel maliyeti, tahsilat riski, araç sigortaları ve daha
                fazlası.
              </p>

              {/* capability cards */}
              <div className="grid grid-cols-2 gap-2.5 w-full max-w-[660px] mt-3.5">
                {HERO_CARDS.map((card) => {
                  const Icon = card.Icon;
                  return (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => send(card.question)}
                      className="flex items-center gap-3 text-left bg-card border border-border rounded-[14px] px-[15px] py-[13px] cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:border-sky-400"
                    >
                      <div
                        className="flex items-center justify-center shrink-0 w-9 h-9 rounded-[10px]"
                        style={{ background: card.tint, color: card.color }}
                      >
                        <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="m-0 text-[13.5px] font-bold text-slate-900">
                          {card.title}
                        </p>
                        <p className="mt-[3px] text-[12px] text-slate-400 whitespace-nowrap overflow-hidden text-ellipsis">
                          {card.example}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ===== CHAT ===== */
            <>
              {messages.map((msg) => {
                const isBot = msg.role === "assistant";
                const visible = msg.streaming
                  ? msg.content.slice(0, msg.visibleLen ?? 0)
                  : msg.content;
                const showExtras = isBot && !msg.streaming;

                if (isBot) {
                  return (
                    <div
                      key={msg.id}
                      className="flex gap-3 items-start max-w-[80%]"
                      style={{ animation: "aichat-msgin 0.25s ease-out" }}
                    >
                      <div className="flex items-center justify-center shrink-0 mt-px">
                        <img
                          src="/cnc-ai-chip.png"
                          alt="CNC AI"
                          className="w-8 h-8 object-contain"
                        />
                      </div>
                      <div className="bg-card border rounded-[4px_13px_13px_13px] px-[15px] py-3 space-y-2.5">
                        <p className="m-0 text-[13.5px] leading-relaxed text-slate-800 whitespace-pre-wrap">
                          {visible}
                          {msg.streaming && (
                            <span
                              className="inline-block w-[7px] h-[14px] rounded-[1px] ml-[3px] align-[-2px]"
                              style={{
                                background: "#0284c7",
                                animation: "aichat-blink 1.05s infinite",
                              }}
                            />
                          )}
                        </p>

                        {/* Data table */}
                        {showExtras && msg.data && msg.data.length > 0 && (
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
                                      <TableHead
                                        key={key}
                                        className="h-8 px-2 font-bold"
                                      >
                                        {key}
                                      </TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {msg.data
                                    .slice(0, 10)
                                    .map((row: any, i: number) => (
                                      <TableRow key={i}>
                                        {Object.values(row).map(
                                          (val: any, j: number) => (
                                            <TableCell
                                              key={j}
                                              className="py-1 px-2"
                                            >
                                              {val !== null ? String(val) : "-"}
                                            </TableCell>
                                          ),
                                        )}
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

                        {/* SQL debug (collapsible, muted) */}
                        {showExtras && msg.sql && (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-slate-400 flex items-center gap-1 select-none">
                              <Database className="w-3 h-3" />
                              SQL Query
                            </summary>
                            <div className="mt-1 bg-slate-950 text-slate-300 p-2 rounded font-mono overflow-auto border border-slate-800 whitespace-pre-wrap">
                              {msg.sql}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                }

                // user bubble
                return (
                  <div
                    key={msg.id}
                    className="self-end max-w-[74%]"
                    style={{ animation: "aichat-msgin 0.25s ease-out" }}
                  >
                    <div className="bg-slate-900 text-white rounded-[13px_13px_4px_13px] px-[15px] py-[11px]">
                      <p className="m-0 text-[13.5px] leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* thinking indicator */}
              {isLoading && (
                <div className="flex gap-3 items-center">
                  <div className="flex items-center justify-center shrink-0">
                    <img
                      src="/cnc-ai-chip.png"
                      alt="CNC AI"
                      className="w-8 h-8 object-contain"
                    />
                  </div>
                  <div className="bg-card border rounded-[13px] px-4 py-[13px] flex gap-1">
                    {[0, 0.2, 0.4].map((delay) => (
                      <span
                        key={delay}
                        className="w-1.5 h-1.5 rounded-full bg-slate-400"
                        style={{
                          animation: `aichat-blink 1.2s infinite ${delay}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* SUGGESTION CHIPS + INPUT */}
        <div className="pt-3 pb-6 bg-slate-50 shrink-0">
          {hasStarted && (
            <div className="flex flex-wrap gap-2 mb-3">
              {SUGGESTION_CHIPS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => send(label)}
                  disabled={isLoading}
                  className="px-[13px] py-[7px] bg-card border border-border rounded-full text-[12.5px] font-medium text-slate-700 cursor-pointer transition-colors hover:border-sky-400 hover:text-sky-600 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2.5 items-center bg-card border border-border rounded-[13px] pl-4 pr-[7px] py-[7px]">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              placeholder="Bir soru yaz… örn. Aralık ayı toplam satış ne kadar?"
              className="flex-1 border-none outline-none text-sm text-slate-900 bg-transparent disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={isLoading || !input.trim()}
              className="w-10 h-10 rounded-[10px] bg-slate-900 text-white cursor-pointer flex items-center justify-center shrink-0 transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Gönder"
            >
              <Send className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
