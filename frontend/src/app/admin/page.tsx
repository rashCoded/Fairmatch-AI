"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Briefcase,
  FileText,
  Gauge,
  GraduationCap,
  Loader2,
  MapPinned,
  Search,
  Target,
  Users,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api, {
  bulkAllocate,
  demoReset,
  getAdminStudentApplications,
  getAdminInternships,
  getAdminStudents,
  getAnalytics,
  getMe,
  getRecentAllocations,
  getRecommendations,
  manualOverrideAllocation,
  updateApplicationStatus,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  AdminAnalytics,
  AdminStudentApplication,
  ApplicationStatus,
  Internship,
  RecentAllocation,
  StudentProfile,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { AdminSkeleton } from "@/components/ui/loading-skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
import { MatchScoreRing } from "@/components/internship/match-score-ring";
import { toast } from "@/components/ui/use-toast";

const PAGE_SIZE = 20;

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  under_review: "#3B82F6",
  selected: "#20C997",
  rejected: "#EF4444",
};

const CATEGORY_COLORS = ["#0F3D5E", "#20C997", "#3B82F6", "#F59E0B", "#EF4444"];

interface ScoreDistribution {
  high: number;
  medium: number;
  low: number;
  none: number;
}

type BulkActionType = "under_review" | "selected" | "rejected";

interface BulkActionPreviewSample {
  application_id: number | null;
  student_id: number | null;
  applicationId?: number;
  studentId?: number;
  student_name: string;
  internship_title: string;
  company: string;
  final_score: number;
  current_status: "pending" | "under_review";
}

interface BulkActionPreviewResult {
  dry_run: true;
  action: BulkActionType;
  applications_affected: number;
  internships_affected: number;
  students_affected: number;
  seat_limit_applied: boolean;
  skipped_due_to_seats: number;
  score_range: {
    min: number;
    max: number;
  };
  preview_sample: BulkActionPreviewSample[];
}

interface BulkActionApplyResult {
  dry_run: false;
  action: BulkActionType;
  applications_updated: number;
  internships_affected: number;
  skipped_due_to_seats: number;
  message: string;
}

interface UpdateStatusOptions {
  closeAllocationModal?: boolean;
  closeStudentApplicationDetail?: boolean;
}

const BULK_ACTION_LABELS: Record<BulkActionType, string> = {
  under_review: "Move to Under Review",
  selected: "Select (confirm placement)",
  rejected: "Reject",
};

const STATUS_LABELS: Record<Exclude<ApplicationStatus, "pending">, string> = {
  under_review: "Under Review",
  selected: "Selected",
  rejected: "Rejected",
};

const NEXT_STATUS_MAP: Record<ApplicationStatus, Exclude<ApplicationStatus, "pending">[]> = {
  pending: ["under_review", "rejected"],
  under_review: ["selected", "rejected"],
  selected: [],
  rejected: ["under_review"],
};

const STATUS_BUTTON_STYLES: Record<Exclude<ApplicationStatus, "pending">, string> = {
  under_review: "border-blue-200 text-blue-700 hover:bg-blue-50",
  selected: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
  rejected: "border-red-200 text-red-700 hover:bg-red-50",
};

const STATUS_ACTION_LABELS: Record<Exclude<ApplicationStatus, "pending">, string> = {
  under_review: "Move to Under Review",
  selected: "Select",
  rejected: "Reject",
};

const clampScore = (score: number): number => Math.min(1, Math.max(0, score));
const scoreToPercent = (score: number): number => Math.round(clampScore(score) * 100);

const formatStipend = (stipend: number): string => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, stipend));
};

const uniqueSkills = (skills: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const skill of skills) {
    const normalized = skill.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result;
};

const buildSkillInsights = (
  studentSkills: string[],
  requiredSkills: string[],
  matchedSkills: string[],
  missingSkills: string[]
): { matched: string[]; missing: string[] } => {
  const normalizedMatched = uniqueSkills(matchedSkills);
  const normalizedMissing = uniqueSkills(missingSkills);

  if (normalizedMatched.length > 0 || normalizedMissing.length > 0) {
    return {
      matched: normalizedMatched,
      missing: normalizedMissing,
    };
  }

  const studentSkillSet = new Set(
    uniqueSkills(studentSkills).map((skill) => skill.toLowerCase())
  );
  const required = uniqueSkills(requiredSkills);

  return {
    matched: required.filter((skill) => studentSkillSet.has(skill.toLowerCase())),
    missing: required.filter((skill) => !studentSkillSet.has(skill.toLowerCase())),
  };
};

const getPolicyBoostExplanations = (
  socialCategory: string | null,
  isRural: boolean,
  hasPreviousInternship: boolean
): string[] => {
  const reasons: string[] = [];

  if (isRural) {
    reasons.push("Rural district representation boost applied");
  }

  const normalizedCategory = (socialCategory || "").toUpperCase();
  if (normalizedCategory === "SC" || normalizedCategory === "ST") {
    reasons.push("SC/ST inclusion boost applied");
  } else if (normalizedCategory === "OBC") {
    reasons.push("OBC inclusion boost applied");
  }

  if (!hasPreviousInternship) {
    reasons.push("First-time applicant priority applied");
  }

  if (reasons.length === 0) {
    reasons.push("No policy boost applied");
  }

  return reasons;
};

const getSuitabilitySummary = (finalScore: number): string => {
  if (finalScore >= 0.7) {
    return "Strong match — student profile aligns well with this role";
  }
  if (finalScore >= 0.5) {
    return "Moderate match — student meets core requirements";
  }
  return "Weak match — significant skill gaps present";
};

export default function AdminPage() {
  const router = useRouter();

  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [recentAllocations, setRecentAllocations] = useState<RecentAllocation[]>([]);
  const [internships, setInternships] = useState<Internship[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [selectedAllocation, setSelectedAllocation] = useState<RecentAllocation | null>(null);
  const [studentApplications, setStudentApplications] = useState<AdminStudentApplication[]>([]);
  const [selectedStudentApplication, setSelectedStudentApplication] =
    useState<AdminStudentApplication | null>(null);
  const [scoreDistribution, setScoreDistribution] = useState<ScoreDistribution>({
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  });

  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [isAdminReady, setIsAdminReady] = useState(false);
  const [allocating, setAllocating] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [overridingAllocation, setOverridingAllocation] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [ruralFilter, setRuralFilter] = useState<string>("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingStudentApplications, setLoadingStudentApplications] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [overrideInternshipId, setOverrideInternshipId] = useState<string>("none");
  const [bulkActionType, setBulkActionType] = useState<BulkActionType>("selected");
  const [bulkMinScorePercent, setBulkMinScorePercent] = useState(65);
  const [bulkMaxScorePercent, setBulkMaxScorePercent] = useState(100);
  const [previewingBulkAction, setPreviewingBulkAction] = useState(false);
  const [applyingBulkAction, setApplyingBulkAction] = useState(false);
  const [bulkActionPreview, setBulkActionPreview] = useState<BulkActionPreviewResult | null>(null);

  const formatDate = useCallback((value: string) => {
    return new Date(value).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedStudentSearch(studentSearch.trim());
    }, 250);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [studentSearch]);

  useEffect(() => {
    setBulkActionPreview(null);
  }, [bulkActionType, bulkMinScorePercent, bulkMaxScorePercent]);

  useEffect(() => {
    if (!selectedStudentApplication) {
      return;
    }

    const refreshed = studentApplications.find(
      (application) => application.id === selectedStudentApplication.id
    );

    if (!refreshed) {
      setSelectedStudentApplication(null);
      return;
    }

    if (refreshed !== selectedStudentApplication) {
      setSelectedStudentApplication(refreshed);
    }
  }, [studentApplications, selectedStudentApplication]);

  const loadStudentApplications = useCallback(async (studentId: number) => {
    setLoadingStudentApplications(true);
    try {
      const rows = await getAdminStudentApplications(studentId);
      setStudentApplications(rows);
    } catch {
      toast({
        title: "Failed to load applications",
        description: "Could not fetch student applications.",
        variant: "destructive",
      });
      setStudentApplications([]);
    } finally {
      setLoadingStudentApplications(false);
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    const [analyticsData, allocationRows, internshipRows] = await Promise.all([
      getAnalytics(),
      getRecentAllocations(),
      getAdminInternships({ skip: 0, limit: 100 }),
    ]);

    setAnalytics(analyticsData);
    setRecentAllocations(allocationRows);
    setInternships(internshipRows);
  }, []);

  const refreshAnalyticsAndAllocations = useCallback(async () => {
    try {
      const [analyticsData, allocationRows, internshipRows] = await Promise.all([
        getAnalytics(),
        getRecentAllocations(),
        getAdminInternships({ skip: 0, limit: 100 }),
      ]);
      setAnalytics(analyticsData);
      setRecentAllocations(allocationRows);
      setInternships(internshipRows);
    } catch {
      // Non-blocking refresh.
    }
  }, []);

  const loadStudentsData = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const studentParams: {
        skip: number;
        limit: number;
        search?: string;
        social_category?: string;
        is_rural?: boolean;
      } = {
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      };

      if (categoryFilter !== "all") {
        studentParams.social_category = categoryFilter;
      }
      if (ruralFilter !== "all") {
        studentParams.is_rural = ruralFilter === "rural";
      }
      if (debouncedStudentSearch) {
        studentParams.search = debouncedStudentSearch;
      }

      const studentRows = await getAdminStudents(studentParams);
      setStudents(studentRows);
      setHasMore(studentRows.length === PAGE_SIZE);

      const scoreBuckets: ScoreDistribution = {
        high: 0,
        medium: 0,
        low: 0,
        none: 0,
      };

      const scores = await Promise.all(
        studentRows.map(async (student) => {
          try {
            const res = await getRecommendations(student.id);
            return res.recommendations[0]?.final_score ?? null;
          } catch {
            return null;
          }
        })
      );

      for (const score of scores) {
        if (score === null) {
          scoreBuckets.none += 1;
        } else if (score >= 0.7) {
          scoreBuckets.high += 1;
        } else if (score >= 0.5) {
          scoreBuckets.medium += 1;
        } else {
          scoreBuckets.low += 1;
        }
      }

      setScoreDistribution(scoreBuckets);
    } catch {
      toast({
        title: "Failed to load students",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoadingStudents(false);
    }
  }, [page, categoryFilter, ruralFilter, debouncedStudentSearch]);

  useEffect(() => {
    const initializeAdmin = async () => {
      if (!getToken()) {
        router.replace("/login");
        return;
      }

      try {
        const me = await getMe();
        if (me.role !== "admin") {
          router.replace("/dashboard");
          return;
        }

        await loadDashboardData();
        setIsAdminReady(true);
      } catch {
        toast({
          title: "Failed to load admin analytics",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      } finally {
        setLoadingPage(false);
      }
    };

    void initializeAdmin();
  }, [router, loadDashboardData]);

  useEffect(() => {
    if (!isAdminReady) {
      return;
    }

    void loadStudentsData();
  }, [isAdminReady, loadStudentsData]);

  const handleAllocate = async () => {
    setAllocating(true);
    try {
      const res = await bulkAllocate();
      toast({
        title: "Bulk allocation completed",
        description: `Processed ${res.students_processed} students and created ${res.applications_created} applications.`,
        variant: "success",
      });

      await Promise.all([loadDashboardData(), loadStudentsData()]);
    } catch {
      toast({
        title: "Allocation failed",
        description: "Unable to run bulk allocation right now.",
        variant: "destructive",
      });
    } finally {
      setAllocating(false);
    }
  };

  const handleDemoReset = async () => {
    const confirmed = window.confirm(
      "This will clear pending and under-review applications, and all recommendations.\nSelected and rejected applications will remain intact.\nUse this before a live demo. Continue?"
    );

    if (!confirmed) {
      return;
    }

    setResettingDemo(true);
    try {
      const result = await demoReset();

      toast({
        title: "Demo reset complete.",
        description: `${result.applications_cleared} pending applications cleared. ${result.applications_preserved} confirmed placements preserved. Ready for bulk allocation.`,
        variant: "success",
      });

      if (selectedStudent) {
        setStudentApplications([]);
      }

      await Promise.all([loadDashboardData(), loadStudentsData()]);
    } catch {
      toast({
        title: "Demo reset failed",
        description: "Could not clear applications and recommendations.",
        variant: "destructive",
      });
    } finally {
      setResettingDemo(false);
    }
  };

  const invokeBulkAction = async (
    dryRun: boolean
  ): Promise<BulkActionPreviewResult | BulkActionApplyResult> => {
    const payload = {
      action: bulkActionType,
      min_score: bulkMinScorePercent / 100,
      max_score: bulkMaxScorePercent / 100,
      dry_run: dryRun,
    };

    const response = await api.post<BulkActionPreviewResult | BulkActionApplyResult>(
      "/admin/bulk-action",
      payload
    );

    return response.data;
  };

  const handlePreviewBulkAction = async () => {
    setPreviewingBulkAction(true);
    try {
      const result = await invokeBulkAction(true);
      if (result.dry_run) {
        const parseNullableNumber = (value: unknown): number | null => {
          if (typeof value === "number" && Number.isFinite(value)) {
            return value;
          }
          if (typeof value === "string" && value.trim().length > 0) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
          }
          return null;
        };

        const normalizedPreview: BulkActionPreviewResult = {
          ...result,
          preview_sample: result.preview_sample.map((row) => {
            const raw = row as unknown as Record<string, unknown>;
            return {
              ...row,
              application_id: parseNullableNumber(
                raw.application_id ?? raw.applicationId ?? raw.applicationID ?? raw.id
              ),
              student_id: parseNullableNumber(
                raw.student_id ?? raw.studentId ?? raw.studentID
              ),
            };
          }),
        };
        setBulkActionPreview(normalizedPreview);
      }
    } catch {
      toast({
        title: "Preview failed",
        description: "Could not generate bulk action preview.",
        variant: "destructive",
      });
    } finally {
      setPreviewingBulkAction(false);
    }
  };

  const handleConfirmBulkAction = async () => {
    if (!bulkActionPreview) {
      return;
    }

    const actionLabel = BULK_ACTION_LABELS[bulkActionType];
    const confirmed = window.confirm(
      `You are about to ${actionLabel.toLowerCase()} ${bulkActionPreview.applications_affected} applications where final score is between ${bulkMinScorePercent}% and ${bulkMaxScorePercent}%. This cannot be undone for selected/rejected status. Continue?`
    );
    if (!confirmed) {
      return;
    }

    setApplyingBulkAction(true);
    try {
      const result = await invokeBulkAction(false);
      if (!result.dry_run) {
        toast({
          title: "Bulk action completed",
          description: `${result.applications_updated} applications updated across ${result.internships_affected} internships. ${result.skipped_due_to_seats} skipped due to seat limits.`,
          variant: "success",
        });

        setBulkActionPreview(null);
        await Promise.all([
          refreshAnalyticsAndAllocations(),
          loadStudentsData(),
          selectedStudent ? loadStudentApplications(selectedStudent.id) : Promise.resolve(),
        ]);
      }
    } catch {
      toast({
        title: "Bulk action failed",
        description: "Could not apply threshold-based bulk action.",
        variant: "destructive",
      });
    } finally {
      setApplyingBulkAction(false);
    }
  };

  const handleOpenApplications = async (student: StudentProfile) => {
    setSelectedStudent(student);
    setOverrideInternshipId("none");
    setSelectedStudentApplication(null);
    await loadStudentApplications(student.id);
  };

  const handleCloseApplications = () => {
    setSelectedStudent(null);
    setStudentApplications([]);
    setSelectedStudentApplication(null);
    setOverrideInternshipId("none");
  };

  const handleUpdateApplicationStatus = async (
    applicationId: number,
    nextStatus: Exclude<ApplicationStatus, "pending">,
    options: UpdateStatusOptions = {}
  ) => {
    if (nextStatus === "selected" || nextStatus === "rejected") {
      const actionLabel = nextStatus === "selected" ? "select" : "reject";
      const confirmed = window.confirm(
        `Are you sure you want to ${actionLabel} this application?`
      );
      if (!confirmed) {
        return;
      }
    }

    setUpdatingStatusId(applicationId);
    try {
      await updateApplicationStatus(applicationId, nextStatus);
      toast({
        title: "Status updated",
        description: `Application moved to ${STATUS_LABELS[nextStatus]}.`,
        variant: "success",
      });

      if (selectedStudent) {
        await loadStudentApplications(selectedStudent.id);
      }

      await refreshAnalyticsAndAllocations();

      if (options.closeAllocationModal) {
        setSelectedAllocation(null);
      }
      if (options.closeStudentApplicationDetail) {
        setSelectedStudentApplication(null);
      }
    } catch {
      toast({
        title: "Status update failed",
        description: "Could not update application status.",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleManualOverride = async () => {
    if (!selectedStudent || overrideInternshipId === "none") {
      return;
    }

    const internshipId = Number(overrideInternshipId);
    if (!Number.isFinite(internshipId)) {
      return;
    }

    const selectedInternship = internships.find(
      (internship) => internship.id === internshipId
    );

    if (!selectedInternship || !selectedInternship.is_active) {
      toast({
        title: "Override failed",
        description: "Selected internship is no longer active.",
        variant: "destructive",
      });
      return;
    }

    if (selectedInternship.available_seats <= 0) {
      toast({
        title: "This internship has no available seats",
        variant: "destructive",
      });
      return;
    }

    setOverridingAllocation(true);
    try {
      await manualOverrideAllocation({
        student_id: selectedStudent.id,
        internship_id: internshipId,
      });
      toast({
        title: "Manual allocation applied",
        description: "Student allocation updated successfully.",
        variant: "success",
      });

      await loadStudentApplications(selectedStudent.id);
      await refreshAnalyticsAndAllocations();
    } catch (error: unknown) {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not apply manual allocation.";

      if (detail.toLowerCase().includes("no available seats")) {
        toast({
          title: "This internship has no available seats",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Override failed",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setOverridingAllocation(false);
    }
  };

  const statusData = useMemo(() => {
    const byStatus = analytics?.applications_by_status ?? {};
    return [
      { key: "pending", name: "Pending", value: byStatus.pending ?? 0 },
      { key: "under_review", name: "Under Review", value: byStatus.under_review ?? 0 },
      { key: "selected", name: "Selected", value: byStatus.selected ?? 0 },
      { key: "rejected", name: "Rejected", value: byStatus.rejected ?? 0 },
    ];
  }, [analytics]);

  const categoryData = useMemo(() => {
    const byCategory = analytics?.students_by_category ?? {};
    return Object.entries(byCategory).map(([name, value]) => ({ name, value }));
  }, [analytics]);

  const scoreData = useMemo(
    () => [
      { name: "High (70%+) ", value: scoreDistribution.high },
      { name: "Medium (50-69%)", value: scoreDistribution.medium },
      { name: "Low (<50%)", value: scoreDistribution.low },
      { name: "No Recommendation", value: scoreDistribution.none },
    ],
    [scoreDistribution]
  );

  const ruralCount = analytics?.rural_student_count ?? 0;
  const totalStudents = analytics?.total_students ?? 0;
  const urbanCount = Math.max(totalStudents - ruralCount, 0);
  const districtData = useMemo(() => {
    const rows = Object.entries(analytics?.district_distribution ?? {}).map(([name, value]) => ({
      name,
      value,
    }));
    return rows.slice(0, 10);
  }, [analytics]);
  const capacityUtilizationPercent = Math.round((analytics?.capacity_utilization_rate ?? 0) * 100);
  const activeInternshipsForOverride = internships.filter((internship) => internship.is_active);
  const selectedOverrideInternship =
    overrideInternshipId === "none"
      ? null
      : activeInternshipsForOverride.find(
          (internship) => internship.id === Number(overrideInternshipId)
        ) || null;
  const isSelectedOverrideInternshipFull =
    selectedOverrideInternship !== null && selectedOverrideInternship.available_seats <= 0;
  const eligibleBulkApplicationsCount =
    (analytics?.applications_by_status.pending ?? 0) +
    (analytics?.applications_by_status.under_review ?? 0);
  const showLowThresholdWarning = bulkActionType === "selected" && bulkMinScorePercent < 50;
  const showHighThresholdWarning = bulkActionType === "rejected" && bulkMinScorePercent > 70;

  if (loadingPage) {
    return <AdminSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin Analytics</h1>
          <p className="text-muted-foreground">Monitor placement outcomes and distribution metrics.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/manage-internships">
            <Button variant="outline">Manage Internships</Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              void handleDemoReset();
            }}
            disabled={resettingDemo || allocating || loadingStudents}
            className="gap-2 border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {resettingDemo && <Loader2 className="h-4 w-4 animate-spin" />}
            Reset Demo
          </Button>
          <Button
            variant="accent"
            onClick={handleAllocate}
            disabled={allocating || loadingStudents || resettingDemo}
            className="gap-2"
          >
            {allocating && <Loader2 className="h-4 w-4 animate-spin" />}
            Bulk Allocate
          </Button>
        </div>
      </div>

      <div className="mb-8 rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-green-accent" />
          <h2 className="font-semibold">Threshold-Based Bulk Action</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Applies to pending and under-review applications only. Confirmed decisions (selected/rejected) are never modified.
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Bulk Action</Label>
            <Select
              value={bulkActionType}
              onValueChange={(value) => {
                const nextAction = value as BulkActionType;
                setBulkActionType(nextAction);
                if (nextAction === "selected") {
                  setBulkMinScorePercent(65);
                  setBulkMaxScorePercent(100);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="under_review">Move to Under Review</SelectItem>
                <SelectItem value="selected">Select (confirm placement)</SelectItem>
                <SelectItem value="rejected">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bulk-min-score">Min Score: {bulkMinScorePercent}%</Label>
                <input
                  id="bulk-min-score"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={bulkMinScorePercent}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setBulkMinScorePercent(Math.min(next, bulkMaxScorePercent));
                  }}
                  className="w-full accent-green-accent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-max-score">Max Score: {bulkMaxScorePercent}%</Label>
                <input
                  id="bulk-max-score"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={bulkMaxScorePercent}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setBulkMaxScorePercent(Math.max(next, bulkMinScorePercent));
                  }}
                  className="w-full accent-green-accent"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Score range applied: {bulkMinScorePercent}% to {bulkMaxScorePercent}%
            </p>
          </div>
        </div>

        {showLowThresholdWarning && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <span>
                Low threshold warning: scores below 50% may indicate poor skill alignment.
              </span>
            </div>
          </div>
        )}

        {showHighThresholdWarning && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <span>
                High threshold warning: you are rejecting strong candidates.
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              void handlePreviewBulkAction();
            }}
            disabled={previewingBulkAction || applyingBulkAction || eligibleBulkApplicationsCount === 0}
          >
            {previewingBulkAction && <Loader2 className="h-4 w-4 animate-spin" />}
            Preview Impact
          </Button>

          {bulkActionPreview && (
            <Button
              variant={bulkActionType === "selected" || bulkActionType === "rejected" ? "destructive" : "accent"}
              className="gap-2"
              onClick={() => {
                void handleConfirmBulkAction();
              }}
              disabled={applyingBulkAction}
            >
              {applyingBulkAction && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirm Bulk {BULK_ACTION_LABELS[bulkActionType]}
            </Button>
          )}
        </div>

        {eligibleBulkApplicationsCount === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            No pending or under-review applications are available for threshold-based actions.
          </p>
        )}

        {bulkActionPreview && (
          <div className="mt-5 rounded-xl border bg-muted/10 p-4">
            <h3 className="text-sm font-semibold">Preview</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              This will affect {bulkActionPreview.students_affected} students across {bulkActionPreview.internships_affected} internships.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {bulkActionPreview.skipped_due_to_seats} students skipped due to seat limits.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Score range: {Math.round(bulkActionPreview.score_range.min * 100)}% to {Math.round(bulkActionPreview.score_range.max * 100)}%
            </p>

            {bulkActionPreview.preview_sample.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No matching applications found for this threshold.
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-220">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Application ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Student ID</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Student</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Internship</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Company</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Score</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Current Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkActionPreview.preview_sample.map((row, index) => (
                      <tr key={`${row.application_id ?? `row-${index + 1}`}-${index}`} className="border-b last:border-b-0">
                        <td className="px-3 py-2 text-sm font-medium">{row.application_id ?? "N/A"}</td>
                        <td className="px-3 py-2 text-sm">{row.student_id ?? "N/A"}</td>
                        <td className="px-3 py-2 text-sm font-medium">{row.student_name}</td>
                        <td className="px-3 py-2 text-sm">{row.internship_title}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{row.company}</td>
                        <td className="px-3 py-2 text-sm">{Math.round(row.final_score * 100)}%</td>
                        <td className="px-3 py-2 text-sm">{row.current_status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <StatCard title="Total Students" value={analytics?.total_students ?? 0} icon={Users} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 }}>
          <StatCard
            title="District Coverage"
            value={analytics?.district_coverage_count ?? 0}
            icon={MapPinned}
            description={`${analytics?.selected_district_coverage_count ?? 0} districts with selected placements`}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <StatCard title="Rural Students" value={analytics?.rural_student_count ?? 0} icon={GraduationCap} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <StatCard title="Internships" value={analytics?.total_internships ?? 0} icon={Briefcase} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <StatCard title="Applications" value={analytics?.total_applications ?? 0} icon={FileText} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
          <StatCard
            title="Capacity Utilization"
            value={`${capacityUtilizationPercent}%`}
            icon={Gauge}
            description={`${analytics?.internships_near_capacity ?? 0} internships near capacity`}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <StatCard
            title="Placement Rate"
            value={`${Math.round((analytics?.placement_rate ?? 0) * 100)}%`}
            icon={Target}
          />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Students by Category</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  label
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Applications by Status</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {statusData.map((entry) => (
                    <Cell key={entry.key} fill={STATUS_COLORS[entry.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Match Score Distribution</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#0F3D5E" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Rural vs Urban</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Rural", value: ruralCount },
                    { name: "Urban", value: urbanCount },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={85}
                  label
                >
                  <Cell fill="#20C997" />
                  <Cell fill="#0F3D5E" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Rural students: <span className="font-medium text-foreground">{ruralCount}</span>
            {" · "}
            Urban students: <span className="font-medium text-foreground">{urbanCount}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">District Coverage (Top Districts)</h2>
          {districtData.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No district data available.</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={districtData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-20} textAnchor="end" height={60} interval={0} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#20C997" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-4 font-semibold">Capacity Utilization</h2>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall Utilization</span>
                <span className="font-medium">{capacityUtilizationPercent}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-green-accent"
                  style={{ width: `${Math.min(100, Math.max(0, capacityUtilizationPercent))}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Near Capacity (&gt;=80%)</p>
                <p className="mt-1 text-2xl font-bold">{analytics?.internships_near_capacity ?? 0}</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Active Internships</p>
                <p className="mt-1 text-2xl font-bold">{internships.filter((i) => i.is_active).length}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <FileText className="h-5 w-5 text-green-accent" />
          <h2 className="font-semibold">Recent Allocations</h2>
        </div>

        {recentAllocations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No allocations found yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-190">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Student Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Internship</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Match Score</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Applied Date</th>
                </tr>
              </thead>
              <tbody>
                {recentAllocations.map((allocation) => (
                  <tr
                    key={allocation.id}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-muted/20"
                    onClick={() => {
                      setSelectedAllocation(allocation);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedAllocation(allocation);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{allocation.student_name}</td>
                    <td className="px-4 py-3 text-sm">{allocation.internship_title}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{allocation.company}</td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge status={allocation.status} />
                    </td>
                    <td className="px-4 py-3 text-sm">{Math.round(allocation.final_score * 100)}%</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(allocation.applied_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-green-accent" />
            <h2 className="font-semibold">Student Directory</h2>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <div className="relative sm:col-span-3 lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search students by name, college, district..."
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setPage(0);
                }}
                className="w-full pl-9"
              />
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="GEN">GEN</SelectItem>
                <SelectItem value="OBC">OBC</SelectItem>
                <SelectItem value="SC">SC</SelectItem>
                <SelectItem value="ST">ST</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={ruralFilter}
              onValueChange={(value) => {
                setRuralFilter(value);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                <SelectItem value="rural">Rural</SelectItem>
                <SelectItem value="urban">Urban</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingStudents ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading students...
          </div>
        ) : students.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No students found for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-280">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">College</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">District</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Rural</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Previous Internship</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr
                    key={student.id}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-muted/20"
                    onClick={() => {
                      void handleOpenApplications(student);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void handleOpenApplications(student);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{student.full_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{student.college || "-"}</td>
                    <td className="px-4 py-3 text-sm">{student.social_category || "UNKNOWN"}</td>
                    <td className="px-4 py-3 text-sm">{student.district || "-"}</td>
                    <td className="px-4 py-3 text-sm">{student.is_rural ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-sm">{student.has_previous_internship ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            disabled={page === 0 || loadingStudents}
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button
            variant="outline"
            disabled={!hasMore || loadingStudents}
            onClick={() => setPage((prev) => prev + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {selectedAllocation && (
        <div className="fixed inset-0 z-130 flex items-center justify-center bg-black/55 p-4">
          <button
            aria-label="Close allocation details"
            className="absolute inset-0"
            onClick={() => setSelectedAllocation(null)}
          />

          <div className="relative z-10 max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-card px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Application Detail: {selectedAllocation.student_name}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedAllocation.internship_title} at {selectedAllocation.company}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedAllocation(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-xl border bg-muted/20 p-4">
                <h3 className="mb-3 text-sm font-semibold">Student Section</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div>
                    <p className="text-xs text-muted-foreground">Full Name</p>
                    <p className="text-sm font-medium">{selectedAllocation.student_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">College</p>
                    <p className="text-sm font-medium">{selectedAllocation.student_college || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Branch</p>
                    <p className="text-sm font-medium">{selectedAllocation.student_branch || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Graduation Year</p>
                    <p className="text-sm font-medium">{selectedAllocation.student_graduation_year ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">CGPA</p>
                    <p className="text-sm font-medium">
                      {selectedAllocation.student_cgpa !== null && selectedAllocation.student_cgpa !== undefined
                        ? selectedAllocation.student_cgpa.toFixed(2)
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Social Category</p>
                    <p className="text-sm font-medium">{selectedAllocation.social_category || "UNKNOWN"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">District</p>
                    <p className="text-sm font-medium">{selectedAllocation.student_district || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">State</p>
                    <p className="text-sm font-medium">{selectedAllocation.student_state || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Is Rural</p>
                    <p className="text-sm font-medium">{selectedAllocation.is_rural ? "Yes" : "No"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Previous Internship</p>
                    <p className="text-sm font-medium">
                      {selectedAllocation.has_previous_internship ? "Yes" : "No"}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-2 text-xs text-muted-foreground">Skills</p>
                  {selectedAllocation.student_skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedAllocation.student_skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No skills listed.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <h3 className="mb-3 text-sm font-semibold">Internship Section</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Role Title</p>
                    <p className="text-sm font-medium">{selectedAllocation.internship_title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="text-sm font-medium">{selectedAllocation.company}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium">{selectedAllocation.internship_location}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">State</p>
                    <p className="text-sm font-medium">{selectedAllocation.internship_state}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sector</p>
                    <p className="text-sm font-medium">{selectedAllocation.internship_sector}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-medium">{selectedAllocation.internship_duration_months} months</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Stipend</p>
                    <p className="text-sm font-medium">{formatStipend(selectedAllocation.internship_stipend)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Available Seats</p>
                    <p className="text-sm font-medium">
                      {selectedAllocation.internship_available_seats} ({selectedAllocation.internship_total_seats} total - {selectedAllocation.internship_filled_seats} filled)
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-2 text-xs text-muted-foreground">Required Skills</p>
                  {selectedAllocation.internship_required_skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedAllocation.internship_required_skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No required skills listed.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <h3 className="mb-3 text-sm font-semibold">AI Match Analysis</h3>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[130px_1fr]">
                  <div className="flex items-center justify-center">
                    <MatchScoreRing score={clampScore(selectedAllocation.final_score)} size={112} strokeWidth={9} />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>Skill Match</span>
                        <span>{scoreToPercent(selectedAllocation.content_score)}%</span>
                      </div>
                      <Progress value={scoreToPercent(selectedAllocation.content_score)} indicatorClassName="bg-emerald-500" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>Collaborative Score</span>
                        <span>{scoreToPercent(selectedAllocation.collaborative_score)}%</span>
                      </div>
                      <Progress value={scoreToPercent(selectedAllocation.collaborative_score)} indicatorClassName="bg-blue-500" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>Policy Boost</span>
                        <span>{scoreToPercent(selectedAllocation.affirmative_score)}%</span>
                      </div>
                      <Progress value={scoreToPercent(selectedAllocation.affirmative_score)} indicatorClassName="bg-amber-500" />
                    </div>
                  </div>
                </div>

                {(() => {
                  const skillInsights = buildSkillInsights(
                    selectedAllocation.student_skills,
                    selectedAllocation.internship_required_skills,
                    selectedAllocation.matched_skills,
                    selectedAllocation.missing_skills
                  );
                  return (
                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">Matched Skills</p>
                        {skillInsights.matched.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {skillInsights.matched.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No matched skills identified.</p>
                        )}
                      </div>
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">Missing Skills</p>
                        {skillInsights.missing.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {skillInsights.missing.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No missing skills identified.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-4 rounded-lg border bg-background/70 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Policy Boost Explanation</p>
                  <div className="space-y-1 text-sm">
                    {getPolicyBoostExplanations(
                      selectedAllocation.social_category,
                      selectedAllocation.is_rural,
                      selectedAllocation.has_previous_internship
                    ).map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <h3 className="mb-3 text-sm font-semibold">Decision Section</h3>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Current Status:</span>
                    <StatusBadge status={selectedAllocation.status} />
                  </div>

                  {selectedAllocation.status === "selected" ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Selected ✓
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {NEXT_STATUS_MAP[selectedAllocation.status].map((nextStatus) => (
                        <Button
                          key={nextStatus}
                          variant="outline"
                          className={STATUS_BUTTON_STYLES[nextStatus]}
                          disabled={updatingStatusId === selectedAllocation.id}
                          onClick={() => {
                            void handleUpdateApplicationStatus(selectedAllocation.id, nextStatus, {
                              closeAllocationModal: true,
                            });
                          }}
                        >
                          {updatingStatusId === selectedAllocation.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {STATUS_ACTION_LABELS[nextStatus]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedStudent && (
        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/50 p-4">
          <button
            aria-label="Close applications"
            className="absolute inset-0"
            onClick={handleCloseApplications}
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border bg-card shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Student Applications: {selectedStudent.full_name}</h2>
                <p className="text-sm text-muted-foreground">Review profile details and manage this student&apos;s applications.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={handleCloseApplications}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-6">
              <div className="mb-5 rounded-xl border bg-muted/20 p-4">
                <h3 className="mb-3 text-sm font-semibold">Student Details</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm font-medium">{selectedStudent.full_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">College</p>
                    <p className="text-sm font-medium">{selectedStudent.college || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p className="text-sm font-medium">{selectedStudent.social_category || "UNKNOWN"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">District</p>
                    <p className="text-sm font-medium">{selectedStudent.district || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rural Status</p>
                    <p className="text-sm font-medium">{selectedStudent.is_rural ? "Rural" : "Urban"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">State</p>
                    <p className="text-sm font-medium">{selectedStudent.state || "-"}</p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-2 text-xs text-muted-foreground">Skills</p>
                  {selectedStudent.skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedStudent.skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No skills listed.</p>
                  )}
                </div>
              </div>

              <div className="mb-5 rounded-xl border bg-muted/20 p-4">
                <h3 className="mb-2 text-sm font-semibold">Manual Allocation Override</h3>
                <p className="mb-3 text-xs text-muted-foreground">
                  Assign this student to a specific internship manually.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Select
                    value={overrideInternshipId}
                    onValueChange={(value) => setOverrideInternshipId(value)}
                  >
                    <SelectTrigger className="w-full sm:w-md">
                      <SelectValue placeholder="Select internship" />
                    </SelectTrigger>
                    <SelectContent className="z-230">
                      <SelectItem value="none">Select Internship</SelectItem>
                      {activeInternshipsForOverride.map((internship) => (
                        <SelectItem key={internship.id} value={String(internship.id)}>
                          {internship.title} - {internship.company} ({Math.max(0, internship.available_seats)} seats left)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    variant="accent"
                    className="gap-2"
                    onClick={() => {
                      void handleManualOverride();
                    }}
                    disabled={
                      overrideInternshipId === "none" ||
                      overridingAllocation ||
                      isSelectedOverrideInternshipFull
                    }
                  >
                    {overridingAllocation && <Loader2 className="h-4 w-4 animate-spin" />}
                    Assign Internship
                  </Button>
                </div>

                {selectedOverrideInternship && (
                  <p
                    className={
                      isSelectedOverrideInternshipFull
                        ? "mt-2 text-sm text-red-600"
                        : "mt-2 text-sm text-muted-foreground"
                    }
                  >
                    {isSelectedOverrideInternshipFull
                      ? "This internship has no available seats"
                      : `${Math.max(0, selectedOverrideInternship.available_seats)} seats remaining for this internship.`}
                  </p>
                )}
              </div>

              {loadingStudentApplications ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading applications...
                </div>
              ) : studentApplications.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No applications found for this student.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-312">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Internship Title</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Company</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Applied Date</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Match Score</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Set Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentApplications.map((application) => (
                        <tr
                          key={application.id}
                          className="cursor-pointer border-b last:border-b-0 hover:bg-muted/20"
                          onClick={() => {
                            setSelectedStudentApplication(application);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedStudentApplication(application);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <td className="px-4 py-3 text-sm font-medium">{application.internship_title}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{application.company}</td>
                          <td className="px-4 py-3 text-sm">
                            <StatusBadge status={application.status} />
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(application.applied_at)}</td>
                          <td className="px-4 py-3 text-sm">{Math.round(application.final_score * 100)}%</td>
                          <td className="px-4 py-3 text-sm">
                            {application.status === "selected" ? (
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                Selected ✓
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {NEXT_STATUS_MAP[application.status].map((nextStatus) => (
                                  <Button
                                    key={nextStatus}
                                    size="sm"
                                    variant="outline"
                                    className={STATUS_BUTTON_STYLES[nextStatus]}
                                    disabled={updatingStatusId === application.id}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void handleUpdateApplicationStatus(application.id, nextStatus);
                                    }}
                                  >
                                    {updatingStatusId === application.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    {STATUS_ACTION_LABELS[nextStatus]}
                                  </Button>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedStudent && selectedStudentApplication && (
        <div className="fixed inset-0 z-150 flex items-center justify-center bg-black/60 p-4">
          <button
            aria-label="Close application details"
            className="absolute inset-0"
            onClick={() => setSelectedStudentApplication(null)}
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-card px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">Application Detail: {selectedStudentApplication.internship_title}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedStudentApplication.student_name} · {selectedStudentApplication.company}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedStudentApplication(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-5 p-6">
              <div className="rounded-xl border bg-muted/20 p-4">
                <h4 className="mb-3 text-sm font-semibold">Internship Details</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Role Title</p>
                    <p className="text-sm font-medium">{selectedStudentApplication.internship_title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="text-sm font-medium">{selectedStudentApplication.company}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium">{selectedStudentApplication.internship_location}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Sector</p>
                    <p className="text-sm font-medium">{selectedStudentApplication.internship_sector}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-medium">{selectedStudentApplication.internship_duration_months} months</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Stipend</p>
                    <p className="text-sm font-medium">{formatStipend(selectedStudentApplication.internship_stipend)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Available Seats</p>
                    <p className="text-sm font-medium">
                      {selectedStudentApplication.internship_available_seats} ({selectedStudentApplication.internship_total_seats} total - {selectedStudentApplication.internship_filled_seats} filled)
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-2 text-xs text-muted-foreground">Required Skills</p>
                  {selectedStudentApplication.internship_required_skills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedStudentApplication.internship_required_skills.map((skill) => (
                        <span
                          key={skill}
                          className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No required skills listed.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <h4 className="mb-3 text-sm font-semibold">AI Match Reasoning</h4>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[130px_1fr]">
                  <div className="flex items-center justify-center">
                    <MatchScoreRing score={clampScore(selectedStudentApplication.final_score)} size={112} strokeWidth={9} />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>Skill Match</span>
                        <span>{scoreToPercent(selectedStudentApplication.content_score)}%</span>
                      </div>
                      <Progress value={scoreToPercent(selectedStudentApplication.content_score)} indicatorClassName="bg-emerald-500" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>Collaborative Score</span>
                        <span>{scoreToPercent(selectedStudentApplication.collaborative_score)}%</span>
                      </div>
                      <Progress value={scoreToPercent(selectedStudentApplication.collaborative_score)} indicatorClassName="bg-blue-500" />
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>Policy Boost</span>
                        <span>{scoreToPercent(selectedStudentApplication.affirmative_score)}%</span>
                      </div>
                      <Progress value={scoreToPercent(selectedStudentApplication.affirmative_score)} indicatorClassName="bg-amber-500" />
                    </div>
                  </div>
                </div>

                {(() => {
                  const skillInsights = buildSkillInsights(
                    selectedStudentApplication.student_skills,
                    selectedStudentApplication.internship_required_skills,
                    selectedStudentApplication.matched_skills,
                    selectedStudentApplication.missing_skills
                  );

                  return (
                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">Matched Skills</p>
                        {skillInsights.matched.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {skillInsights.matched.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No matched skills identified.</p>
                        )}
                      </div>

                      <div>
                        <p className="mb-2 text-xs text-muted-foreground">Missing Skills</p>
                        {skillInsights.missing.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {skillInsights.missing.map((skill) => (
                              <span
                                key={skill}
                                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No missing skills identified.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="mt-4 rounded-lg border bg-background/70 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Policy Boost Explanation</p>
                  <div className="space-y-1 text-sm">
                    {getPolicyBoostExplanations(
                      selectedStudentApplication.social_category,
                      selectedStudentApplication.is_rural,
                      selectedStudentApplication.has_previous_internship
                    ).map((reason) => (
                      <p key={reason}>{reason}</p>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  {getSuitabilitySummary(selectedStudentApplication.final_score)}
                </div>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <h4 className="mb-3 text-sm font-semibold">Decision Buttons</h4>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Current Status:</span>
                    <StatusBadge status={selectedStudentApplication.status} />
                  </div>

                  {selectedStudentApplication.status === "selected" ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      Selected ✓
                    </span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {NEXT_STATUS_MAP[selectedStudentApplication.status].map((nextStatus) => (
                        <Button
                          key={nextStatus}
                          variant="outline"
                          className={STATUS_BUTTON_STYLES[nextStatus]}
                          disabled={updatingStatusId === selectedStudentApplication.id}
                          onClick={() => {
                            void handleUpdateApplicationStatus(
                              selectedStudentApplication.id,
                              nextStatus,
                              { closeStudentApplicationDetail: true }
                            );
                          }}
                        >
                          {updatingStatusId === selectedStudentApplication.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {STATUS_ACTION_LABELS[nextStatus]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
