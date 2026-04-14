"use client";

import {
  AlertTriangle,
  CircleCheck,
  Clock3,
  LoaderCircle,
  Printer,
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
  createdAt: string | null;
}

export interface PrinterCardProps {
  printerName: string;
  status: PrinterStatus;
  timeRemainingMinutes: number | null;
  filamentLevel: number | null;
  waiters: QueueWaiter[];
  isJoiningQueue: boolean;
  alreadyInQueue: boolean;
  onJoinQueue: () => Promise<void>;
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

function formatTime(timeRemainingMinutes: number | null) {
  if (timeRemainingMinutes === null || Number.isNaN(timeRemainingMinutes)) {
    return "Unknown";
  }

  if (timeRemainingMinutes <= 0) {
    return "Ready";
  }

  const hours = Math.floor(timeRemainingMinutes / 60);
  const minutes = Math.floor(timeRemainingMinutes % 60);

  if (hours === 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatFilament(filamentLevel: number | null) {
  if (filamentLevel === null || Number.isNaN(filamentLevel)) {
    return "Unknown";
  }

  return `${Math.max(0, Math.min(100, Math.round(filamentLevel)))}%`;
}

function renderWaiter(waiter: QueueWaiter, index: number) {
  const suffix = waiter.userId.slice(-6).toUpperCase();
  return (
    <li
      key={waiter.id}
      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
    >
      <span>User {suffix}</span>
      <span className="text-muted-foreground">#{index + 1}</span>
    </li>
  );
}

export function PrinterCard({
  printerName,
  status,
  timeRemainingMinutes,
  filamentLevel,
  waiters,
  isJoiningQueue,
  alreadyInQueue,
  onJoinQueue,
}: PrinterCardProps) {
  const activeSlots = waiters.slice(0, 2);
  const secondaryWaitlist = waiters.slice(2);
  const currentStatus = statusConfig[status];

  return (
    <Card className="h-full">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Printer className="size-5 text-muted-foreground" />
            {printerName}
          </CardTitle>
          <Badge className={currentStatus.badgeClassName}>
            {currentStatus.icon}
            {currentStatus.badgeLabel}
          </Badge>
        </div>
        <CardDescription>Live status and queue overview</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-border p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" />
              Time Remaining
            </p>
            <p className="text-sm font-semibold">{formatTime(timeRemainingMinutes)}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="mb-1 text-xs text-muted-foreground">Filament Level</p>
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
            <ul className="space-y-2">{activeSlots.map(renderWaiter)}</ul>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Secondary Waitlist ({secondaryWaitlist.length})</h3>
          {secondaryWaitlist.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              No users in overflow waitlist.
            </p>
          ) : (
            <ul className="space-y-2">
              {secondaryWaitlist.map((waiter, index) =>
                renderWaiter(waiter, index + activeSlots.length),
              )}
            </ul>
          )}
        </section>
      </CardContent>

      <CardFooter className="border-t">
        <Button
          className="w-full"
          onClick={() => void onJoinQueue()}
          disabled={alreadyInQueue || isJoiningQueue}
        >
          {alreadyInQueue
            ? "Already in Queue"
            : isJoiningQueue
              ? "Joining..."
              : "Join Queue"}
        </Button>
      </CardFooter>
    </Card>
  );
}
