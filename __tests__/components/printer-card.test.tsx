import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrinterCard } from "@/components/dashboard/printer-card";

const baseProps = {
  printerName: "MOREL",
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
  alreadyInQueue: false,
  isBanned: false,
  actionError: null,
  queueLimit: 3,
  onJoinQueue: vi.fn().mockResolvedValue(undefined),
  onLeaveQueue: vi.fn().mockResolvedValue(undefined),
};

describe("PrinterCard", () => {
  it("renders the printer name", () => {
    render(<PrinterCard {...baseProps} />);
    expect(screen.getByText("MOREL")).toBeInTheDocument();
  });

  it('shows "Available" badge when status is idle', () => {
    render(<PrinterCard {...baseProps} status="idle" />);
    expect(screen.getAllByText("Available").length).toBeGreaterThan(0);
  });

  it('shows "In use" badge when status is printing', () => {
    render(<PrinterCard {...baseProps} status="printing" timeRemainingMinutes={47} />);
    expect(screen.getByText("In use")).toBeInTheDocument();
  });

  it('shows "Needs attention" when status is error', () => {
    render(<PrinterCard {...baseProps} status="error" />);
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
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

  it("shows sign-in prompt and hides waitlist when no user is logged in", () => {
    render(<PrinterCard {...baseProps} currentUserId={null} />);
    expect(screen.getByText(/sign in to view waitlist/i)).toBeInTheDocument();
    expect(screen.queryByText(/waitlist \(/i)).not.toBeInTheDocument();
  });

  it('shows "Join waitlist" button when user is logged in and not in waitlist', () => {
    render(<PrinterCard {...baseProps} currentUserId="user-123" alreadyInQueue={false} />);
    expect(screen.getByRole("button", { name: /join waitlist/i })).toBeEnabled();
  });

  it("calls onJoinQueue when Join waitlist is clicked", async () => {
    const onJoinQueue = vi.fn().mockResolvedValue(undefined);
    render(
      <PrinterCard {...baseProps} currentUserId="user-123" onJoinQueue={onJoinQueue} />
    );
    await userEvent.click(screen.getByRole("button", { name: /join waitlist/i }));
    expect(onJoinQueue).toHaveBeenCalledOnce();
  });

  it("disables join when the waitlist is full", () => {
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
    expect(screen.getByRole("button", { name: /waitlist full/i })).toBeDisabled();
  });

  it('shows "Leave waitlist" when already in waitlist', () => {
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
    expect(screen.getByRole("button", { name: /leave waitlist/i })).toBeInTheDocument();
  });

  it('shows "Waitlist access suspended" for banned users', () => {
    render(<PrinterCard {...baseProps} currentUserId="user-123" isBanned={true} />);
    expect(screen.getByRole("button", { name: /waitlist access suspended/i })).toBeDisabled();
  });

  it("shows claim-window alert (idle head) with leave button only", () => {
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
    expect(screen.getByText(/printer is available/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /leave waitlist/i })).toBeInTheDocument();
  });

  it("shows estimated completion time when printing with time remaining", () => {
    render(
      <PrinterCard
        {...baseProps}
        status="printing"
        timeRemainingMinutes={90}
        currentUserId="user-123"
      />,
    );
    expect(screen.getByText(/done around/i)).toBeInTheDocument();
  });

  it("does not show estimated completion time when idle", () => {
    render(<PrinterCard {...baseProps} status="idle" currentUserId="user-123" />);
    expect(screen.queryByText(/done around/i)).not.toBeInTheDocument();
  });
});
