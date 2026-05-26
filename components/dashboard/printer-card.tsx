"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CircleCheck,
  Clock3,
  LoaderCircle,
  Printer,
  Timer,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  filamentLevel: number | null;
  waiters: QueueWaiter[];
  currentUserId: string | null;
  isJoiningQueue: boolean;
  isLeavingQueue: boolean;
  isStartingPrint: boolean;
  alreadyInQueue: boolean;
  isBanned: boolean;
  onJoinQueue: () => Promise<void>;
  onLeaveQueue: () => Promise<void>;
  onIveStarted: () => Promise<void>;
}

const statusConfig: Record<
  PrinterStatus,
  { badgeLabel: string; badgeClassName: string; icon: React.ReactNode }
> = {
  idle: {
    badgeLabel: "Idle",
    badgeClassName: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    icon: <CircleCheck className="size-4 text-emerald-600" />,
  },
  printing: {
    badgeLabel: "Printing",
    badgeClassName: "bg-amber-100 text-amber-700 hover:bg-amber-100",
    icon: <LoaderCircle className="size-4 animate-spin text-amber-600" />,
  },
  error: {
    badgeLabel: "Error",
    badgeClassName: "bg-red-100 text-red-700 hover:bg-red-100",
    icon: <AlertTriangle className="size-4 text-red-600" />,
  },
};

import { formatCountdown, formatFilament, formatTime } from "@/lib/printer-utils";

const NO_SHOW_MS = 10 * 60 * 1000;

export function PrinterCard({
  printerName,
  status,
  timeRemainingMinutes,
  filamentLevel,
  waiters,
  currentUserId,
  isJoiningQueue,
  isLeavingQueue,
  isStartingPrint,
  alreadyInQueue,
  isBanned,
  onJoinQueue,
  onLeaveQueue,
  onIveStarted,
}: PrinterCardProps) {
  const activeSlots = waiters.slice(0, 2);
  const waitlist = waiters.slice(2);
  const config = statusConfig[status];

  const slot1 = waiters[0] ?? null;
  const isMyTurn =
    slot1 !== null &&
    slot1.userId === currentUserId &&
    status === "idle" &&
    slot1.startedAt === null;

  // Use notifiedAt from DB when available; fall back to when isMyTurn first became true
  const turnStartRef = useRef<number | null>(null);
  if (isMyTurn && turnStartRef.current === null) {
    turnStartRef.current = slot1?.notifiedAt
      ? Date.parse(slot1.notifiedAt)
      : Date.now();
  }
  if (!isMyTurn) {
    turnStartRef.current = null;
  }

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isMyTurn) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isMyTurn]);

  const remainingMs =
    isMyTurn && turnStartRef.current !== null
      ? Math.max(0, NO_SHOW_MS - (now - turnStartRef.current))
      : null;

  return (
    <Card className="h-full">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Printer className="size-5 text-muted-foreground" />
            {printerName}
          </CardTitle>
          <Badge className={config.badgeClassName}>
            {config.icon}
            {config.badgeLabel}
          </Badge>
        </div>
        <CardDescription>
          {status === "printing" && slot1
            ? `Printing for ${slot1.displayName}`
            : status === "error" && slot1
              ? `Error — ${slot1.displayName}'s job`
              : "Live status and queue"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* "Your turn" banner */}
        {isMyTurn && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 font-semibold">
                <Timer className="size-4" />
                It&apos;s your turn!
              </p>
              {remainingMs !== null && (
                <span className="font-mono text-base font-bold tabular-nums">
                  {formatCountdown(remainingMs)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs">
              Click &ldquo;I&apos;ve Started&rdquo; within 10 min or you&apos;ll be marked as a no-show.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" />
              Time Remaining
            </p>
            <p className="text-sm font-semibold">{formatTime(timeRemainingMinutes)}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="mb-1 text-xs text-muted-foreground">Filament</p>
            <p className="text-sm font-semibold">{formatFilament(filamentLevel)}</p>
          </div>
        </div>

        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <Users className="size-4 text-muted-foreground" />
            Active Slots ({activeSlots.length}/2)
          </h3>
          {activeSlots.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              No active waiters.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeSlots.map((w, i) => (
                <li
                  key={w.id}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                    w.userId === currentUserId
                      ? "border-amber-300 bg-amber-50 font-medium"
                      : "border-border"
                  }`}
                >
                  <span>
                    {w.userId === currentUserId ? "You" : w.displayName}
                    {i === 0 && status === "printing" && (
                      <span className="ml-1.5 text-amber-600">&middot; printing</span>
                    )}
                    {i === 0 && status === "idle" && w.startedAt === null && w.notifiedAt && (
                      <span className="ml-1.5 text-emerald-600">&middot; waiting to start</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">#{i + 1}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {waitlist.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Waitlist ({waitlist.length})
            </h3>
            <ul className="space-y-2">
              {waitlist.map((w, i) => (
                <li
                  key={w.id}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${
                    w.userId === currentUserId
                      ? "border-amber-300 bg-amber-50 font-medium"
                      : "border-border"
                  }`}
                >
                  <span>{w.userId === currentUserId ? "You" : w.displayName}</span>
                  <span className="text-muted-foreground">
                    #{i + activeSlots.length + 1}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>

      <CardFooter className="border-t pt-4">
        {isMyTurn ? (
          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1 text-red-600 hover:text-red-700"
              onClick={() => void onLeaveQueue()}
              disabled={isLeavingQueue}
            >
              {isLeavingQueue ? "Leaving…" : "Leave Queue"}
            </Button>
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-600"
              onClick={() => void onIveStarted()}
              disabled={isStartingPrint}
            >
              {isStartingPrint ? "Confirming…" : "I've Started"}
            </Button>
          </div>
        ) : alreadyInQueue ? (
          <Button
            variant="outline"
            className="w-full text-red-600 hover:text-red-700"
            onClick={() => void onLeaveQueue()}
            disabled={isLeavingQueue}
          >
            {isLeavingQueue ? "Leaving…" : "Leave Queue"}
          </Button>
        ) : isBanned ? (
          <Button className="w-full" disabled>
            Queue access suspended
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() => void onJoinQueue()}
            disabled={isJoiningQueue || !currentUserId}
          >
            {isJoiningQueue
              ? "Joining…"
              : !currentUserId
                ? "Sign in to join queue"
                : "Join Queue"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
