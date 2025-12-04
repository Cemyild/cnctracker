import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ProcedureCardProps {
  title: string;
  count: number;
  variant?: "default" | "blue" | "yellow";
}

const variantStyles = {
  default: "bg-slate-50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-700/50",
  blue: "bg-sky-50 dark:bg-sky-950/30 border-sky-100 dark:border-sky-900/50",
  yellow: "bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50",
};

export function ProcedureCard({ title, count, variant = "default" }: ProcedureCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className={cn(
        "border transition-all duration-200 hover-elevate",
        variantStyles[variant]
      )}
      data-testid={`procedure-card-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-center text-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground gap-1"
          onClick={() => {
            setExpanded(!expanded);
            console.log(`Expand ${title} clicked`);
          }}
          data-testid={`button-expand-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          Expand
          <ChevronDown className={cn("w-4 h-4 transition-transform", expanded && "rotate-180")} />
        </Button>
        <p className="text-sm text-muted-foreground">
          {count} procedures
        </p>
        {expanded && (
          <div className="w-full pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground text-center">
              Procedure details would appear here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
