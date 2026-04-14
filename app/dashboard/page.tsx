import { PrinterDashboard } from "@/components/dashboard/printer-dashboard";

export default function DashboardPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">3D Printer Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live machine status, time remaining, filament levels, and per-printer queue slots.
        </p>
      </header>
      <PrinterDashboard />
    </main>
  );
}
