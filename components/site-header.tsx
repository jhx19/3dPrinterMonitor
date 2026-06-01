"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Printer, Settings, UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export function SiteHeader() {
  const hasAuth = hasSupabaseEnv();
  const supabase = useMemo(() => (hasAuth ? createClient() : null), [hasAuth]);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (nextUser) {
        void supabase
          .from("profiles")
          .select("*")
          .eq("id", nextUser.id)
          .single()
          .then(({ data }) => setProfile(data));
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/dashboard");
    router.refresh();
  }

  const displayName = profile?.full_name ?? profile?.email ?? user?.email;

  return (
    <header className="z-40 bg-zinc-50">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-background px-3 text-sm font-semibold shadow-xs"
        >
          <span className="grid size-7 place-items-center rounded-full bg-zinc-100">
            <Printer className="size-4 text-amber-600" />
          </span>
          <span>Printer Hub</span>
        </Link>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="hidden items-center gap-1.5 px-1 text-xs text-muted-foreground sm:inline-flex">
                <UserRound className="size-3.5" />
                {displayName}
                {profile?.role === "ta" && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    TA
                  </span>
                )}
              </span>
              {profile?.role === "ta" && (
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="size-10 rounded-full bg-background shadow-xs"
                >
                  <Link href="/admin">
                    <Settings className="size-4" />
                    <span className="sr-only">Admin</span>
                  </Link>
                </Button>
              )}
              <Button
                variant="outline"
                size="icon"
                className="size-10 rounded-full bg-background shadow-xs"
                onClick={() => void signOut()}
                aria-label="Sign out"
              >
                <LogOut className="size-4" />
              </Button>
            </>
          ) : (
            <Button asChild className="h-10 rounded-full px-5 shadow-xs">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
