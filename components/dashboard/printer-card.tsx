"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  Clock3,
  LoaderCircle,
  TriangleAlert,
  Timer,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCountdown, formatTime } from "@/lib/printer-utils";

export type PrinterStatus = "idle" | "printing" | "error";

export interface QueueWaiter {
  id: string;
  userId: string;
  displayName: string;
  createdAt: string | null;
  notifiedAt: string | null;
  startedAt: string | null;
}

export interface PrinterCardProps {
  printerName: string;
  status: PrinterStatus;
  timeRemainingMinutes: number | null;
  updatedAt: string | null;
  showStaleWarning: boolean;
  waiters: QueueWaiter[];
  currentUserId: string | null;
  errorMessage: string | null;
  /** Name of the person currently printing (claimed via "I've Started"), if any. */
  activeUserName: string | null;
  /** True when the current user is the one printing. */
  isActiveUser: boolean;
  isJoiningQueue: boolean;
  isLeavingQueue: boolean;
  alreadyInQueue: boolean;
  isBanned: boolean;
  actionError: string | null;
  queueLimit: number;
  onJoinQueue: () => Promise<void>;
  onLeaveQueue: () => Promise<void>;
}

const statusConfig: Record<
  PrinterStatus,
  { badgeLabel: string; badgeClassName: string; icon: React.ReactNode }
> = {
  idle: {
    badgeLabel: "Available",
    badgeClassName: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    icon: <CircleCheck className="size-4 text-emerald-600" />,
  },
  printing: {
    badgeLabel: "In use",
    badgeClassName: "bg-muted text-muted-foreground hover:bg-muted",
    icon: <LoaderCircle className="size-4 animate-spin" />,
  },
  error: {
    badgeLabel: "Error",
    badgeClassName: "bg-red-100 text-red-700 hover:bg-red-100",
    icon: <AlertTriangle className="size-4 text-red-600" />,
  },
};

const statusPanelClass: Record<PrinterStatus, string> = {
  idle: "border-border bg-muted/40",
  printing: "border-border bg-muted/50",
  error: "border-red-200 bg-red-50",
};

const CLAIM_WINDOW_MS = 5 * 60 * 1000;


export function PrinterCard({
  printerName,
  status,
  timeRemainingMinutes,
  updatedAt,
  showStaleWarning,
  waiters,
  currentUserId,
  activeUserName,
  isActiveUser,
  errorMessage,
  isJoiningQueue,
  isLeavingQueue,
  alreadyInQueue,
  isBanned,
  actionError,
  queueLimit,
  onJoinQueue,
  onLeaveQueue,
}: PrinterCardProps) {
  const config = statusConfig[status];
  const slot1 = waiters[0] ?? null;
  const queueFull = waiters.length >= queueLimit;

  // A claim window is open whenever the printer is idle and the head has been notified.
  // This is visible to everyone, not just the head themselves.
  const headHasWindow =
    status === "idle" && slot1 !== null && slot1.notifiedAt !== null;

  // Is the current user the one whose claim window is open?
  const isMyTurn = headHasWindow && slot1?.userId === currentUserId;

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!headHasWindow) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [headHasWindow]);

  const windowStartMs = headHasWindow && slot1?.notifiedAt ? Date.parse(slot1.notifiedAt) : null;
  const remainingMs =
    windowStartMs !== null
      ? Math.max(0, CLAIM_WINDOW_MS - (now - windowStartMs))
      : null;
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : null;
  const estimatedDoneAt =
    status === "printing" && timeRemainingMinutes !== null && timeRemainingMinutes > 0
      ? new Date(Date.now() + timeRemainingMinutes * 60 * 1000)
      : null;
  const doneAtLabel = estimatedDoneAt
    ? estimatedDoneAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  const isStale =
    showStaleWarning && (updatedAtMs === null || now - updatedAtMs > 2 * 60 * 1000);

  const primaryLabel =
    status === "error"
      ? (errorMessage ?? "Needs attention")
      : status === "idle"
        ? "Available"
        : timeRemainingMinutes !== null
          ? `${formatTime(timeRemainingMinutes)} left`
          : "In use";
  const primaryDetail =
    status === "error"
      ? (errorMessage ? "Needs attention" : "Check the printer in the makerspace")
      : status === "idle"
        ? waiters.length === 0
          ? "No one is waiting"
          : `${waiters.length} waiting`
        : activeUserName
          ? `In use by ${activeUserName}`
          : "Print in progress";

  const leaveButton = (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="h-11 w-full text-red-600 hover:text-red-700"
          disabled={isLeavingQueue}
        >
          {isLeavingQueue ? "Leaving…" : "Leave waitlist"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave the waitlist?</AlertDialogTitle>
          <AlertDialogDescription>
            You&apos;ll lose your spot for {printerName}. You can rejoin later if space is available.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onLeaveQueue()}>
            Leave waitlist
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );


  return (
    <Card className="h-full ring-1 ring-zinc-100 shadow-none">
      <CardHeader className="gap-2 pb-0">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-xl uppercase">{printerName}</CardTitle>
          <Badge className={`${config.badgeClassName} shrink-0`}>
            {config.icon}
            {config.badgeLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col space-y-4">
        <div className={cn("rounded-lg border p-3 sm:p-4", statusPanelClass[status])}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-pretty text-sm text-muted-foreground">{primaryDetail}</p>
              <div className="mt-1 flex items-baseline gap-3">
                <p className="text-3xl font-semibold tabular-nums">{primaryLabel}</p>
                {doneAtLabel && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock3 className="size-3" />
                    Ends at {doneAtLabel}
                  </span>
                )}
              </div>
            </div>
            {isStale && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                <TriangleAlert className="size-3" />
                Stale
              </span>
            )}
          </div>
        </div>

        {currentUserId !== null && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Waitlist ({waiters.length}/{queueLimit})
          </h3>
          {waiters.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              No one is waiting — be the first to get notified.
            </p>
          ) : (
            <ul className="space-y-2">
              {waiters.map((w, i) => (
                <li
                  key={w.id}
                  className={`flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-xs ${
                    w.userId === currentUserId
                      ? "border-border bg-muted/60 font-medium"
                      : "border-border"
                  }`}
                >
                  <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-muted-foreground ${w.userId === currentUserId ? "bg-white" : "bg-muted"}`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0 truncate">
                    {w.userId === currentUserId ? "You" : w.displayName}
                  </span>
                  {i === 0 && headHasWindow && remainingMs !== null && (
                    <span className="ml-auto shrink-0 font-mono tabular-nums text-amber-600 font-semibold">
                      {formatCountdown(remainingMs)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        )}
      </CardContent>

      <CardFooter className="mt-auto pt-0">
        <div className="w-full space-y-2">
          {currentUserId === null ? (
            <p className="text-center text-xs text-muted-foreground">
              Sign in to view waitlist and join
            </p>
          ) : isActiveUser ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              You&apos;re printing on this machine now.
            </div>
          ) : isMyTurn ? (
            <div className="space-y-2">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Timer className="size-4" />
                  Printer is available — head over now
                </span>
                <p className="mt-1 text-xs">
                  Go start your print. Once it&apos;s running, come back and confirm.
                </p>
              </div>
              {leaveButton}
            </div>
          ) : alreadyInQueue ? (
            leaveButton
          ) : isBanned ? (
            <div className="space-y-2">
              <Button className="h-11 w-full" disabled>
                Waitlist access suspended
              </Button>
              <p className="text-pretty text-xs text-muted-foreground">
                Ask a TA to review your status.
              </p>
            </div>
          ) : (
            <Button
              className="h-11 w-full"
              onClick={() => void onJoinQueue()}
              disabled={isJoiningQueue || (Boolean(currentUserId) && queueFull)}
            >
              {isJoiningQueue
                ? "Joining…"
                : !currentUserId
                  ? "Sign in to join waitlist"
                  : queueFull
                    ? `Waitlist full (${waiters.length}/${queueLimit})`
                    : "Join waitlist"}
            </Button>
          )}
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
        </div>
      </CardFooter>
    </Card>
  );
}
