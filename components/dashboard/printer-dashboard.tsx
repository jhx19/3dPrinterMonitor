"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { PrinterGrid } from "@/components/dashboard/printer-grid";
import type { PrinterStatus, QueueWaiter } from "@/components/dashboard/printer-card";
import { formatTime, normalizeStatus, sortQueueByTime } from "@/lib/printer-utils";
import { cn } from "@/lib/utils";

type QueueRow = Database["public"]["Tables"]["queues"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const QUEUE_LIMIT = 3;

// Fixed display order by printer UUID.
const PRINTER_DISPLAY_ORDER: Record<string, number> = {
  "11111111-1111-1111-1111-111111111111": 0, // MOREL
  "22222222-2222-2222-2222-222222222222": 1, // TURKEY TAIL
  "33333333-3333-3333-3333-333333333333": 2, // FLY AGARIC
  "44444444-4444-4444-4444-444444444444": 3, // SHIITAKE
};

interface PrinterViewModel {
  id: string;
  name: string;
  status: PrinterStatus;
  timeRemainingMinutes: number | null;
  errorMessage: string | null;
  activeUserId: string | null;
  updatedAt: string | null;
}

const MOCK_USER_ID = "preview-user";
const MOCK_NOW = "2026-05-28T02:15:00.000Z";

const mockPrinters: PrinterViewModel[] = [
  {
    id: "mock-printer-1",
    name: "MOREL",
    status: "idle",
    timeRemainingMinutes: null,
    errorMessage: null,
    activeUserId: null,
    updatedAt: MOCK_NOW,
  },
  {
    id: "mock-printer-2",
    name: "TURKEY TAIL",
    status: "printing",
    timeRemainingMinutes: 47,
    errorMessage: null,
    activeUserId: null,
    updatedAt: "2026-05-28T02:14:00.000Z",
  },
  {
    id: "mock-printer-3",
    name: "FLY AGARIC",
    status: "error",
    timeRemainingMinutes: null,
    errorMessage: "Filament issue",
    activeUserId: null,
    updatedAt: "2026-05-28T02:11:00.000Z",
  },
  {
    id: "mock-printer-4",
    name: "SHIITAKE",
    status: "idle",
    timeRemainingMinutes: null,
    errorMessage: null,
    activeUserId: null,
    updatedAt: "2026-05-28T02:14:30.000Z",
  },
];

const mockQueues: QueueRow[] = [
  // shitake: you are head with an active claim window (idle → countdown)
  {
    id: "mock-queue-1",
    printer_id: "mock-printer-1",
    user_id: MOCK_USER_ID,
    tier: "active",
    created_at: "2026-05-28T02:07:00.000Z",
    notified_at: "2026-05-28T02:12:00.000Z",
    started_at: null,
  },
  // morel: printing + unclaimed → everyone in queue sees "I've Started"
  {
    id: "mock-queue-2",
    printer_id: "mock-printer-2",
    user_id: MOCK_USER_ID,
    tier: "active",
    created_at: "2026-05-28T01:55:00.000Z",
    notified_at: null,
    started_at: null,
  },
  {
    id: "mock-queue-3",
    printer_id: "mock-printer-2",
    user_id: "mock-mina",
    tier: "active",
    created_at: "2026-05-28T02:05:00.000Z",
    notified_at: null,
    started_at: null,
  },
  // fly agaric: error, someone else waiting
  {
    id: "mock-queue-4",
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
  const [actionErrors, setActionErrors] = useState<Record<string, string | null>>({});
  const [dismissedClaimPrinters, setDismissedClaimPrinters] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    if (!supabase) return;

    setErrorMessage(null);
    const [printerResult, queueResult] = await Promise.all([
      supabase.from("printers").select("*"),
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

    const printerRows = (printerResult.data ?? []).sort(
      (a, b) =>
        (PRINTER_DISPLAY_ORDER[a.id] ?? 99) - (PRINTER_DISPLAY_ORDER[b.id] ?? 99),
    );
    setPrinters(
      printerRows.map((row) => ({
        id: row.id,
        name: row.name,
        status: normalizeStatus(row.status),
        timeRemainingMinutes: row.time_remaining,
        errorMessage: row.error_message ?? null,
        activeUserId: row.active_user_id,
        updatedAt: row.updated_at,
      })),
    );

    const queueData = queueResult.data ?? [];
    setQueues(queueData);

    const userIds = [
      ...new Set([
        ...queueData.map((q) => q.user_id),
        ...printerRows.map((p) => p.active_user_id).filter((id): id is string => Boolean(id)),
      ]),
    ];
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

  const userId = isPreviewMode
    ? MOCK_USER_ID
    : currentUser === "loading"
      ? null
      : currentUser?.id ?? null;

  const waitersByPrinter = useMemo(() => {
    const map = new Map<string, QueueWaiter[]>();

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
  }, [printers, queues, userId, profileNames]);

  const claimCandidates = useMemo(() => {
    if (!userId) return [];
    return printers.filter((p) => {
      const waiters = waitersByPrinter.get(p.id) ?? [];
      const head = waiters[0];
      const isQueueHead = head?.userId === userId;
      const wasNotified = !!head?.notifiedAt;
      const isActiveUser = p.activeUserId === userId;
      return p.status === "printing" && !p.activeUserId && isQueueHead && wasNotified && !isActiveUser;
    });
  }, [printers, waitersByPrinter, userId]);

  const activeClaimPrinter = useMemo(
    () => claimCandidates.find((p) => !dismissedClaimPrinters.has(p.id)) ?? null,
    [claimCandidates, dismissedClaimPrinters],
  );

  const joinQueue = useCallback(
    async (printer: PrinterViewModel) => {
      const queueCount = queues.filter((q) => q.printer_id === printer.id).length;
      if (queueCount >= QUEUE_LIMIT) {
        setActionErrors((prev) => ({ ...prev, [printer.id]: `Queue is full (${QUEUE_LIMIT}/${QUEUE_LIMIT}).` }));
        return;
      }

      if (isPreviewMode) {
        setQueues((prev) => [
          ...prev,
          {
            id: `mock-queue-${printer.id}`,
            printer_id: printer.id,
            user_id: MOCK_USER_ID,
            tier: "active",
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
        const message = error.message.toLowerCase().includes("full")
          ? `Queue is full (${QUEUE_LIMIT}/${QUEUE_LIMIT}).`
          : error.message;
        setActionErrors((prev) => ({ ...prev, [printer.id]: message }));
      }
      setJoiningIds((prev) => ({ ...prev, [printer.id]: false }));
    },
    [supabase, currentUser, router, isPreviewMode, queues],
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
        setPrinters((prev) =>
          prev.map((p) => (p.id === printer.id ? { ...p, activeUserId: MOCK_USER_ID } : p)),
        );
        setQueues((prev) =>
          prev.filter((q) => !(q.printer_id === printer.id && q.user_id === MOCK_USER_ID)),
        );
        return;
      }
      if (currentUser === "loading" || !currentUser) return;
      if (!supabase) return;
      setActionErrors((prev) => ({ ...prev, [printer.id]: null }));
      const { error } = await supabase.rpc("claim_printer", { p_printer_id: printer.id });
      if (error) setActionErrors((prev) => ({ ...prev, [printer.id]: error.message }));
    },
    [supabase, currentUser, isPreviewMode],
  );


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

  const isBanned = profile?.is_banned ?? false;
  const getStatusLabel = (printer: PrinterViewModel) => {
    if (printer.status === "idle") return "Available";
    if (printer.status === "error") return "Error";
    if (printer.timeRemainingMinutes !== null && printer.timeRemainingMinutes > 0) {
      return `${formatTime(printer.timeRemainingMinutes)} left`;
    }
    return "In use";
  };
  const printerCards = printers.map((printer) => {
    const waiters = waitersByPrinter.get(printer.id) ?? [];
    const alreadyInQueue = waiters.some((w) => w.userId === userId);
    const activeUserId = printer.activeUserId;
    const isActiveUser = activeUserId !== null && activeUserId === userId;
    const activeUserName = activeUserId
      ? activeUserId === userId
        ? "You"
        : profileNames.get(activeUserId) ?? `User …${activeUserId.slice(-6).toUpperCase()}`
      : null;
    return {
      printerName: printer.name,
      status: printer.status,
      timeRemainingMinutes: printer.timeRemainingMinutes,
      errorMessage: printer.errorMessage,
      updatedAt: printer.updatedAt,
      showStaleWarning: !isPreviewMode,
      waiters,
      currentUserId: userId,
      activeUserName,
      isActiveUser,
      isJoiningQueue: Boolean(joiningIds[printer.id]),
      isLeavingQueue: Boolean(leavingIds[printer.id]),
      alreadyInQueue,
      isBanned,
      actionError: actionErrors[printer.id] ?? null,
      queueLimit: QUEUE_LIMIT,
      onJoinQueue: async () => joinQueue(printer),
      onLeaveQueue: async () => leaveQueue(printer),
    };
  });

  return (
    <>
    <AlertDialog
      open={!!activeClaimPrinter}
      onOpenChange={(open) => {
        if (!open && activeClaimPrinter) {
          setDismissedClaimPrinters((prev) => new Set([...prev, activeClaimPrinter.id]));
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Did you start this print on {activeClaimPrinter?.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Confirm it&apos;s you and we&apos;ll email you when the print is done.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, not me</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "default" })}
            onClick={() => {
              if (activeClaimPrinter) void confirmStart(activeClaimPrinter);
            }}
          >
            Yes, that&apos;s me
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <div className="grid gap-6 lg:grid-cols-[minmax(200px,0.53fr)_minmax(0,2.2fr)] lg:items-start">
      <section className="min-w-0 space-y-4">
        <div>
          <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-4xl">
            3D Printer Status
          </h1>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            Live availability and notification waitlist.
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

      </section>

      <div className="min-w-0">
        <PrinterGrid printers={printerCards} />
      </div>
    </div>
    </>
  );
}
