"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, TrendingUp, BookOpen, RefreshCw } from "lucide-react";
import { getToken } from "@/lib/auth";
import {
  applyToInternship,
  getInternship,
  getMyApplications,
  getProfile,
  getRecommendations,
  getMe,
} from "@/lib/api";
import { InternshipCard } from "@/components/internship/internship-card";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "@/components/ui/use-toast";
import type { StudentProfile, Recommendation } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  const [fullInternshipIds, setFullInternshipIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshingRecommendations, setRefreshingRecommendations] = useState(false);

  const loadRecommendationData = useCallback(async (studentId: number, force = false) => {
    const [recs, applications] = await Promise.all([
      getRecommendations(studentId, { top_n: 5, force }),
      getMyApplications().catch(() => []),
    ]);

    setRecommendations(recs.recommendations);
    setAppliedIds(new Set(applications.map((application) => application.internship_id)));

    const fullIds = new Set<number>();
    await Promise.all(
      recs.recommendations.map(async (recommendation) => {
        try {
          const internship = await getInternship(recommendation.internship_id);
          if (internship.available_seats <= 0) {
            fullIds.add(recommendation.internship_id);
          }
        } catch {
          // Ignore seat lookup failures and keep page interactive.
        }
      })
    );
    setFullInternshipIds(fullIds);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    async function load() {
      try {
        const [me, prof] = await Promise.all([getMe(), getProfile()]);
        setProfile(prof);

        if (me.role === "admin") {
          router.replace("/admin");
          return;
        }

        await loadRecommendationData(prof.id);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          router.replace("/profile/setup");
          return;
        }
        toast({
          title: "Failed to load dashboard",
          description: "Please try again later.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router, loadRecommendationData]);

  const handleRefreshRecommendations = async () => {
    if (!profile || refreshingRecommendations) {
      return;
    }

    setRefreshingRecommendations(true);
    try {
      await loadRecommendationData(profile.id, true);
      toast({
        title: "Recommendations updated",
        description: "Showing the latest matches from your current profile and resume.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Refresh failed",
        description: "Could not update recommendations right now. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRefreshingRecommendations(false);
    }
  };

  if (loading) return <DashboardSkeleton />;

  const topSkills = profile?.skills.slice(0, 2).join(" & ") || "your skills";
  const topCategory =
    recommendations.length > 0
      ? recommendations.reduce(
          (best, r) => (r.content_score > best.score ? { name: r.title, score: r.content_score } : best),
          { name: "", score: 0 }
        ).name
      : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-navy p-8 text-white mb-8"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              Welcome back, {profile?.full_name?.split(" ")[0] || "Student"}!
            </h1>
            <p className="text-white/70 max-w-lg">
              Based on your expertise in <span className="text-green-accent font-medium">{topSkills}</span>,
              we found <span className="text-green-accent font-medium">{recommendations.length} internship
              {recommendations.length !== 1 ? "s" : ""}</span> that match your profile.
            </p>
          </div>

          <div className="flex gap-4">
            {/* AI Insight Card */}
            <div className="rounded-xl bg-white/10 backdrop-blur-sm p-5 min-w-45">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-green-accent" />
                <span className="text-xs font-medium text-white/70">AI Insight</span>
              </div>
              <p className="text-2xl font-bold">
                {(() => {
                  if (!profile) return "0%";
                  const fields = [
                    profile.full_name, profile.phone, profile.college,
                    profile.degree, profile.branch, profile.graduation_year,
                    profile.cgpa, profile.skills.length > 0 ? "y" : null,
                    profile.district, profile.state, profile.social_category,
                  ];
                  const filled = fields.filter((f) => f !== null && f !== undefined && f !== "").length;
                  return Math.round((filled / fields.length) * 100) + "%";
                })()}
              </p>
              <p className="text-xs text-white/60">Profile Completeness</p>
            </div>

            {/* Career Insight Card */}
            {topCategory && (
              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-5 min-w-45 hidden lg:block">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-green-accent" />
                  <span className="text-xs font-medium text-white/70">Top Match</span>
                </div>
                <p className="text-sm font-bold leading-tight line-clamp-2">{topCategory}</p>
                <p className="text-xs text-white/60 mt-1">Best skill alignment</p>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        {/* Recommendations */}
        <div>
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-green-accent" />
              <div>
                <h2 className="text-xl font-bold">Recommended Internships</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This recommendation combines skill similarity, historical placement patterns, and policy fairness scoring.
                </p>
                {refreshingRecommendations && (
                  <p className="mt-1 text-sm text-green-accent">Updating your recommendations...</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleRefreshRecommendations();
              }}
              disabled={refreshingRecommendations}
              className="inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshingRecommendations ? "animate-spin" : ""}`} />
              Refresh Recommendations
            </button>
          </div>

          {recommendations.length === 0 ? (
            <div className="rounded-xl border bg-card p-12 text-center">
              <Sparkles className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No recommendations yet</h3>
              <p className="text-muted-foreground">
                Complete your profile to get AI-powered internship matches.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec, i) => (
                <motion.div
                  key={rec.internship_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <InternshipCard
                    recommendation={rec}
                    applying={applyingId === rec.internship_id}
                    onApply={async (id) => {
                      if (appliedIds.has(id)) {
                        toast({
                          title: "Already applied",
                          description: "You have already applied to this internship",
                        });
                        return;
                      }

                      if (fullInternshipIds.has(id)) {
                        toast({
                          title: "Internship full",
                          description: "This internship has no available seats.",
                          variant: "destructive",
                        });
                        return;
                      }

                      setApplyingId(id);
                      try {
                        await applyToInternship({ internship_id: id });
                        setAppliedIds((prev) => new Set(prev).add(id));
                        toast({
                          title: "Application submitted!",
                          description: `Applied to ${rec.title} at ${rec.company}.`,
                          variant: "success",
                        });
                      } catch (err: unknown) {
                        const status = (err as { response?: { status?: number } })?.response?.status;
                        const detail =
                          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
                          "";

                        if (status === 400 && detail.toLowerCase().includes("already")) {
                          setAppliedIds((prev) => new Set(prev).add(id));
                          toast({
                            title: "Already applied",
                            description: "You have already applied to this internship.",
                          });
                          return;
                        }

                        if (status === 400 && detail.toLowerCase().includes("no available seats")) {
                          setFullInternshipIds((prev) => new Set(prev).add(id));
                          toast({
                            title: "Internship full",
                            description: "This internship has no available seats.",
                            variant: "destructive",
                          });
                          return;
                        }

                        const message =
                          status === 404
                            ? "Applications endpoint is unavailable on backend."
                            : detail || "Could not submit application.";
                        toast({ title: "Apply failed", description: message, variant: "destructive" });
                      } finally {
                        setApplyingId(null);
                      }
                    }}
                    applied={appliedIds.has(rec.internship_id)}
                    isFull={fullInternshipIds.has(rec.internship_id)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Sidebar profile={profile} />
          </div>
        </aside>
      </div>
    </div>
  );
}
