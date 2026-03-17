"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, Clock, CheckCircle2, XCircle, Eye, X, MapPin, Building2, Briefcase, AlertTriangle } from "lucide-react";
import { getToken } from "@/lib/auth";
import { getExplanation, getInternship, getMe, getMyApplications, getProfile } from "@/lib/api";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { ApplicationsSkeleton, InternshipDetailsSkeleton } from "@/components/ui/loading-skeleton";
import { Button } from "@/components/ui/button";
import { SkillTag } from "@/components/internship/skill-tag";
import { toast } from "@/components/ui/use-toast";
import type { Application, ApplicationStatus, Internship } from "@/lib/types";

interface ApplicationRow {
  id: number;
  internship_id: number;
  company: string;
  role: string;
  status: ApplicationStatus;
  applied_date: string;
  match_score: number;
  content_score: number;
  collaborative_score: number;
  affirmative_score: number;
  matched_skills: string[];
  missing_skills: string[];
  internship: Internship | null;
}

export default function ApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<"date" | "score">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [studentId, setStudentId] = useState<number | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    async function load() {
      try {
        const [me, profile, myApplications] = await Promise.all([
          getMe(),
          getProfile(),
          getMyApplications(),
        ]);

        setStudentId(profile.id);

        if (me.role === "admin") {
          router.replace("/admin");
          return;
        }

        const uniqueInternshipIds = [...new Set(myApplications.map((a) => a.internship_id))];
        const internships = await Promise.all(
          uniqueInternshipIds.map(async (id) => {
            try {
              const internship = await getInternship(id);
              return [id, internship] as const;
            } catch {
              return [id, null] as const;
            }
          })
        );

        const internshipMap = new Map<number, Awaited<ReturnType<typeof getInternship>> | null>(internships);

        const rows: ApplicationRow[] = myApplications.map((app: Application) => {
          const internship = internshipMap.get(app.internship_id) ?? null;
          const breakdown = app.score_breakdown as {
            matched_skills?: unknown;
            missing_skills?: unknown;
          };

          const matchedSkills = Array.isArray(breakdown?.matched_skills)
            ? breakdown.matched_skills.filter((skill): skill is string => typeof skill === "string")
            : [];
          const missingSkills = Array.isArray(breakdown?.missing_skills)
            ? breakdown.missing_skills.filter((skill): skill is string => typeof skill === "string")
            : [];

          return {
            id: app.id,
            internship_id: app.internship_id,
            company: internship?.company || `Internship #${app.internship_id}`,
            role: internship?.title || "Internship Role",
            status: app.status,
            applied_date: app.applied_at,
            match_score: app.final_score,
            content_score: app.content_score,
            collaborative_score: app.collaborative_score,
            affirmative_score: app.affirmative_score,
            matched_skills: matchedSkills,
            missing_skills: missingSkills,
            internship,
          };
        });

        setApplications(rows);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          router.replace("/profile/setup");
          return;
        }
        toast({
          title: "Failed to load applications",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  const toggleSort = (field: "date" | "score") => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const handleViewDetails = async (app: ApplicationRow) => {
    setSelectedApplication(app);
    setDetailOpen(true);
    setDetailLoading(true);

    try {
      const [internship, explanation] = await Promise.all([
        app.internship ? Promise.resolve(app.internship) : getInternship(app.internship_id),
        studentId ? getExplanation(studentId, app.internship_id).catch(() => null) : Promise.resolve(null),
      ]);

      setSelectedApplication((prev) => {
        if (!prev || prev.id !== app.id) {
          return prev;
        }

        return {
          ...prev,
          internship,
          matched_skills: explanation?.matched_skills ?? prev.matched_skills,
          missing_skills: explanation?.missing_skills ?? prev.missing_skills,
          content_score: explanation?.content_score ?? prev.content_score,
        };
      });
    } catch {
      toast({
        title: "Could not load full details",
        description: "Showing available application data.",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const sorted = [...applications].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "date") {
      return dir * (new Date(a.applied_date).getTime() - new Date(b.applied_date).getTime());
    }
    return dir * (a.match_score - b.match_score);
  });

  const stats = {
    total: applications.length,
    pending: applications.filter((a) => a.status === "pending").length,
    selected: applications.filter((a) => a.status === "selected").length,
    rejected: applications.filter((a) => a.status === "rejected").length,
  };

  const selectedInternship = selectedApplication?.internship ?? null;

  if (loading) return <ApplicationsSkeleton />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">My Applications</h1>
        <p className="text-muted-foreground">Track the status of your internship applications</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <StatCard
            title="Total"
            value={stats.total}
            icon={FileText}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard
            title="Pending"
            value={stats.pending}
            icon={Clock}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <StatCard
            title="Selected"
            value={stats.selected}
            icon={CheckCircle2}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <StatCard
            title="Rejected"
            value={stats.rejected}
            icon={XCircle}
            iconWrapperClassName="bg-red-100"
            iconClassName="text-red-500"
          />
        </motion.div>
      </div>

      {/* Applications Table */}
      {applications.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No applications yet</h3>
          <p className="text-muted-foreground">
            Browse internships and apply to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Company</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Status</th>
                  <th
                    className="text-left px-6 py-4 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("date")}
                  >
                    Applied Date {sortField === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th
                    className="text-left px-6 py-4 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("score")}
                  >
                    Match Score {sortField === "score" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((app, i) => (
                  <motion.tr
                    key={app.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="font-medium">{app.company}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{app.role}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(app.applied_date).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 min-w-35">
                        <Progress
                          value={app.match_score * 100}
                          className="h-2 flex-1"
                          indicatorClassName={
                            app.match_score > 0.7
                              ? "bg-green-accent"
                              : app.match_score > 0.5
                              ? "bg-yellow-500"
                              : "bg-red-500"
                          }
                        />
                        <span className="text-sm font-medium w-10 text-right">
                          {Math.round(app.match_score * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        className="flex items-center gap-1 text-sm text-green-accent hover:text-green-accent-dark transition-colors"
                        onClick={() => {
                          void handleViewDetails(app);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                        View
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detailOpen && selectedApplication && (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/50 p-4">
          <button
            aria-label="Close details"
            className="absolute inset-0"
            onClick={() => {
              setDetailOpen(false);
            }}
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Application Details</h2>
                <p className="text-sm text-muted-foreground">{selectedApplication.company}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                onClick={() => {
                  setDetailOpen(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-6 p-6">
              {detailLoading ? (
                <InternshipDetailsSkeleton />
              ) : (
                <>
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <h3 className="text-base font-semibold">{selectedInternship?.title ?? selectedApplication.role}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{selectedInternship?.company ?? selectedApplication.company}</p>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-green-accent" />
                        <span>
                          {selectedInternship ? `${selectedInternship.location}, ${selectedInternship.state}` : "Location unavailable"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-green-accent" />
                        <span>{selectedInternship?.sector ?? "Sector unavailable"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-green-accent" />
                        <span>{selectedInternship?.duration_months ?? "-"} months</span>
                      </div>
                      <div className="font-medium text-foreground">
                        Stipend: {selectedInternship?.stipend ? `Rs. ${selectedInternship.stipend.toLocaleString()}/mo` : "Not specified"}
                      </div>
                    </div>

                    {selectedInternship?.description && (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{selectedInternship.description}</p>
                    )}
                  </div>

                  <div className="rounded-xl border p-4">
                    <h4 className="mb-3 font-semibold">Score Breakdown</h4>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Content Score</span>
                          <span className="font-medium">{Math.round(selectedApplication.content_score * 100)}%</span>
                        </div>
                        <Progress value={selectedApplication.content_score * 100} indicatorClassName="bg-green-accent" />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Collaborative Score</span>
                          <span className="font-medium">{Math.round(selectedApplication.collaborative_score * 100)}%</span>
                        </div>
                        <Progress value={selectedApplication.collaborative_score * 100} indicatorClassName="bg-sky-500" />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Affirmative Score</span>
                          <span className="font-medium">{Math.round(selectedApplication.affirmative_score * 100)}%</span>
                        </div>
                        <Progress value={selectedApplication.affirmative_score * 100} indicatorClassName="bg-violet-500" />
                      </div>
                    </div>
                  </div>

                  {selectedApplication.matched_skills.length > 0 && (
                    <div className="rounded-xl border p-4">
                      <h4 className="mb-2 text-sm font-semibold">Matched Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedApplication.matched_skills.map((skill) => (
                          <SkillTag key={`matched-${skill}`} skill={skill} variant="matched" />
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedApplication.missing_skills.length > 0 && (
                    <div className="rounded-xl border p-4">
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        Missing Skills
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedApplication.missing_skills.map((skill) => (
                          <SkillTag key={`missing-${skill}`} skill={skill} variant="missing" />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
