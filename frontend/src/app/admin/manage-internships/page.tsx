"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, Loader2, Plus, X } from "lucide-react";
import {
  createAdminInternship,
  getAdminInternships,
  getMe,
  updateInternship,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  Internship,
  InternshipCreateRequest,
  InternshipUpdateRequest,
} from "@/lib/types";
import { AdminSkeleton } from "@/components/ui/loading-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

interface InternshipFormState {
  title: string;
  company: string;
  sector: string;
  location: string;
  state: string;
  required_skills: string;
  description: string;
  duration_months: number | "";
  stipend: number | "";
  total_seats: number | "";
}

interface InternshipEditFormState {
  id: number;
  title: string;
  company: string;
  sector: string;
  location: string;
  state: string;
  required_skills: string;
  description: string;
  duration_months: number | "";
  stipend: number | "";
  total_seats: number | "";
  filled_seats: number | "";
  is_active: boolean;
}

const EMPTY_INTERNSHIP_FORM: InternshipFormState = {
  title: "",
  company: "",
  sector: "",
  location: "",
  state: "",
  required_skills: "",
  description: "",
  duration_months: "",
  stipend: "",
  total_seats: "",
};

const createInternshipEditForm = (internship: Internship): InternshipEditFormState => ({
  id: internship.id,
  title: internship.title,
  company: internship.company,
  sector: internship.sector,
  location: internship.location,
  state: internship.state,
  required_skills: internship.required_skills.join(", "),
  description: internship.description ?? "",
  duration_months: internship.duration_months,
  stipend: internship.stipend,
  total_seats: internship.total_seats,
  filled_seats: internship.filled_seats,
  is_active: internship.is_active,
});

export default function ManageInternshipsPage() {
  const router = useRouter();

  const [loadingPage, setLoadingPage] = useState(true);
  const [internships, setInternships] = useState<Internship[]>([]);

  const [creatingInternship, setCreatingInternship] = useState(false);
  const [togglingInternshipId, setTogglingInternshipId] = useState<number | null>(null);
  const [savingInternshipEdit, setSavingInternshipEdit] = useState(false);

  const [internshipForm, setInternshipForm] = useState<InternshipFormState>(
    EMPTY_INTERNSHIP_FORM
  );
  const [editingInternship, setEditingInternship] = useState<InternshipEditFormState | null>(null);

  const loadInternships = useCallback(async () => {
    const internshipRows = await getAdminInternships({ skip: 0, limit: 100 });
    setInternships(internshipRows);
  }, []);

  useEffect(() => {
    const initializePage = async () => {
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

        await loadInternships();
      } catch {
        toast({
          title: "Failed to load internships",
          description: "Please try again in a moment.",
          variant: "destructive",
        });
      } finally {
        setLoadingPage(false);
      }
    };

    void initializePage();
  }, [router, loadInternships]);

  const handleCreateInternship = async () => {
    const requiredSkills = internshipForm.required_skills
      .split(",")
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0);

    if (!internshipForm.title.trim() || !internshipForm.company.trim()) {
      toast({
        title: "Title and company are required",
        variant: "destructive",
      });
      return;
    }

    if (!internshipForm.sector.trim() || !internshipForm.location.trim() || !internshipForm.state.trim()) {
      toast({
        title: "Sector, location, and state are required",
        variant: "destructive",
      });
      return;
    }

    if (requiredSkills.length === 0) {
      toast({
        title: "Add at least one required skill",
        description: "Use comma-separated skills.",
        variant: "destructive",
      });
      return;
    }

    const durationMonths = Number(internshipForm.duration_months);
    const stipendAmount = Number(internshipForm.stipend);
    const totalSeats = Number(internshipForm.total_seats);

    if (!Number.isFinite(durationMonths) || durationMonths < 1) {
      toast({
        title: "Duration must be at least 1 month",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(stipendAmount) || stipendAmount < 0) {
      toast({
        title: "Stipend must be 0 or more",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(totalSeats) || totalSeats < 1) {
      toast({
        title: "Total seats must be at least 1",
        variant: "destructive",
      });
      return;
    }

    const payload: InternshipCreateRequest = {
      title: internshipForm.title.trim(),
      company: internshipForm.company.trim(),
      sector: internshipForm.sector.trim(),
      location: internshipForm.location.trim(),
      state: internshipForm.state.trim(),
      required_skills: requiredSkills,
      description: internshipForm.description.trim() || null,
      duration_months: durationMonths,
      stipend: stipendAmount,
      total_seats: totalSeats,
      filled_seats: 0,
    };

    setCreatingInternship(true);
    try {
      await createAdminInternship(payload);
      toast({
        title: "Internship created",
        description: "New internship listing added successfully.",
        variant: "success",
      });
      setInternshipForm(EMPTY_INTERNSHIP_FORM);
      await loadInternships();
    } catch (error: unknown) {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Please check the fields and try again.";
      toast({
        title: "Failed to create internship",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setCreatingInternship(false);
    }
  };

  const handleOpenInternshipEditor = (internship: Internship) => {
    setEditingInternship(createInternshipEditForm(internship));
  };

  const handleSaveInternshipEdit = async () => {
    if (!editingInternship) {
      return;
    }

    const requiredSkills = editingInternship.required_skills
      .split(",")
      .map((skill) => skill.trim())
      .filter((skill) => skill.length > 0);

    if (!editingInternship.title.trim() || !editingInternship.company.trim()) {
      toast({
        title: "Title and company are required",
        variant: "destructive",
      });
      return;
    }

    if (
      !editingInternship.sector.trim() ||
      !editingInternship.location.trim() ||
      !editingInternship.state.trim()
    ) {
      toast({
        title: "Sector, location, and state are required",
        variant: "destructive",
      });
      return;
    }

    if (requiredSkills.length === 0) {
      toast({
        title: "Add at least one required skill",
        description: "Use comma-separated skills.",
        variant: "destructive",
      });
      return;
    }

    const durationMonths = Number(editingInternship.duration_months);
    const stipendAmount = Number(editingInternship.stipend);
    const totalSeats = Number(editingInternship.total_seats);
    const filledSeats = Number(editingInternship.filled_seats);

    if (!Number.isFinite(durationMonths) || durationMonths < 1) {
      toast({
        title: "Duration must be at least 1 month",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(stipendAmount) || stipendAmount < 0) {
      toast({
        title: "Stipend must be 0 or more",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(totalSeats) || totalSeats < 1) {
      toast({
        title: "Total seats must be at least 1",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isFinite(filledSeats) || filledSeats < 0) {
      toast({
        title: "Filled seats must be 0 or more",
        variant: "destructive",
      });
      return;
    }

    if (filledSeats > totalSeats) {
      toast({
        title: "Filled seats cannot exceed total seats",
        variant: "destructive",
      });
      return;
    }

    const payload: InternshipUpdateRequest = {
      title: editingInternship.title.trim(),
      company: editingInternship.company.trim(),
      sector: editingInternship.sector.trim(),
      location: editingInternship.location.trim(),
      state: editingInternship.state.trim(),
      required_skills: requiredSkills,
      description: editingInternship.description.trim() || null,
      duration_months: durationMonths,
      stipend: stipendAmount,
      total_seats: totalSeats,
      filled_seats: filledSeats,
      is_active: editingInternship.is_active,
    };

    setSavingInternshipEdit(true);
    try {
      await updateInternship(editingInternship.id, payload);
      toast({
        title: "Internship updated",
        description: "Internship details saved successfully.",
        variant: "success",
      });
      setEditingInternship(null);
      await loadInternships();
    } catch (error: unknown) {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not update internship.";
      toast({
        title: "Update failed",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setSavingInternshipEdit(false);
    }
  };

  const handleToggleInternshipActive = async (internship: Internship) => {
    const nextIsActive = !internship.is_active;

    if (!nextIsActive) {
      const confirmed = window.confirm(
        "Are you sure you want to deactivate this internship? Deactivated internships are hidden from students on Explore."
      );
      if (!confirmed) {
        return;
      }
    }

    setTogglingInternshipId(internship.id);
    try {
      await updateInternship(internship.id, { is_active: nextIsActive });
      toast({
        title: nextIsActive ? "Internship activated" : "Internship deactivated",
        description: nextIsActive
          ? "Students can now see this internship on Explore."
          : "This internship is now hidden from students.",
        variant: "success",
      });

      await loadInternships();
    } catch (error: unknown) {
      const detail =
        (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Could not update internship status.";
      toast({
        title: "Status update failed",
        description: detail,
        variant: "destructive",
      });
    } finally {
      setTogglingInternshipId(null);
    }
  };

  if (loadingPage) {
    return <AdminSkeleton />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage Internships</h1>
          <p className="text-muted-foreground">
            Create, edit, and activate or deactivate internship listings.
          </p>
        </div>

        <Link href="/admin">
          <Button variant="outline">Back to Analytics</Button>
        </Link>
      </div>

      <div className="mb-8 rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-5 w-5 text-green-accent" />
          <h2 className="font-semibold">Create Internship Listing</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="internship-title">Role Title</Label>
            <Input
              id="internship-title"
              placeholder="e.g. Data Analyst Intern"
              value={internshipForm.title}
              onChange={(e) =>
                setInternshipForm((prev) => ({ ...prev, title: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-company">Company</Label>
            <Input
              id="internship-company"
              placeholder="e.g. Infosys"
              value={internshipForm.company}
              onChange={(e) =>
                setInternshipForm((prev) => ({ ...prev, company: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-sector">Sector</Label>
            <Input
              id="internship-sector"
              placeholder="e.g. IT Services"
              value={internshipForm.sector}
              onChange={(e) =>
                setInternshipForm((prev) => ({ ...prev, sector: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-location">Location</Label>
            <Input
              id="internship-location"
              placeholder="e.g. Bengaluru"
              value={internshipForm.location}
              onChange={(e) =>
                setInternshipForm((prev) => ({ ...prev, location: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-state">State</Label>
            <Input
              id="internship-state"
              placeholder="e.g. Karnataka"
              value={internshipForm.state}
              onChange={(e) =>
                setInternshipForm((prev) => ({ ...prev, state: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-skills">Required Skills</Label>
            <Input
              id="internship-skills"
              placeholder="e.g. Python, SQL, Excel"
              value={internshipForm.required_skills}
              onChange={(e) =>
                setInternshipForm((prev) => ({ ...prev, required_skills: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-description">Description</Label>
            <Input
              id="internship-description"
              placeholder="Brief role overview and responsibilities"
              value={internshipForm.description}
              onChange={(e) =>
                setInternshipForm((prev) => ({ ...prev, description: e.target.value }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-duration">Duration (months)</Label>
            <Input
              id="internship-duration"
              type="number"
              min={1}
              placeholder="e.g. 3"
              value={internshipForm.duration_months}
              onChange={(e) =>
                setInternshipForm((prev) => ({
                  ...prev,
                  duration_months:
                    e.target.value === "" ? "" : Math.max(1, Number(e.target.value) || 1),
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-stipend">Stipend (Rs/month)</Label>
            <Input
              id="internship-stipend"
              type="number"
              min={0}
              placeholder="e.g. 15000"
              value={internshipForm.stipend}
              onChange={(e) =>
                setInternshipForm((prev) => ({
                  ...prev,
                  stipend:
                    e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0),
                }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internship-seats">Total Seats</Label>
            <Input
              id="internship-seats"
              type="number"
              min={1}
              placeholder="e.g. 10"
              value={internshipForm.total_seats}
              onChange={(e) =>
                setInternshipForm((prev) => ({
                  ...prev,
                  total_seats:
                    e.target.value === "" ? "" : Math.max(1, Number(e.target.value) || 1),
                }))
              }
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button
            variant="accent"
            className="gap-2"
            onClick={() => {
              void handleCreateInternship();
            }}
            disabled={creatingInternship}
          >
            {creatingInternship && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Internship
          </Button>
        </div>
      </div>

      <div className="mb-8 rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-green-accent" />
          <h2 className="font-semibold">Internship Management</h2>
        </div>

        {internships.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No internships available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-260">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Title</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Company</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Sector</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Location</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Required Skills</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Seats</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {internships.map((internship) => (
                  <tr key={internship.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 text-sm font-medium">{internship.title}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{internship.company}</td>
                    <td className="px-4 py-3 text-sm">{internship.sector}</td>
                    <td className="px-4 py-3 text-sm">{internship.location}, {internship.state}</td>
                    <td className="px-4 py-3 text-sm">
                      {internship.required_skills.length} {internship.required_skills.length === 1 ? "skill" : "skills"}
                    </td>
                    <td className="px-4 py-3 text-sm">{internship.filled_seats}/{internship.total_seats}</td>
                    <td className="px-4 py-3 text-sm">
                      {internship.is_active ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            handleOpenInternshipEditor(internship);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={
                            internship.is_active
                              ? "border-red-300 text-red-700 hover:bg-red-50"
                              : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          }
                          onClick={() => {
                            void handleToggleInternshipActive(internship);
                          }}
                          disabled={togglingInternshipId === internship.id}
                        >
                          {togglingInternshipId === internship.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : internship.is_active ? (
                            "Deactivate"
                          ) : (
                            "Activate"
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingInternship && (
        <div className="fixed inset-0 z-140 flex items-center justify-center bg-black/55 p-4">
          <button
            aria-label="Close internship editor"
            className="absolute inset-0"
            onClick={() => setEditingInternship(null)}
          />

          <div className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">Edit Internship</h2>
                <p className="text-sm text-muted-foreground">
                  Update internship details and activation status.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setEditingInternship(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4 p-6">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    value={editingInternship.title}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev ? { ...prev, title: event.target.value } : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Input
                    value={editingInternship.company}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev ? { ...prev, company: event.target.value } : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Sector</Label>
                  <Input
                    value={editingInternship.sector}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev ? { ...prev, sector: event.target.value } : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Location</Label>
                  <Input
                    value={editingInternship.location}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev ? { ...prev, location: event.target.value } : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Input
                    value={editingInternship.state}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev ? { ...prev, state: event.target.value } : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={editingInternship.is_active ? "active" : "inactive"}
                    onValueChange={(value) =>
                      setEditingInternship((prev) =>
                        prev ? { ...prev, is_active: value === "active" } : prev
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label>Required Skills (comma separated)</Label>
                  <Input
                    value={editingInternship.required_skills}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev ? { ...prev, required_skills: event.target.value } : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label>Description</Label>
                  <Input
                    value={editingInternship.description}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev ? { ...prev, description: event.target.value } : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Duration (months)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editingInternship.duration_months}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev
                          ? {
                              ...prev,
                              duration_months:
                                event.target.value === ""
                                  ? ""
                                  : Math.max(1, Number(event.target.value) || 1),
                            }
                          : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Stipend (Rs/month)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editingInternship.stipend}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev
                          ? {
                              ...prev,
                              stipend:
                                event.target.value === ""
                                  ? ""
                                  : Math.max(0, Number(event.target.value) || 0),
                            }
                          : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Total Seats</Label>
                  <Input
                    type="number"
                    min={1}
                    value={editingInternship.total_seats}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev
                          ? {
                              ...prev,
                              total_seats:
                                event.target.value === ""
                                  ? ""
                                  : Math.max(1, Number(event.target.value) || 1),
                            }
                          : prev
                      )
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Filled Seats</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editingInternship.filled_seats}
                    onChange={(event) =>
                      setEditingInternship((prev) =>
                        prev
                          ? {
                              ...prev,
                              filled_seats:
                                event.target.value === ""
                                  ? ""
                                  : Math.max(0, Number(event.target.value) || 0),
                            }
                          : prev
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingInternship(null)}
                  disabled={savingInternshipEdit}
                >
                  Cancel
                </Button>
                <Button
                  variant="accent"
                  className="gap-2"
                  onClick={() => {
                    void handleSaveInternshipEdit();
                  }}
                  disabled={savingInternshipEdit}
                >
                  {savingInternshipEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
