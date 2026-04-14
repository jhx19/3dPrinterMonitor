import { PrinterCard, type PrinterCardProps } from "@/components/dashboard/printer-card";

interface PrinterGridProps {
  printers: PrinterCardProps[];
}

export function PrinterGrid({ printers }: PrinterGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {printers.map((printer) => (
        <PrinterCard key={printer.printerName} {...printer} />
      ))}
    </div>
  );
}
