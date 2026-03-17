"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2, X } from "lucide-react";
import {
  createProfile,
  getProfile,
  getRecommendations,
  updateProfile,
  uploadResume,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { SocialCategory, StudentProfileCreate } from "@/lib/types";

const SKILL_OPTIONS = [
  "Python", "JavaScript", "TypeScript", "React", "Node.js", "Java", "C++",
  "SQL", "Machine Learning", "Data Analysis", "AWS", "Docker", "Git",
  "HTML/CSS", "MongoDB", "PostgreSQL", "REST APIs", "Flask", "Django",
  "TensorFlow", "Pandas", "Excel", "Communication", "Leadership",
  "Problem Solving", "Teamwork", "Project Management",
];

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim",
  "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh",
];

export function ProfileForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [filteredSkills, setFilteredSkills] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [refreshingRecommendations, setRefreshingRecommendations] = useState(false);

  const [form, setForm] = useState<StudentProfileCreate>({
    full_name: "",
    phone: "",
    college: "",
    degree: "",
    branch: "",
    graduation_year: new Date().getFullYear(),
    cgpa: undefined,
    skills: [],
    district: "",
    state: "",
    is_rural: false,
    social_category: null,
    has_previous_internship: false,
  });

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    getProfile()
      .then((p) => {
        setIsEdit(true);
        setProfileId(p.id);
        setResumePath(p.resume_path || null);
        setForm({
          full_name: p.full_name,
          phone: p.phone || "",
          college: p.college || "",
          degree: p.degree || "",
          branch: p.branch || "",
          graduation_year: p.graduation_year || new Date().getFullYear(),
          cgpa: p.cgpa || undefined,
          skills: p.skills,
          district: p.district || "",
          state: p.state || "",
          is_rural: p.is_rural,
          social_category: p.social_category,
          has_previous_internship: p.has_previous_internship,
        });
      })
      .catch(() => {
        // First-time profile creation path.
      });
  }, [router]);

  const refreshRecommendationsInBackground = async (studentId: number) => {
    setRefreshingRecommendations(true);
    try {
      await getRecommendations(studentId, { top_n: 100, force: true });
    } catch {
      // Background refresh should not block profile flows.
    } finally {
      setRefreshingRecommendations(false);
    }
  };

  const handleResumeUpload = async () => {
    if (!resumeFile) {
      toast({ title: "Select a PDF file first", variant: "destructive" });
      return;
    }

    setUploadingResume(true);
    try {
      const response = await uploadResume(resumeFile);
      setResumePath(response.resume_path);
      setExtractedSkills(response.extracted_skills);

      if (response.extracted_skills.length > 0) {
        setForm((prev) => {
          const merged = [...prev.skills];
          const seen = new Set(merged.map((skill) => skill.toLowerCase()));

          for (const skill of response.extracted_skills) {
            const key = skill.toLowerCase();
            if (!seen.has(key)) {
              seen.add(key);
              merged.push(skill);
            }
          }

          return { ...prev, skills: merged };
        });
      }

      toast({
        title: "Skills extracted from resume",
        description:
          response.extracted_skills.length > 0
            ? `${response.extracted_skills.length} skill(s) extracted. Recommendations are being refreshed.`
            : "No known skills found in the uploaded resume. Recommendations are being refreshed.",
        variant: "success",
      });

      if (profileId) {
        void refreshRecommendationsInBackground(profileId);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to upload resume.";

      toast({
        title: status === 404 ? "Create profile first" : "Resume upload failed",
        description: status === 404 ? "Please create your profile before uploading resume." : message,
        variant: "destructive",
      });
    } finally {
      setUploadingResume(false);
    }
  };

  const handleSkillInput = (value: string) => {
    setSkillInput(value);
    if (value.trim()) {
      const filtered = SKILL_OPTIONS.filter(
        (skill) => skill.toLowerCase().includes(value.toLowerCase()) && !form.skills.includes(skill)
      );
      setFilteredSkills(filtered);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  };

  const addSkill = (skill: string) => {
    if (!form.skills.includes(skill)) {
      setForm((prev) => ({ ...prev, skills: [...prev.skills, skill] }));
    }
    setSkillInput("");
    setShowSuggestions(false);
  };

  const removeSkill = (skill: string) => {
    setForm((prev) => ({
      ...prev,
      skills: prev.skills.filter((s) => s !== skill),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload: StudentProfileCreate = {
        ...form,
        phone: form.phone || null,
        college: form.college || null,
        degree: form.degree || null,
        branch: form.branch || null,
        cgpa: form.cgpa || null,
        district: form.district || null,
        state: form.state || null,
      };

      if (isEdit) {
        const updatedProfile = await updateProfile(payload);
        setProfileId(updatedProfile.id);
        void refreshRecommendationsInBackground(updatedProfile.id);
        toast({
          title: "Profile updated!",
          description: "Recommendations are being refreshed in the background.",
          variant: "success",
        });
      } else {
        const createdProfile = await createProfile(payload);
        setProfileId(createdProfile.id);
        void refreshRecommendationsInBackground(createdProfile.id);
        toast({
          title: "Profile created!",
          description: "Welcome to FairMatch AI. Recommendations are being prepared.",
          variant: "success",
        });
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to save profile.";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-navy text-white">
            <GraduationCap className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">
            {isEdit ? "Update Your Profile" : "Complete Your Profile"}
          </CardTitle>
          <CardDescription>
            Tell us about yourself to get better internship recommendations
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Enter your full name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="9876543210"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="college">College</Label>
                <Input
                  id="college"
                  value={form.college || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, college: e.target.value }))}
                  placeholder="Your college name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="degree">Degree</Label>
                <Input
                  id="degree"
                  value={form.degree || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, degree: e.target.value }))}
                  placeholder="B.Tech, BBA, etc."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={form.branch || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, branch: e.target.value }))}
                  placeholder="CSE, ECE, etc."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="graduation_year">Graduation Year</Label>
                <Input
                  id="graduation_year"
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.graduation_year || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      graduation_year: parseInt(e.target.value, 10) || undefined,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cgpa">CGPA</Label>
                <Input
                  id="cgpa"
                  type="number"
                  step="0.01"
                  min={0}
                  max={10}
                  value={form.cgpa || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      cgpa: parseFloat(e.target.value) || undefined,
                    }))
                  }
                  placeholder="0.0 - 10.0"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Skills</Label>
              <div className="relative">
                <Input
                  value={skillInput}
                  onChange={(e) => handleSkillInput(e.target.value)}
                  onFocus={() => {
                    if (skillInput) setShowSuggestions(true);
                  }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Type to search skills..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const candidate = skillInput.trim();
                      if (candidate && !form.skills.includes(candidate)) {
                        addSkill(candidate);
                      }
                    }
                  }}
                />
                {showSuggestions && filteredSkills.length > 0 && (
                  <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-popover shadow-md">
                    {filteredSkills.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addSkill(skill)}
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.skills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center gap-1 rounded-full bg-green-accent/10 px-3 py-1 text-sm font-medium text-green-accent"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeSkill(skill)}
                        className="transition-colors hover:text-red-500"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <div className="space-y-1">
                <Label htmlFor="resume">Resume Upload (PDF)</Label>
                <p className="text-xs text-muted-foreground">
                  Upload your resume to auto-extract skills and merge them into your profile.
                </p>
              </div>

              <Input
                id="resume"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setResumeFile(file);
                }}
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void handleResumeUpload();
                }}
                disabled={!resumeFile || uploadingResume}
              >
                {uploadingResume && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload Resume
              </Button>

              {refreshingRecommendations && (
                <p className="text-xs text-green-accent">
                  Updating your recommendations based on your latest profile and resume changes...
                </p>
              )}

              {resumePath && (
                <p className="text-xs text-muted-foreground">Uploaded: {resumePath}</p>
              )}

              {extractedSkills.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Extracted Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {extractedSkills.map((skill) => (
                      <span
                        key={`extracted-${skill}`}
                        className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="district">District</Label>
                <Input
                  id="district"
                  value={form.district || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, district: e.target.value }))}
                  placeholder="Your district"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select
                  value={form.state || ""}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, state: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Social Category</Label>
                <Select
                  value={form.social_category || ""}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, social_category: value as SocialCategory }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GEN">General</SelectItem>
                    <SelectItem value="OBC">OBC</SelectItem>
                    <SelectItem value="SC">SC</SelectItem>
                    <SelectItem value="ST">ST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is_rural"
                  checked={form.is_rural}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, is_rural: checked === true }))
                  }
                />
                <Label htmlFor="is_rural" className="cursor-pointer">
                  I am from a rural area
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="has_prev"
                  checked={form.has_previous_internship}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, has_previous_internship: checked === true }))
                  }
                />
                <Label htmlFor="has_prev" className="cursor-pointer">
                  I have previous internship experience
                </Label>
              </div>
            </div>

            <Button type="submit" variant="accent" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Update Profile" : "Create Profile"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
