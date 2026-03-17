import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface SkillTagProps {
  skill: string;
  variant: "matched" | "missing";
  className?: string;
}

export function SkillTag({ skill, variant, className }: SkillTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variant === "matched"
          ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
          : "bg-orange-100 text-orange-700 border border-orange-200",
        className
      )}
    >
      {variant === "missing" && <AlertTriangle className="h-3 w-3" />}
      {skill}
    </span>
  );
}
