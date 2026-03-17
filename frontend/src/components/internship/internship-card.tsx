"use client";

import { motion } from "framer-motion";
import { MapPin, Clock, Star, Briefcase, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MatchScoreRing } from "./match-score-ring";
import { SkillTag } from "./skill-tag";
import { ExplanationPanel } from "./explanation-panel";
import type { Recommendation } from "@/lib/types";

interface InternshipCardProps {
  recommendation: Recommendation;
  location?: string;
  state?: string;
  sector?: string;
  duration?: number;
  stipend?: number;
  onApply?: (internshipId: number) => void;
  applying?: boolean;
  applied?: boolean;
  isFull?: boolean;
  isEstimated?: boolean;
}

export function InternshipCard({
  recommendation,
  location,
  sector,
  duration,
  stipend,
  onApply,
  applying,
  applied,
  isFull,
  isEstimated,
}: InternshipCardProps) {
  const {
    internship_id,
    title,
    company,
    content_score,
    collaborative_score,
    affirmative_score,
    final_score,
    explanation,
  } = recommendation;

  return (
    <motion.div
      className="rounded-xl border bg-card p-6 shadow-sm transition-all hover:shadow-lg"
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <div className="flex items-start gap-4">
        <MatchScoreRing score={final_score} size={72} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-lg leading-tight">{title}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">{company}</p>
            </div>

            <div className="flex items-center gap-2">
              {isEstimated && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-sky-200 bg-sky-50 text-sky-700"
                >
                  Estimated Match
                </Badge>
              )}

              {isFull && (
                <Badge variant="destructive" className="shrink-0">
                  Full
                </Badge>
              )}

              {affirmative_score > 0.2 && (
                <Badge variant="warning" className="shrink-0 gap-1">
                  <Star className="h-3 w-3" />
                  Policy Boost
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {location}
              </span>
            )}
            {duration && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {duration} months
              </span>
            )}
            {sector && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {sector}
              </span>
            )}
            {stipend !== undefined && stipend > 0 && (
              <span className="font-medium text-green-accent">
                Rs. {stipend.toLocaleString()}/mo
              </span>
            )}
          </div>

          {explanation.matched_skills.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Matched</p>
              <div className="flex flex-wrap gap-1.5">
                {explanation.matched_skills.map((skill) => (
                  <SkillTag key={skill} skill={skill} variant="matched" />
                ))}
              </div>
            </div>
          )}

          {explanation.missing_skills.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-orange-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Missing:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {explanation.missing_skills.map((skill) => (
                  <SkillTag key={skill} skill={skill} variant="missing" />
                ))}
              </div>
            </div>
          )}

          <ExplanationPanel
            contentScore={content_score}
            collaborativeScore={collaborative_score}
            affirmativeScore={affirmative_score}
            matchedSkills={explanation.matched_skills}
            missingSkills={explanation.missing_skills}
          />

          {onApply && (
            <div className="mt-4">
              <Button
                variant={applied ? "default" : isFull ? "outline" : "accent"}
                size="sm"
                onClick={() => {
                  if (!isFull) {
                    onApply(internship_id);
                  }
                }}
                disabled={applying || applied || isFull}
                className={
                  applied
                    ? "bg-emerald-600 text-white hover:bg-emerald-600 disabled:opacity-100"
                    : isFull
                      ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-50 disabled:opacity-100"
                      : undefined
                }
              >
                {applied ? (
                  <>
                    <Check className="h-4 w-4" />
                    Applied ✓
                  </>
                ) : isFull ? (
                  "Full"
                ) : applying ? (
                  "Applying..."
                ) : (
                  "Apply Now"
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
