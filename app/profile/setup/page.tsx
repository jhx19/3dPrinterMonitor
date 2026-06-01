"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Printer, UserCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";

function ProfileSetupForm() {
  const [fullName, setFullName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const hasAuth = hasSupabaseEnv();
  const supabase = useMemo(() => (hasAuth ? createClient() : null), [hasAuth]);

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      if (user.user_metadata?.full_name) {
        setFullName(user.user_metadata.full_name);
      }
    });
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setErrorMessage("Local preview is not connected to Supabase.");
      return;
    }
    if (!userId) return;

    const nextFullName = fullName.trim();
    const nextStudentId = studentId.trim();

    if (!nextFullName) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!nextStudentId) {
      setErrorMessage("Please enter your UW Net ID.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: nextFullName, student_id: nextStudentId })
      .eq("id", userId);

    setIsSaving(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.push(nextPath);
  }

  return (
    <main className="flex min-h-[calc(100dvh-3.5rem)] items-start bg-zinc-50 px-4 py-4 sm:items-center sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-[1fr_400px] md:items-center md:gap-8">

        <section className="space-y-4 sm:space-y-6">
          <div className="space-y-2 sm:space-y-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium"
            >
              <Printer className="size-4" />
              GIX Printer Hub
            </Link>
            <h1 className="max-w-xl text-balance text-xl font-semibold leading-tight text-foreground sm:text-4xl">
              One more step before you join the waitlist.
            </h1>
            <p className="hidden max-w-lg text-pretty text-sm leading-6 text-muted-foreground sm:block">
              Your lab profile lets us send you printer notifications and track your sessions.
            </p>
          </div>
          <div className="hidden max-w-xl gap-3 sm:grid sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-background p-4">
              <Bell className="mb-3 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Email notifications</p>
              <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
                Get notified when it&apos;s your turn and when your print is done.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <UserCheck className="mb-3 size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Waitlist access</p>
              <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
                Hold your spot in the printer waitlist from anywhere.
              </p>
            </div>
          </div>
        </section>

        <section className="w-full space-y-5 rounded-xl border border-border bg-white p-5 shadow-sm sm:p-8">
          <div className="space-y-1">
            <h2 className="text-balance text-lg font-semibold sm:text-xl">Lab profile</h2>
            <p className="text-pretty text-sm text-muted-foreground">
              Used for waitlist notifications and print tracking.
            </p>
          </div>

          {!hasAuth && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-pretty text-xs text-amber-700">
              Local preview mode: profile saving is disabled until Supabase env vars are configured.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm font-medium">
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                placeholder="Jane Smith"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="studentId" className="text-sm font-medium">
                UW Net ID
              </label>
              <input
                id="studentId"
                type="text"
                placeholder="e.g. jdoe"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-muted-foreground">The part before @uw.edu</p>
            </div>

            {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

            <Button type="submit" className="h-11 w-full" disabled={isSaving}>
              {isSaving ? "Saving…" : "Continue"}
            </Button>
          </form>
        </section>

      </div>
    </main>
  );
}

export default function ProfileSetupPage() {
  return (
    <Suspense>
      <ProfileSetupForm />
    </Suspense>
  );
}
