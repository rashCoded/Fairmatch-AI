"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Search, SlidersHorizontal, ArrowUpDown, X } from "lucide-react";
import { getToken } from "@/lib/auth";
import { applyToInternship, getInternships, getMyApplications, getProfile, getRecommendations } from "@/lib/api";
import { InternshipCard } from "@/components/internship/internship-card";
import { ExploreSkeleton } from "@/components/ui/loading-skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import type { Internship, Recommendation } from "@/lib/types";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh",
];

const PAGE_SIZE = 10;
const INTERNSHIP_BATCH_SIZE = 200;

function normalizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const skill of skills) {
    const value = skill.trim();
    if (!value) {
      continue;
    }

    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(value);
    }
  }

  return normalized;
}

function buildEstimatedRecommendation(
  internship: Internship,
  studentSkills: string[]
): Recommendation {
  const requiredSkills = normalizeSkills(internship.required_skills ?? []);
  const studentSkillSet = new Set(
    normalizeSkills(studentSkills).map((skill) => skill.toLowerCase())
  );

  const matchedSkills = requiredSkills.filter((skill) =>
    studentSkillSet.has(skill.toLowerCase())
  );
  const missingSkills = requiredSkills.filter(
    (skill) => !studentSkillSet.has(skill.toLowerCase())
  );

  const estimatedContentScore =
    requiredSkills.length > 0 ? matchedSkills.length / requiredSkills.length : 0;

  return {
    internship_id: internship.id,
    title: internship.title,
    company: internship.company,
    content_score: estimatedContentScore,
    collaborative_score: 0,
    affirmative_score: 0,
    final_score: estimatedContentScore,
    explanation: {
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
      content_score: estimatedContentScore,
    },
  };
}

async function fetchAllInternships(): Promise<Internship[]> {
  const all: Internship[] = [];
  let skip = 0;

  while (true) {
    const batch = await getInternships({ skip, limit: INTERNSHIP_BATCH_SIZE });
    all.push(...batch);

    if (batch.length < INTERNSHIP_BATCH_SIZE) {
      break;
    }
    skip += INTERNSHIP_BATCH_SIZE;
  }

  // Protect against accidental duplicates if backend pagination overlaps.
  const uniqueById = new Map<number, Internship>();
  for (const internship of all) {
    uniqueById.set(internship.id, internship);
  }
  return Array.from(uniqueById.values());
}

function ExplorePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [internships, setInternships] = useState<Internship[]>([]);
  const [recommendations, setRecommendations] = useState<Map<number, Recommendation>>(new Map());
  const [loading, setLoading] = useState(true);
  const [studentSkills, setStudentSkills] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [workModeFilter, setWorkModeFilter] = useState("");
  const [durationFilter, setDurationFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [sortBy, setSortBy] = useState<"match" | "latest">("match");
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  const [internshipsError, setInternshipsError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    setLoading(true);
    setInternshipsError(null);

    try {
      const [internshipsResult, profileResult, applicationsResult] = await Promise.allSettled([
        fetchAllInternships(),
        getProfile(),
        getMyApplications(),
      ]);

      if (internshipsResult.status === "fulfilled") {
        setInternships(internshipsResult.value);
      } else {
        setInternships([]);
        setInternshipsError(
          "Could not load internships right now. Showing recommendation-only results where available."
        );
      }

      if (applicationsResult.status === "fulfilled") {
        setAppliedIds(new Set(applicationsResult.value.map((application) => application.internship_id)));
      } else {
        setAppliedIds(new Set());
      }

      if (profileResult.status === "fulfilled") {
        setStudentSkills(profileResult.value.skills ?? []);
        try {
          const recs = await getRecommendations(profileResult.value.id, { top_n: 100 });
          const recMap = new Map<number, Recommendation>();
          for (const r of recs.recommendations) {
            recMap.set(r.internship_id, r);
          }
          setRecommendations(recMap);
        } catch {
          setRecommendations(new Map());
        }
      } else {
        setStudentSkills([]);
        setRecommendations(new Map());
      }
    } catch {
      setInternships([]);
      setStudentSkills([]);
      setRecommendations(new Map());
      setInternshipsError("Could not load internships right now.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    setSearchQuery(q);
    setPage(0);
  }, [searchParams]);

  const handleApply = useCallback(async (
    internshipId: number,
    title: string,
    company: string,
    availableSeats?: number,
  ) => {
    if (appliedIds.has(internshipId)) {
      toast({
        title: "Already applied",
        description: "You have already applied to this internship",
      });
      return;
    }

    if (typeof availableSeats === "number" && availableSeats <= 0) {
      toast({
        title: "Internship full",
        description: "This internship has no available seats.",
        variant: "destructive",
      });
      return;
    }

    setApplyingId(internshipId);
    try {
      await applyToInternship({ internship_id: internshipId });
      setAppliedIds((prev) => new Set(prev).add(internshipId));
      toast({
        title: "Application submitted!",
        description: `Applied to ${title} at ${company}.`,
        variant: "success",
      });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "";

      if (status === 400 && detail.toLowerCase().includes("already")) {
        setAppliedIds((prev) => new Set(prev).add(internshipId));
        toast({
          title: "Already applied",
          description: "You have already applied to this internship",
        });
        return;
      }

      if (status === 400 && detail.toLowerCase().includes("no available seats")) {
        setInternships((prev) =>
          prev.map((item) =>
            item.id === internshipId
              ? { ...item, filled_seats: item.total_seats, available_seats: 0 }
              : item
          )
        );
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
  }, [appliedIds]);

  const filtered = internships.filter((internship) => {
    const q = searchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      internship.title.toLowerCase().includes(q) ||
      internship.company.toLowerCase().includes(q) ||
      internship.required_skills.some((s) => s.toLowerCase().includes(q));

    const matchesState = !stateFilter || internship.state === stateFilter;
    const matchesSector = !sectorFilter || internship.sector === sectorFilter;

    const normalizedLocation = internship.location.toLowerCase();
    const inferredMode = normalizedLocation.includes("remote")
      ? "remote"
      : normalizedLocation.includes("hybrid")
      ? "hybrid"
      : "onsite";
    const matchesWorkMode = !workModeFilter || inferredMode === workModeFilter;

    const matchesDuration =
      !durationFilter ||
      (durationFilter === "1-3" && internship.duration_months <= 3) ||
      (durationFilter === "4-6" && internship.duration_months >= 4 && internship.duration_months <= 6) ||
      (durationFilter === "7+" && internship.duration_months >= 7);

    const matchesSkill =
      !skillFilter ||
      internship.required_skills.some(
        (skill) => skill.toLowerCase() === skillFilter.toLowerCase()
      );

    return (
      matchesQuery &&
      matchesState &&
      matchesSector &&
      matchesWorkMode &&
      matchesDuration &&
      matchesSkill
    );
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "match") {
      const scoreA =
        (recommendations.get(a.id) ?? buildEstimatedRecommendation(a, studentSkills)).final_score;
      const scoreB =
        (recommendations.get(b.id) ?? buildEstimatedRecommendation(b, studentSkills)).final_score;
      return scoreB - scoreA;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const hasMore = (page + 1) * PAGE_SIZE < sorted.length;
  const paginatedInternships = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const recommendationOnlyResults = [...recommendations.values()].sort(
    (a, b) => b.final_score - a.final_score
  );
  const showRecommendationFallback =
    internships.length === 0 &&
    Boolean(internshipsError) &&
    recommendationOnlyResults.length > 0;

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1);
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [page, sorted.length]);

  // Build unique sectors from loaded internships
  const sectors = [...new Set(internships.map((i) => i.sector).filter(Boolean))];
  const skills = [
    ...new Set(internships.flatMap((i) => i.required_skills).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  if (loading) return <ExploreSkeleton />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Explore Internships</h1>
        <p className="text-muted-foreground">
          Browse and find internships that match your skills and interests
        </p>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, company, or skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => {
                  setSearchQuery("");
                  if (searchParams.get("q")) {
                    router.replace("/explore");
                  }
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
          </Button>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "match" | "latest")}>
            <SelectTrigger className="w-40">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="match">Match Score</SelectItem>
              <SelectItem value="latest">Latest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter Panel */}
        {filtersOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border bg-card p-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v === "all" ? "" : v); setPage(0); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="All states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sector</Label>
                <Select value={sectorFilter} onValueChange={(v) => { setSectorFilter(v === "all" ? "" : v); setPage(0); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="All sectors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sectors</SelectItem>
                    {sectors.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Work Mode</Label>
                <Select value={workModeFilter} onValueChange={(v) => setWorkModeFilter(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All modes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Modes</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Duration</Label>
                <Select value={durationFilter} onValueChange={(v) => setDurationFilter(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All durations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Durations</SelectItem>
                    <SelectItem value="1-3">1-3 months</SelectItem>
                    <SelectItem value="4-6">4-6 months</SelectItem>
                    <SelectItem value="7+">7+ months</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Skill</Label>
                <Select value={skillFilter} onValueChange={(v) => setSkillFilter(v === "all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All skills" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Skills</SelectItem>
                    {skills.map((skill) => (
                      <SelectItem key={skill} value={skill}>{skill}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStateFilter("");
                    setSectorFilter("");
                    setWorkModeFilter("");
                    setDurationFilter("");
                    setSkillFilter("");
                    setSearchQuery("");
                    setPage(0);
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {internshipsError && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {internshipsError}
        </div>
      )}

      {/* Results */}
      {showRecommendationFallback ? (
        <div className="space-y-4">
          {recommendationOnlyResults.map((recommendation, i) => (
            <motion.div
              key={recommendation.internship_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <InternshipCard
                recommendation={recommendation}
                applying={applyingId === recommendation.internship_id}
                onApply={(id) => {
                  void handleApply(id, recommendation.title, recommendation.company);
                }}
                applied={appliedIds.has(recommendation.internship_id)}
              />
            </motion.div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <Search className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          {internshipsError ? (
            <>
              <h3 className="text-lg font-semibold mb-2">Internships unavailable</h3>
              <p className="text-muted-foreground">Please retry in a moment. Recommendations will appear when data is available.</p>
            </>
          ) : searchQuery.trim() ? (
            <>
              <h3 className="text-lg font-semibold mb-2">No results found for &apos;{searchQuery.trim()}&apos;</h3>
              <p className="text-muted-foreground">Try a different keyword or clear search.</p>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold mb-2">No internships found</h3>
              <p className="text-muted-foreground">Try adjusting your filters or search query.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedInternships.map((internship, i) => {
            const rec = recommendations.get(internship.id);
            const recommendation = rec ?? buildEstimatedRecommendation(internship, studentSkills);

            return (
              <motion.div
                key={internship.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <InternshipCard
                  recommendation={recommendation}
                  location={`${internship.location}, ${internship.state}`}
                  sector={internship.sector}
                  duration={internship.duration_months}
                  stipend={internship.stipend}
                  applying={applyingId === internship.id}
                  onApply={(id) => {
                    void handleApply(id, internship.title, internship.company, internship.available_seats);
                  }}
                  applied={appliedIds.has(internship.id)}
                  isFull={internship.available_seats <= 0}
                  isEstimated={!rec}
                />
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!showRecommendationFallback && (page > 0 || hasMore) && (
        <div className="flex items-center justify-center gap-4 mt-8">
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <Button
            variant="outline"
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<ExploreSkeleton />}>
      <ExplorePageContent />
    </Suspense>
  );
}
