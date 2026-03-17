"use client";

import Link from "next/link";
import { User, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import type { StudentProfile } from "@/lib/types";

interface SidebarProps {
  profile: StudentProfile | null;
}

function calculateCompleteness(profile: StudentProfile | null): number {
  if (!profile) return 0;
  const fields = [
    profile.full_name,
    profile.phone,
    profile.college,
    profile.degree,
    profile.branch,
    profile.graduation_year,
    profile.cgpa,
    profile.skills.length > 0 ? "yes" : null,
    profile.district,
    profile.state,
    profile.social_category,
  ];
  const filled = fields.filter((f) => f !== null && f !== undefined && f !== "").length;
  return Math.round((filled / fields.length) * 100);
}

export function Sidebar({ profile }: SidebarProps) {
  const completeness = calculateCompleteness(profile);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-white">
            <User className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">{profile?.full_name || "Complete Profile"}</p>
            <p className="text-xs text-muted-foreground">{profile?.college || "Add your details"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Profile Complete</span>
            <span className="font-semibold text-green-accent">{completeness}%</span>
          </div>
          <Progress value={completeness} />
        </div>

        <Link href="/profile/setup" className="block mt-4">
          <Button variant="outline" size="sm" className="w-full gap-2">
            Update Profile
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <h4 className="font-semibold mb-3">Quick Links</h4>
        <div className="space-y-2">
          <Link
            href="/explore"
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Browse Internships
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/applications"
            className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            My Applications
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
