"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clock3, Eye, EyeOff, ListOrdered, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";

function LoginForm() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestSignup, setSuggestSignup] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const hasAuth = hasSupabaseEnv();
  const supabase = useMemo(() => (hasAuth ? createClient() : null), [hasAuth]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!supabase) {
      setErrorMessage("Local preview is not connected to Supabase.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);

    if (mode === "signin") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const isInvalidCredentials =
          error.message.toLowerCase().includes("invalid login credentials") ||
          error.message.toLowerCase().includes("invalid email or password") ||
          error.message.toLowerCase().includes("email not confirmed");
        setErrorMessage(
          isInvalidCredentials
            ? "Incorrect email or password."
            : error.message,
        );
        setSuggestSignup(isInvalidCredentials);
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("student_id, full_name")
          .eq("id", data.user.id)
          .single();

        if (!profile?.student_id || !profile?.full_name) {
          router.push(`/profile/setup?next=${encodeURIComponent(nextPath)}`);
          return;
        }
      }

      router.push(nextPath);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsSubmitting(false);
        return;
      }

      if (data.user) {
        router.push(`/profile/setup?next=${encodeURIComponent(nextPath)}`);
        return;
      }
    }

    setIsSubmitting(false);
  }

  function selectMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage(null);
    setSuggestSignup(false);
  }

  return (
    <main className="flex min-h-[calc(100dvh-3.5rem)] items-start bg-zinc-50 px-4 py-4 sm:items-center sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-[1fr_400px] md:items-center md:gap-8">
        <section className="space-y-4 sm:space-y-6">
          <div className="space-y-2 sm:space-y-3">
            <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium">
              <Printer className="size-4" />
              GIX Printer Hub
            </div>
            <h1 className="max-w-xl text-balance text-xl font-semibold leading-tight text-foreground sm:text-4xl">
              Check printer availability before walking to the lab.
            </h1>
            <p className="hidden max-w-lg text-pretty text-sm leading-6 text-muted-foreground sm:block">
              See live printer status, hold your queue position, and confirm your turn when a machine is ready.
            </p>
          </div>
          <div className="hidden max-w-xl gap-3 sm:grid sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-4">
              <Clock3 className="mb-3 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Live status</p>
              <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
                Review remaining time and error state from anywhere.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <ListOrdered className="mb-3 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Fair queue</p>
              <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
                Join a printer queue and keep the next job moving.
              </p>
            </div>
          </div>
        </section>

        <section className="w-full space-y-5 rounded-xl border border-border bg-white p-5 shadow-sm sm:p-8">
          <div className="space-y-1">
            <h2 className="text-balance text-lg font-semibold sm:text-xl">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h2>
            <p className="text-pretty text-sm text-muted-foreground">
              {mode === "signin"
                ? "Access your queues and printer status."
                : "Set up access, then complete your lab profile."}
            </p>
            <p className="pt-1 text-sm text-muted-foreground">
              {mode === "signin" ? "New to GIX Printer Hub?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => selectMode(mode === "signin" ? "signup" : "signin")}
                className="font-semibold text-foreground underline underline-offset-4 hover:text-foreground/80"
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>

          {hasAuth ? (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-pretty text-xs text-muted-foreground">
              Use any email for this demo environment.
            </p>
          ) : (
            <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-pretty text-xs text-sky-700">
              Local preview mode: auth actions are disabled until Supabase env vars are configured.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@gmail.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Min. 6 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {mode === "signup" && (
            <div className="space-y-1.5">
              <label htmlFor="confirm" className="text-sm font-medium">
                Confirm password
              </label>
              <input
                id="confirm"
                type={showPassword ? "text" : "password"}
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          )}

          {errorMessage && (
            <div className="space-y-1">
              <p className="text-xs text-red-600">{errorMessage}</p>
              {suggestSignup && (
                <p className="text-xs text-muted-foreground">
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    onClick={() => selectMode("signup")}
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    Create one here
                  </button>
                </p>
              )}
            </div>
          )}

          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
