import { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "../src/components/ui/toast";

function Harness() {
  const toast = useToast();
  return (
    <>
      <button type="button" onClick={() => toast.success("Order updated", "3 orders moved to Fulfilled")}>
        success
      </button>
      <button type="button" onClick={() => toast.error("Save failed", "Try again")}>
        error
      </button>
      <button type="button" onClick={() => toast.info("Heads up")}>
        info
      </button>
    </>
  );
}

function renderToasts() {
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  it("announces success/info as polite status messages", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "success" }));

    const region = screen.getByRole("region", { name: "Notifications" });
    const status = screen.getByRole("status");
    expect(region).toContainElement(status);
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Order updated");
    expect(status).toHaveTextContent("3 orders moved to Fulfilled");
  });

  it("announces errors as assertive alerts", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "error" }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("Save failed");
  });

  it("dismisses a toast via its labelled button", () => {
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "success" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification: Order updated" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps at most five toasts, dropping the oldest", () => {
    renderToasts();
    const success = screen.getByRole("button", { name: "success" });
    for (let i = 0; i < 7; i++) fireEvent.click(success);

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(5);
  });

  it("auto-dismisses after 4.8s", () => {
    vi.useFakeTimers();
    try {
      renderToasts();
      fireEvent.click(screen.getByRole("button", { name: "success" }));
      expect(screen.getByRole("status")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(4_800);
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
