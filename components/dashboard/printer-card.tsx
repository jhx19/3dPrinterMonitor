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
  /** Name of the person currently printing (claimed via "I've Started"), if any. */
  activeUserName: string | null;
  /** True when the current user is the one printing. */
  isActiveUser: boolean;
  isJoiningQueue: boolean;
  isLeavingQueue: boolean;
  isStartingPrint: boolean;
  alreadyInQueue: boolean;
  isBanned: boolean;
  actionError: string | null;
  queueLimit: number;
  onJoinQueue: () => Promise<void>;
  onLeaveQueue: () => Promise<void>;
  onIveStarted: () => Promise<void>;
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

const CLAIM_WINDOW_MS = 10 * 60 * 1000;

function formatUpdatedLabel(updatedAtMs: number | null, now: number) {
  if (updatedAtMs === null) return "No update yet";

  const minutes = Math.max(0, Math.round((now - updatedAtMs) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return "Over 24h ago";
}

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
  isJoiningQueue,
  isLeavingQueue,
  isStartingPrint,
  alreadyInQueue,
  isBanned,
  actionError,
  queueLimit,
  onJoinQueue,
  onLeaveQueue,
  onIveStarted,
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

  // Once the printer is printing and nobody has claimed it, every queue member
  // sees "I've Started" — the button is the only signal of who actually started.
  const canClaim =
    status === "printing" && !activeUserName && alreadyInQueue && !isActiveUser;

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
  const updatedLabel = formatUpdatedLabel(updatedAtMs, now);
  const isStale =
    showStaleWarning && (updatedAtMs === null || now - updatedAtMs > 2 * 60 * 1000);

  const primaryLabel =
    status === "error"
      ? "Printer needs attention"
      : status === "idle"
        ? "Available"
        : timeRemainingMinutes !== null
          ? `${formatTime(timeRemainingMinutes)} left`
          : "In use";
  const primaryDetail =
    status === "error"
      ? "Check the printer in the makerspace"
      : status === "idle"
        ? waiters.length === 0
          ? "No one is waiting"
          : `${waiters.length} in queue`
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
          {isLeavingQueue ? "Leaving…" : "Leave Queue"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this queue?</AlertDialogTitle>
          <AlertDialogDescription>
            You will lose your current position for {printerName}. You can join again later if a slot is available.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onLeaveQueue()}>
            Leave queue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const iveStartedButton = (
    <Button
      className="min-h-11 w-full shrink-0 flex-1 bg-amber-500 hover:bg-amber-600"
      onClick={() => void onIveStarted()}
      disabled={isStartingPrint}
    >
      {isStartingPrint ? "Confirming…" : "I've Started"}
    </Button>
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
              <p className="mt-1 text-3xl font-semibold tabular-nums">{primaryLabel}</p>
            </div>
            {isStale && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                <TriangleAlert className="size-3" />
                Stale
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              Updated {updatedLabel}
            </span>
            {status !== "printing" && timeRemainingMinutes !== null && (
              <span className="tabular-nums">Timer: {formatTime(timeRemainingMinutes)}</span>
            )}
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Queue ({waiters.length}/{queueLimit})
          </h3>
          {waiters.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              No one is waiting. Join now to be first in line.
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
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1 min-w-0 flex items-center gap-1.5 truncate">
                    <span className="truncate">
                      {w.userId === currentUserId ? "You" : w.displayName}
                    </span>
                    {i === 0 && headHasWindow && remainingMs !== null && (
                      <span className="shrink-0 font-mono tabular-nums text-amber-600 font-semibold">
                        {formatCountdown(remainingMs)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>

      <CardFooter className="mt-auto pt-0">
        <div className="w-full space-y-2">
          {isActiveUser ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              You&apos;re printing on this machine now.
            </div>
          ) : isMyTurn ? (
            <div className="space-y-2">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Timer className="size-4" />
                  It&apos;s your turn — go start your print
                </span>
                <p className="mt-1 text-xs">
                  Confirm here once the printer is running.
                </p>
              </div>
              {leaveButton}
            </div>
          ) : canClaim ? (
            <div className="space-y-2">
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Timer className="size-4" />
                  Started this print? Confirm it&apos;s you.
                </span>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row">
                <div className="flex-1">{leaveButton}</div>
                {iveStartedButton}
              </div>
            </div>
          ) : alreadyInQueue ? (
            leaveButton
          ) : isBanned ? (
            <div className="space-y-2">
              <Button className="h-11 w-full" disabled>
                Queue access suspended
              </Button>
              <p className="text-pretty text-xs text-muted-foreground">
                Ask a TA to review your queue status.
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
                  ? "Sign in to join queue"
                  : queueFull
                    ? `Queue full (${waiters.length}/${queueLimit})`
                    : "Join Queue"}
            </Button>
          )}
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
        </div>
      </CardFooter>
    </Card>
  );
}
