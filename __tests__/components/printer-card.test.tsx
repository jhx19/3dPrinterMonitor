import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrinterCard } from "@/components/dashboard/printer-card";

const baseProps = {
  printerName: "Bambu X1C #MOREL",
  status: "idle" as const,
  timeRemainingMinutes: null,
  updatedAt: "2024-01-01T10:00:00Z",
  showStaleWarning: true,
  waiters: [],
  currentUserId: null,
  activeUserName: null,
  isActiveUser: false,
  isJoiningQueue: false,
  isLeavingQueue: false,
  isStartingPrint: false,
  alreadyInQueue: false,
  isBanned: false,
  actionError: null,
  queueLimit: 3,
  onJoinQueue: vi.fn().mockResolvedValue(undefined),
  onLeaveQueue: vi.fn().mockResolvedValue(undefined),
  onIveStarted: vi.fn().mockResolvedValue(undefined),
};

describe("PrinterCard", () => {
  it("renders the printer name", () => {
    render(<PrinterCard {...baseProps} />);
    expect(screen.getByText("Bambu X1C #MOREL")).toBeInTheDocument();
  });

  it('shows "Available" badge when status is idle', () => {
    render(<PrinterCard {...baseProps} status="idle" />);
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
  });

  it('shows "In use" badge when status is printing', () => {
    render(<PrinterCard {...baseProps} status="printing" timeRemainingMinutes={47} />);
    expect(screen.getByText("In use")).toBeInTheDocument();
  });

  it('shows "Printer needs attention" fallback when status is error', () => {
    render(<PrinterCard {...baseProps} status="error" />);
    expect(screen.getByText("Printer needs attention")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
  });

  it("shows who is currently printing when claimed", () => {
    render(
      <PrinterCard
        {...baseProps}
        status="printing"
        timeRemainingMinutes={47}
        activeUserName="Alex Kim"
      />,
    );
    expect(screen.getByText("In use by Alex Kim")).toBeInTheDocument();
  });

  it("shows sign-in prompt and hides queue when no user is logged in", () => {
    render(<PrinterCard {...baseProps} currentUserId={null} />);
    expect(screen.getByText(/sign in to view queue/i)).toBeInTheDocument();
    expect(screen.queryByText(/queue \(/i)).not.toBeInTheDocument();
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

  it("disables join when the queue is full", () => {
    render(
      <PrinterCard
        {...baseProps}
        currentUserId="user-123"
        waiters={[
          { id: "q1", userId: "a", displayName: "A", createdAt: "2024-01-01T10:00:00Z", notifiedAt: null, startedAt: null },
          { id: "q2", userId: "b", displayName: "B", createdAt: "2024-01-01T10:01:00Z", notifiedAt: null, startedAt: null },
          { id: "q3", userId: "c", displayName: "C", createdAt: "2024-01-01T10:02:00Z", notifiedAt: null, startedAt: null },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: /queue full/i })).toBeDisabled();
  });

  it('shows "Leave Queue" when already in queue (idle, not head)', () => {
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

  it("shows the claim-window countdown (idle head) with no I've Started button", () => {
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
    expect(screen.getByRole("button", { name: /leave queue/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /i've started/i })).not.toBeInTheDocument();
  });

  it("shows I've Started to queue members once the printer is printing and unclaimed", () => {
    render(
      <PrinterCard
        {...baseProps}
        currentUserId="user-123"
        status="printing"
        timeRemainingMinutes={20}
        alreadyInQueue={true}
        activeUserName={null}
        waiters={[
          {
            id: "q1",
            userId: "user-123",
            displayName: "You",
            createdAt: "2024-01-01T10:00:00Z",
            notifiedAt: null,
            startedAt: null,
          },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: /i've started/i })).toBeInTheDocument();
  });

  it("calls onIveStarted when I've Started is clicked", async () => {
    const onIveStarted = vi.fn().mockResolvedValue(undefined);
    render(
      <PrinterCard
        {...baseProps}
        currentUserId="user-123"
        status="printing"
        alreadyInQueue={true}
        onIveStarted={onIveStarted}
        waiters={[
          {
            id: "q1",
            userId: "user-123",
            displayName: "You",
            createdAt: "2024-01-01T10:00:00Z",
            notifiedAt: null,
            startedAt: null,
          },
        ]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: /i've started/i }));
    expect(onIveStarted).toHaveBeenCalledOnce();
  });

  it("displays time remaining when provided", () => {
    render(<PrinterCard {...baseProps} timeRemainingMinutes={90} />);
    expect(screen.getByText((_, element) => element?.textContent === "Timer: 1h 30m")).toBeInTheDocument();
  });
});
