"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { PrinterGrid } from "@/components/dashboard/printer-grid";
import type { PrinterStatus, QueueWaiter } from "@/components/dashboard/printer-card";

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000000";

type PrinterRow = Database["public"]["Tables"]["printers"]["Row"];
type QueueRow = Database["public"]["Tables"]["queues"]["Row"];
type QueueInsert = Database["public"]["Tables"]["queues"]["Insert"];

interface PrinterViewModel {
  id: string;
  name: string;
  status: PrinterStatus;
  timeRemainingMinutes: number | null;
  filamentLevel: number | null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getFirstString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toStringOrNull(row[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function getFirstNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = toNumberOrNull(row[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function normalizeStatus(rawStatus: string | null): PrinterStatus {
  switch (rawStatus?.toLowerCase()) {
    case "printing":
      return "printing";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

function mapPrinter(row: PrinterRow): PrinterViewModel {
  const record = row as Record<string, unknown>;
  const id =
    getFirstString(record, ["id", "printer_id", "uuid"]) ??
    getFirstString(record, ["name", "printer_name"]) ??
    crypto.randomUUID();
  const name = getFirstString(record, ["name", "printer_name"]) ?? "Unknown Printer";
  const status = normalizeStatus(getFirstString(record, ["status", "printer_status"]));
  const timeRemainingMinutes = getFirstNumber(record, [
    "time_remaining",
    "time_remaining_minutes",
    "remaining_minutes",
    "eta_minutes",
  ]);
  const filamentLevel = getFirstNumber(record, [
    "filament_level",
    "filament_percent",
    "filament",
  ]);

  return { id, name, status, timeRemainingMinutes, filamentLevel };
}

function getQueuePrinterRef(row: QueueRow): string | null {
  const record = row as Record<string, unknown>;
  return getFirstString(record, [
    "printer_id",
    "printer_name",
    "printer",
    "machine_name",
    "printer_uuid",
  ]);
}

function mapQueueWaiter(row: QueueRow): QueueWaiter | null {
  const record = row as Record<string, unknown>;
  const id = getFirstString(record, ["id"]) ?? crypto.randomUUID();
  const userId = getFirstString(record, ["user_id", "profile_id"]);
  if (!userId) {
    return null;
  }
  const createdAt = getFirstString(record, ["created_at", "queued_at", "joined_at"]);

  return { id, userId, createdAt };
}

function sortQueue(waiters: QueueWaiter[]) {
  return [...waiters].sort((a, b) => {
    const timeA = a.createdAt ? Date.parse(a.createdAt) : Number.MAX_SAFE_INTEGER;
    const timeB = b.createdAt ? Date.parse(b.createdAt) : Number.MAX_SAFE_INTEGER;
    if (timeA === timeB) {
      return a.id.localeCompare(b.id);
    }
    return timeA - timeB;
  });
}

export function PrinterDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [printers, setPrinters] = useState<PrinterViewModel[]>([]);
  const [queues, setQueues] = useState<QueueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [joiningPrinterIds, setJoiningPrinterIds] = useState<Record<string, boolean>>({});

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

    setPrinters((printerResult.data ?? []).map(mapPrinter));
    setQueues(queueResult.data ?? []);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => {
      void loadData();
    }, 0);

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
      window.clearTimeout(initialLoadTimer);
      void supabase.removeChannel(printerChannel);
      void supabase.removeChannel(queueChannel);
    };
  }, [loadData, supabase]);

  const waitersByPrinter = useMemo(() => {
    const map = new Map<string, QueueWaiter[]>();

    for (const printer of printers) {
      const waiters = queues
        .filter((queueRow) => {
          const queuePrinterRef = getQueuePrinterRef(queueRow);
          return queuePrinterRef === printer.id || queuePrinterRef === printer.name;
        })
        .map(mapQueueWaiter)
        .filter((waiter): waiter is QueueWaiter => waiter !== null);

      map.set(printer.id, sortQueue(waiters));
    }

    return map;
  }, [printers, queues]);

  const joinQueue = useCallback(
    async (printer: PrinterViewModel) => {
      const existingWaiters = waitersByPrinter.get(printer.id) ?? [];
      const alreadyQueued = existingWaiters.some((waiter) => waiter.userId === MOCK_USER_ID);
      if (alreadyQueued) {
        return;
      }

      setJoiningPrinterIds((previous) => ({ ...previous, [printer.id]: true }));
      setErrorMessage(null);

      const insertPayloadCandidates: QueueInsert[] = [
        { printer_id: printer.id, user_id: MOCK_USER_ID },
        { printer_name: printer.name, user_id: MOCK_USER_ID },
        { printer: printer.name, user_id: MOCK_USER_ID },
        { machine_name: printer.name, user_id: MOCK_USER_ID },
      ];

      let insertError: string | null = null;
      for (const payload of insertPayloadCandidates) {
        const { error } = await supabase.from("queues").insert(payload);
        if (!error) {
          setQueues((previous) => [
            ...previous,
            {
              id: crypto.randomUUID(),
              user_id: MOCK_USER_ID,
              printer_id: String(
                payload.printer_id ??
                  payload["printer_name"] ??
                  payload["printer"] ??
                  payload["machine_name"] ??
                  printer.name,
              ),
              created_at: new Date().toISOString(),
            } as QueueRow,
          ]);
          setJoiningPrinterIds((previous) => ({ ...previous, [printer.id]: false }));
          return;
        }

        if (error.message.toLowerCase().includes("duplicate")) {
          insertError = "You are already in this queue.";
          break;
        }

        insertError = error.message;
      }

      setErrorMessage(insertError ?? "Unable to join queue.");
      setJoiningPrinterIds((previous) => ({ ...previous, [printer.id]: false }));
    },
    [supabase, waitersByPrinter],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" />
          Loading printer dashboard...
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
      <div className="rounded-lg border border-border p-6 text-sm text-muted-foreground">
        No printers found. Seed the `printers` table to render this dashboard.
      </div>
    );
  }

  return (
    <PrinterGrid
      printers={printers.map((printer) => {
        const waiters = waitersByPrinter.get(printer.id) ?? [];
        const alreadyInQueue = waiters.some((waiter) => waiter.userId === MOCK_USER_ID);

        return {
          printerName: printer.name,
          status: printer.status,
          timeRemainingMinutes: printer.timeRemainingMinutes,
          filamentLevel: printer.filamentLevel,
          waiters,
          isJoiningQueue: Boolean(joiningPrinterIds[printer.id]),
          alreadyInQueue,
          onJoinQueue: async () => joinQueue(printer),
        };
      })}
    />
  );
}
