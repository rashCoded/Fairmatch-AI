"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Lock, Mail, CheckCircle2, Sparkles, Eye, EyeOff } from "lucide-react";
import { login } from "@/lib/api";
import { setTokens } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await login({ email, password });
      setTokens(res.access_token, res.refresh_token, res.role);

      toast({ title: "Login successful", variant: "success" });
      router.push(res.role === "admin" ? "/admin" : "/dashboard");
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Invalid credentials. Please try again.";
      toast({ title: "Login failed", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto grid min-h-screen max-w-7xl grid-cols-1 lg:grid-cols-2">
        <section className="relative hidden min-h-screen overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(32,201,151,0.18),transparent_45%),radial-gradient(circle_at_80%_65%,rgba(255,255,255,0.12),transparent_50%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-size-[28px_28px] opacity-30" />

          <div className="relative z-10">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/90">
              <Sparkles className="h-3.5 w-3.5 text-green-accent" />
              FairMatch AI
            </p>
            <h1 className="max-w-md text-4xl font-bold leading-tight">AI-Powered Internship Matching</h1>
            <p className="mt-4 max-w-md text-white/75">
              Discover opportunities where your skills, placement patterns, and policy fairness signals align.
            </p>
          </div>

          <ul className="relative z-10 mt-8 space-y-4">
            <li className="flex items-start gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-accent" />
              <span className="text-sm">Smart skill-based matching</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-accent" />
              <span className="text-sm">Policy-aware fair allocation</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-accent" />
              <span className="text-sm">Real-time application tracking</span>
            </li>
          </ul>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <Card className="w-full max-w-md border-slate-200 shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-navy text-xl font-bold text-white lg:hidden">
                FM
              </div>
              <CardTitle className="text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in to your FairMatch AI account</CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="pl-10 pr-10"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" variant="accent" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
                <p className="text-center text-sm text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <Link href="/register" className="font-medium text-green-accent hover:underline">
                    Sign up
                  </Link>
                </p>
              </CardFooter>
            </form>
          </Card>
        </section>
      </div>
    </div>
  );
}
