import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrinterCard } from "@/components/dashboard/printer-card";

const baseProps = {
  printerName: "Bambu X1C #MOREL",
  status: "idle" as const,
  timeRemainingMinutes: null,
  filamentLevel: null,
  waiters: [],
  currentUserId: null,
  isJoiningQueue: false,
  isLeavingQueue: false,
  isStartingPrint: false,
  alreadyInQueue: false,
  isBanned: false,
  onJoinQueue: vi.fn().mockResolvedValue(undefined),
  onLeaveQueue: vi.fn().mockResolvedValue(undefined),
  onIveStarted: vi.fn().mockResolvedValue(undefined),
};

describe("PrinterCard", () => {
  it("renders the printer name", () => {
    render(<PrinterCard {...baseProps} />);
    expect(screen.getByText("Bambu X1C #MOREL")).toBeInTheDocument();
  });

  it('shows "Idle" badge when status is idle', () => {
    render(<PrinterCard {...baseProps} status="idle" />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it('shows "Printing" badge when status is printing', () => {
    render(<PrinterCard {...baseProps} status="printing" />);
    expect(screen.getByText("Printing")).toBeInTheDocument();
  });

  it('shows "Error" badge when status is error', () => {
    render(<PrinterCard {...baseProps} status="error" />);
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it('shows "Sign in to join queue" when no user is logged in', () => {
    render(<PrinterCard {...baseProps} currentUserId={null} />);
    expect(screen.getByRole("button", { name: /sign in to join queue/i })).toBeDisabled();
  });

  it('shows "Join Queue" button when user is logged in and not in queue', () => {
    render(<PrinterCard {...baseProps} currentUserId="user-123" alreadyInQueue={false} />);
    expect(screen.getByRole("button", { name: /join queue/i })).toBeEnabled();
  });

  it("calls onJoinQueue when Join Queue is clicked", async () => {
    const onJoinQueue = vi.fn().mockResolvedValue(undefined);
    render(
      <PrinterCard {...baseProps} currentUserId="user-123" onJoinQueue={onJoinQueue} />
    );
    await userEvent.click(screen.getByRole("button", { name: /join queue/i }));
    expect(onJoinQueue).toHaveBeenCalledOnce();
  });

  it('shows "Leave Queue" when already in queue (not my turn)', () => {
    render(
      <PrinterCard
        {...baseProps}
        currentUserId="user-123"
        alreadyInQueue={true}
        waiters={[
          {
            id: "q1",
            userId: "other-user",
            displayName: "Alice",
            createdAt: "2024-01-01T10:00:00Z",
            notifiedAt: null,
            startedAt: null,
          },
          {
            id: "q2",
            userId: "user-123",
            displayName: "You",
            createdAt: "2024-01-01T11:00:00Z",
            notifiedAt: null,
            startedAt: null,
          },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: /leave queue/i })).toBeInTheDocument();
  });

  it('shows "Queue access suspended" for banned users', () => {
    render(<PrinterCard {...baseProps} currentUserId="user-123" isBanned={true} />);
    expect(screen.getByRole("button", { name: /queue access suspended/i })).toBeDisabled();
  });

  it("shows your-turn banner and both action buttons when it is the user's turn", () => {
    render(
      <PrinterCard
        {...baseProps}
        currentUserId="user-123"
        status="idle"
        alreadyInQueue={true}
        waiters={[
          {
            id: "q1",
            userId: "user-123",
            displayName: "You",
            createdAt: "2024-01-01T10:00:00Z",
            notifiedAt: new Date().toISOString(),
            startedAt: null,
          },
        ]}
      />
    );
    expect(screen.getByText(/it's your turn/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /i've started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /leave queue/i })).toBeInTheDocument();
  });

  it("displays time remaining when provided", () => {
    render(<PrinterCard {...baseProps} timeRemainingMinutes={90} />);
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
  });

  it("displays filament level when provided", () => {
    render(<PrinterCard {...baseProps} filamentLevel={75} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });
});
