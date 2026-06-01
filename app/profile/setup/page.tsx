"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Printer, UserCheck } from "lucide-react";
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
      setErrorMessage("Please enter your student ID.");
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
      <div className="mx-auto w-full max-w-sm space-y-6">
        <div className="space-y-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium"
          >
            <Printer className="size-4" />
            GIX Printer Hub
          </Link>
          <div>
            <h1 className="text-balance text-xl font-semibold leading-tight sm:text-2xl">
              One more step
            </h1>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              Complete your profile to join the printer waitlist.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-amber-50">
              <UserCheck className="size-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Lab profile</p>
              <p className="text-xs text-muted-foreground">Used for notifications and waitlist</p>
            </div>
          </div>

          {!hasAuth && (
            <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-pretty text-xs text-amber-700">
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
                Student ID
              </label>
              <input
                id="studentId"
                type="text"
                placeholder="e.g. 1234567"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}

            <Button type="submit" className="h-11 w-full" disabled={isSaving}>
              {isSaving ? "Saving…" : "Continue"}
            </Button>
          </form>
        </div>
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
