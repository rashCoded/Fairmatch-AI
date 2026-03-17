"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { Progress } from "@/components/ui/progress";

interface ExplanationPanelProps {
  contentScore: number;
  collaborativeScore: number;
  affirmativeScore: number;
  matchedSkills: string[];
  missingSkills: string[];
}

export function ExplanationPanel({
  contentScore,
  collaborativeScore,
  affirmativeScore,
  matchedSkills,
  missingSkills,
}: ExplanationPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-green-accent" />
          Why was I matched?
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Skill Match</span>
                  <span className="font-semibold">{Math.round(contentScore * 100)}%</span>
                </div>
                <Progress value={contentScore * 100} indicatorClassName="bg-green-accent" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Collaborative Score</span>
                  <span className="font-semibold">{Math.round(collaborativeScore * 100)}%</span>
                </div>
                <Progress value={collaborativeScore * 100} indicatorClassName="bg-sky-500" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Policy Boost</span>
                  <span className="font-semibold">{Math.round(affirmativeScore * 100)}%</span>
                </div>
                <Progress value={affirmativeScore * 100} indicatorClassName="bg-violet-500" />
              </div>

              {matchedSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Matched Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {matchedSkills.map((s) => (
                      <span key={s} className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {missingSkills.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Skills to Develop</p>
                  <div className="flex flex-wrap gap-1">
                    {missingSkills.map((s) => (
                      <span key={s} className="rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 text-xs">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
