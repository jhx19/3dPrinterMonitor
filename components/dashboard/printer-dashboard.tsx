"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw, Timer } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { PrinterGrid } from "@/components/dashboard/printer-grid";
import type { PrinterStatus, QueueWaiter } from "@/components/dashboard/printer-card";

type PrinterRow = Database["public"]["Tables"]["printers"]["Row"];
type QueueRow = Database["public"]["Tables"]["queues"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface PrinterViewModel {
  id: string;
  name: string;
  status: PrinterStatus;
  timeRemainingMinutes: number | null;
  filamentLevel: number | null;
}

function normalizeStatus(raw: string): PrinterStatus {
  if (raw === "printing") return "printing";
  if (raw === "error") return "error";
  return "idle";
}

export function PrinterDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [printers, setPrinters] = useState<PrinterViewModel[]>([]);
  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map());
  const [currentUser, setCurrentUser] = useState<User | null | "loading">("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joiningIds, setJoiningIds] = useState<Record<string, boolean>>({});
  const [leavingIds, setLeavingIds] = useState<Record<string, boolean>>({});
  const [startingIds, setStartingIds] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setErrorMessage(null);
    const [printerResult, queueResult] = await Promise.all([
      supabase.from("printers").select("*").order("name", { ascending: true }),
      supabase.from("queues").select("*"),
    ]);

    if (printerResult.error) {
      setErrorMessage(`Failed to load printers: ${printerResult.error.message}`);
      setIsLoading(false);
      return;
    }
    if (queueResult.error) {
      setErrorMessage(`Failed to load queues: ${queueResult.error.message}`);
      setIsLoading(false);
      return;
    }

    setPrinters(
      (printerResult.data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        status: normalizeStatus(row.status),
        timeRemainingMinutes: row.time_remaining,
        filamentLevel: row.filament_level,
      })),
    );

    const queueData = queueResult.data ?? [];
    setQueues(queueData);

    const userIds = [...new Set(queueData.map((q) => q.user_id))];
    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      const names = new Map<string, string>();
      for (const p of profileData ?? []) {
        if (p.full_name) names.set(p.id, p.full_name);
      }
      setProfileNames(names);
    } else {
      setProfileNames(new Map());
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user ?? null;
        setCurrentUser(user);
        if (user) {
          void supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single()
            .then(({ data }) => setProfile(data));
          void loadData();
        } else {
          setProfile(null);
        }
      },
    );
    return () => subscription.unsubscribe();
  }, [supabase, loadData]);

  useEffect(() => {
    void loadData();

    const printerChannel = supabase
      .channel("printers-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "printers" }, () => {
        void loadData();
      })
      .subscribe();

    const queueChannel = supabase
      .channel("queues-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "queues" }, () => {
        void loadData();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(printerChannel);
      void supabase.removeChannel(queueChannel);
    };
  }, [loadData, supabase]);

  const waitersByPrinter = useMemo(() => {
    const map = new Map<string, QueueWaiter[]>();
    const userId = currentUser === "loading" ? null : currentUser?.id ?? null;

    for (const printer of printers) {
      const waiters: QueueWaiter[] = queues
        .filter((q) => q.printer_id === printer.id)
        .map((q) => {
          const name =
            q.user_id === userId
              ? (profileNames.get(q.user_id) ?? "You")
              : (profileNames.get(q.user_id) ?? `User …${q.user_id.slice(-6).toUpperCase()}`);
          return {
            id: q.id,
            userId: q.user_id,
            displayName: name,
            createdAt: q.created_at,
            notifiedAt: q.notified_at ?? null,
            startedAt: q.started_at ?? null,
          };
        })
        .sort((a, b) => {
          const ta = a.createdAt ? Date.parse(a.createdAt) : Number.MAX_SAFE_INTEGER;
          const tb = b.createdAt ? Date.parse(b.createdAt) : Number.MAX_SAFE_INTEGER;
          return ta === tb ? a.id.localeCompare(b.id) : ta - tb;
        });
      map.set(printer.id, waiters);
    }
    return map;
  }, [printers, queues, currentUser, profileNames]);

  const joinQueue = useCallback(
    async (printer: PrinterViewModel) => {
      if (currentUser === "loading" || !currentUser) {
        router.push("/login?next=/dashboard");
        return;
      }
      setJoiningIds((prev) => ({ ...prev, [printer.id]: true }));
      setErrorMessage(null);
      const { error } = await supabase
        .from("queues")
        .insert({ printer_id: printer.id, user_id: currentUser.id });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        setErrorMessage(error.message);
      }
      setJoiningIds((prev) => ({ ...prev, [printer.id]: false }));
    },
    [supabase, currentUser, router],
  );

  const leaveQueue = useCallback(
    async (printer: PrinterViewModel) => {
      if (currentUser === "loading" || !currentUser) return;
      const entry = queues.find(
        (q) => q.printer_id === printer.id && q.user_id === currentUser.id,
      );
      if (!entry) return;
      setLeavingIds((prev) => ({ ...prev, [printer.id]: true }));
      const { error } = await supabase.from("queues").delete().eq("id", entry.id);
      if (error) setErrorMessage(error.message);
      setLeavingIds((prev) => ({ ...prev, [printer.id]: false }));
    },
    [supabase, currentUser, queues],
  );

  const confirmStart = useCallback(
    async (printer: PrinterViewModel) => {
      if (currentUser === "loading" || !currentUser) return;
      const entry = queues.find(
        (q) => q.printer_id === printer.id && q.user_id === currentUser.id,
      );
      if (!entry) return;
      setStartingIds((prev) => ({ ...prev, [printer.id]: true }));
      const { error } = await supabase
        .from("queues")
        .update({ started_at: new Date().toISOString() })
        .eq("id", entry.id);
      if (error) setErrorMessage(error.message);
      setStartingIds((prev) => ({ ...prev, [printer.id]: false }));
    },
    [supabase, currentUser, queues],
  );

  const myTurnPrinters = useMemo(() => {
    const userId = currentUser === "loading" ? null : currentUser?.id ?? null;
    if (!userId) return [];
    return printers.filter((p) => {
      const waiters = waitersByPrinter.get(p.id) ?? [];
      const slot1 = waiters[0];
      return (
        slot1?.userId === userId &&
        p.status === "idle" &&
        slot1.startedAt === null
      );
    });
  }, [printers, waitersByPrinter, currentUser]);

  if (isLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Loading printer dashboard…
        </p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="mb-3 flex items-center gap-2">
          <AlertCircle className="size-4" />
          {errorMessage}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsLoading(true);
            void loadData();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (printers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        No printers found. Run <code>supabase/schema.sql</code> to seed them.
      </div>
    );
  }

  const userId = currentUser === "loading" ? null : currentUser?.id ?? null;
  const isBanned = profile?.is_banned ?? false;

  return (
    <div className="space-y-4">
      {myTurnPrinters.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <Timer className="size-5 shrink-0" />
          <div>
            <span className="font-semibold">{p.name} is ready for you!</span>
            <span className="ml-2 text-xs">
              Click &ldquo;I&apos;ve Started&rdquo; on the card within 10 minutes.
            </span>
          </div>
        </div>
      ))}

      <PrinterGrid
        printers={printers.map((printer) => {
          const waiters = waitersByPrinter.get(printer.id) ?? [];
          const alreadyInQueue = waiters.some((w) => w.userId === userId);
          return {
            printerName: printer.name,
            status: printer.status,
            timeRemainingMinutes: printer.timeRemainingMinutes,
            filamentLevel: printer.filamentLevel,
            waiters,
            currentUserId: userId,
            isJoiningQueue: Boolean(joiningIds[printer.id]),
            isLeavingQueue: Boolean(leavingIds[printer.id]),
            isStartingPrint: Boolean(startingIds[printer.id]),
            alreadyInQueue,
            isBanned,
            onJoinQueue: async () => joinQueue(printer),
            onLeaveQueue: async () => leaveQueue(printer),
            onIveStarted: async () => confirmStart(printer),
          };
        })}
      />
    </div>
  );
}
