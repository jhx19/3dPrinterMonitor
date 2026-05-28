"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw, Timer } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { PrinterGrid } from "@/components/dashboard/printer-grid";
import type { PrinterStatus, QueueWaiter } from "@/components/dashboard/printer-card";
import { normalizeStatus, sortQueueByTime } from "@/lib/printer-utils";
import { cn } from "@/lib/utils";

type QueueRow = Database["public"]["Tables"]["queues"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface PrinterViewModel {
  id: string;
  name: string;
  status: PrinterStatus;
  timeRemainingMinutes: number | null;
  filamentLevel: number | null;
  updatedAt: string | null;
}

const MOCK_USER_ID = "preview-user";
const MOCK_NOW = "2026-05-28T02:15:00.000Z";

const mockPrinters: PrinterViewModel[] = [
  {
    id: "mock-printer-1",
    name: "shitake",
    status: "idle",
    timeRemainingMinutes: null,
    filamentLevel: 82,
    updatedAt: MOCK_NOW,
  },
  {
    id: "mock-printer-2",
    name: "morel",
    status: "printing",
    timeRemainingMinutes: 47,
    filamentLevel: 41,
    updatedAt: "2026-05-28T02:14:00.000Z",
  },
  {
    id: "mock-printer-3",
    name: "FLY AGARIC",
    status: "error",
    timeRemainingMinutes: null,
    filamentLevel: 12,
    updatedAt: "2026-05-28T02:11:00.000Z",
  },
  {
    id: "mock-printer-4",
    name: "TURKEY TAIL",
    status: "idle",
    timeRemainingMinutes: null,
    filamentLevel: 67,
    updatedAt: "2026-05-28T02:14:30.000Z",
  },
];

const mockQueues: QueueRow[] = [
  {
    id: "mock-queue-1",
    printer_id: "mock-printer-1",
    user_id: MOCK_USER_ID,
    tier: "active",
    created_at: "2026-05-28T02:07:00.000Z",
    notified_at: "2026-05-28T02:12:00.000Z",
    started_at: null,
  },
  {
    id: "mock-queue-2",
    printer_id: "mock-printer-2",
    user_id: "mock-alex",
    tier: "active",
    created_at: "2026-05-28T00:45:00.000Z",
    notified_at: null,
    started_at: "2026-05-28T01:30:00.000Z",
  },
  {
    id: "mock-queue-3",
    printer_id: "mock-printer-2",
    user_id: MOCK_USER_ID,
    tier: "active",
    created_at: "2026-05-28T01:55:00.000Z",
    notified_at: null,
    started_at: null,
  },
  {
    id: "mock-queue-4",
    printer_id: "mock-printer-2",
    user_id: "mock-mina",
    tier: "waitlist",
    created_at: "2026-05-28T02:05:00.000Z",
    notified_at: null,
    started_at: null,
  },
  {
    id: "mock-queue-5",
    printer_id: "mock-printer-3",
    user_id: "mock-sam",
    tier: "active",
    created_at: "2026-05-28T02:13:00.000Z",
    notified_at: null,
    started_at: null,
  },
];

const mockNames = new Map([
  [MOCK_USER_ID, "You"],
  ["mock-alex", "Alex Kim"],
  ["mock-mina", "Mina Lee"],
  ["mock-sam", "Sam Park"],
]);

const statusTagClass: Record<PrinterStatus, string> = {
  idle: "bg-emerald-50 text-emerald-700",
  printing: "bg-zinc-100 text-zinc-600",
  error: "bg-red-50 text-red-700",
};

export function PrinterDashboard() {
  const isPreviewMode = !hasSupabaseEnv();
  const supabase = useMemo(
    () => (isPreviewMode ? null : createClient()),
    [isPreviewMode],
  );
  const router = useRouter();

  const [printers, setPrinters] = useState<PrinterViewModel[]>(() =>
    isPreviewMode ? mockPrinters : [],
  );
  const [queues, setQueues] = useState<QueueRow[]>(() =>
    isPreviewMode ? mockQueues : [],
  );
  const [profileNames, setProfileNames] = useState<Map<string, string>>(() =>
    isPreviewMode ? mockNames : new Map(),
  );
  const [currentUser, setCurrentUser] = useState<User | null | "loading">(
    isPreviewMode ? null : "loading",
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(!isPreviewMode);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joiningIds, setJoiningIds] = useState<Record<string, boolean>>({});
  const [leavingIds, setLeavingIds] = useState<Record<string, boolean>>({});
  const [startingIds, setStartingIds] = useState<Record<string, boolean>>({});
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>({});

  const loadData = useCallback(async () => {
    if (!supabase) return;

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
        updatedAt: row.updated_at,
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
    if (!supabase) return;

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
    if (!supabase) return;

    void Promise.resolve().then(loadData);

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
    const userId = isPreviewMode
      ? MOCK_USER_ID
      : currentUser === "loading"
        ? null
        : currentUser?.id ?? null;

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
        });
      map.set(printer.id, sortQueueByTime(waiters));
    }
    return map;
  }, [printers, queues, currentUser, profileNames, isPreviewMode]);

  const joinQueue = useCallback(
    async (printer: PrinterViewModel) => {
      if (isPreviewMode) {
        setQueues((prev) => [
          ...prev,
          {
            id: `mock-queue-${printer.id}`,
            printer_id: printer.id,
            user_id: MOCK_USER_ID,
            tier: prev.filter((q) => q.printer_id === printer.id).length < 2
              ? "active"
              : "waitlist",
            created_at: new Date().toISOString(),
            notified_at: null,
            started_at: null,
          },
        ]);
        return;
      }

      if (currentUser === "loading" || !currentUser) {
        router.push("/login?next=/dashboard");
        return;
      }
      if (!supabase) return;
      setJoiningIds((prev) => ({ ...prev, [printer.id]: true }));
      setActionErrors((prev) => ({ ...prev, [printer.id]: null }));
      const { error } = await supabase
        .from("queues")
        .insert({ printer_id: printer.id, user_id: currentUser.id });
      if (error && !error.message.toLowerCase().includes("duplicate")) {
        setActionErrors((prev) => ({ ...prev, [printer.id]: error.message }));
      }
      setJoiningIds((prev) => ({ ...prev, [printer.id]: false }));
    },
    [supabase, currentUser, router, isPreviewMode],
  );

  const leaveQueue = useCallback(
    async (printer: PrinterViewModel) => {
      if (isPreviewMode) {
        setQueues((prev) =>
          prev.filter((q) => !(q.printer_id === printer.id && q.user_id === MOCK_USER_ID)),
        );
        return;
      }
      if (currentUser === "loading" || !currentUser) return;
      if (!supabase) return;
      const entry = queues.find(
        (q) => q.printer_id === printer.id && q.user_id === currentUser.id,
      );
      if (!entry) return;
      setLeavingIds((prev) => ({ ...prev, [printer.id]: true }));
      const { error } = await supabase.from("queues").delete().eq("id", entry.id);
      if (error) setActionErrors((prev) => ({ ...prev, [printer.id]: error.message }));
      setLeavingIds((prev) => ({ ...prev, [printer.id]: false }));
    },
    [supabase, currentUser, queues, isPreviewMode],
  );

  const confirmStart = useCallback(
    async (printer: PrinterViewModel) => {
      if (isPreviewMode) {
        setQueues((prev) =>
          prev.map((q) =>
            q.printer_id === printer.id && q.user_id === MOCK_USER_ID
              ? { ...q, started_at: new Date().toISOString() }
              : q,
          ),
        );
        return;
      }
      if (currentUser === "loading" || !currentUser) return;
      if (!supabase) return;
      const entry = queues.find(
        (q) => q.printer_id === printer.id && q.user_id === currentUser.id,
      );
      if (!entry) return;
      setStartingIds((prev) => ({ ...prev, [printer.id]: true }));
      const { error } = await supabase
        .from("queues")
        .update({ started_at: new Date().toISOString() })
        .eq("id", entry.id);
      if (error) setActionErrors((prev) => ({ ...prev, [printer.id]: error.message }));
      setStartingIds((prev) => ({ ...prev, [printer.id]: false }));
    },
    [supabase, currentUser, queues, isPreviewMode],
  );

  const myTurnPrinters = useMemo(() => {
    const userId = isPreviewMode
      ? MOCK_USER_ID
      : currentUser === "loading"
        ? null
        : currentUser?.id ?? null;
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
  }, [printers, waitersByPrinter, currentUser, isPreviewMode]);

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

  const userId = isPreviewMode
    ? MOCK_USER_ID
    : currentUser === "loading"
      ? null
      : currentUser?.id ?? null;
  const isBanned = profile?.is_banned ?? false;
  const getStatusLabel = (printer: PrinterViewModel) => {
    if (printer.status === "idle") return "Available";
    if (printer.status === "error") return "Error";
    if (printer.timeRemainingMinutes !== null) {
      return `${printer.timeRemainingMinutes}m left`;
    }
    return "In use";
  };
  const printerCards = printers.map((printer) => {
    const waiters = waitersByPrinter.get(printer.id) ?? [];
    const alreadyInQueue = waiters.some((w) => w.userId === userId);
    return {
      printerName: printer.name,
      status: printer.status,
      timeRemainingMinutes: printer.timeRemainingMinutes,
      filamentLevel: printer.filamentLevel,
      updatedAt: printer.updatedAt,
      showStaleWarning: !isPreviewMode,
      waiters,
      currentUserId: userId,
      isJoiningQueue: Boolean(joiningIds[printer.id]),
      isLeavingQueue: Boolean(leavingIds[printer.id]),
      isStartingPrint: Boolean(startingIds[printer.id]),
      alreadyInQueue,
      isBanned,
      actionError: actionErrors[printer.id] ?? null,
      onJoinQueue: async () => joinQueue(printer),
      onLeaveQueue: async () => leaveQueue(printer),
      onIveStarted: async () => confirmStart(printer),
    };
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(190px,0.5fr)_minmax(0,2.35fr)] lg:items-start">
      <section className="min-w-0 space-y-4">
        <div>
          <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-4xl">
            Printer Queue
          </h1>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            Live printer availability and queue order.
          </p>
        </div>

        <div className="max-w-full min-w-0 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
          <div className="flex w-max gap-2 sm:grid sm:w-auto sm:grid-cols-2 lg:grid-cols-1">
            {printers.map((printer) => (
              <div
                key={printer.id}
                className="flex min-w-[150px] items-center justify-between gap-3 rounded-md bg-background/80 px-3 py-2 ring-1 ring-zinc-100/80 sm:min-w-0"
              >
                <div className="min-w-0 truncate text-[11px] font-medium uppercase text-muted-foreground">
                  {printer.name}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                    statusTagClass[printer.status],
                  )}
                >
                  {getStatusLabel(printer)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {myTurnPrinters.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Timer className="size-5 shrink-0" />
            <div>
              <span className="font-semibold">
                {myTurnPrinters.length === 1
                  ? `${myTurnPrinters[0].name} is ready for you!`
                  : `${myTurnPrinters.length} printers are ready for you!`}
              </span>
              <p className="mt-1 text-xs">
                Use the card action to confirm you&apos;ve started.
              </p>
            </div>
          </div>
        )}
      </section>

      <div className="min-w-0">
        <PrinterGrid printers={printerCards} />
      </div>
    </div>
  );
}
