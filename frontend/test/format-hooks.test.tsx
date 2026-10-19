import { act, useState } from "react";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatCompact,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  initials,
  relativeTime,
} from "../src/lib/format";
import { useClickOutside, useDebounce } from "../src/lib/hooks";

afterEach(() => {
  vi.useRealTimers();
});

describe("format helpers", () => {
  it("formats currency, numbers, compact values and percents", () => {
    expect(formatCurrency(1_234.5)).toBe("$1,234.50");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");

    expect(formatNumber(1_234_567)).toBe("1,234,567");
    expect(formatNumber(undefined)).toBe("—");

    expect(formatCompact(1_500)).toBe("1.5K");
    expect(formatCompact(2_000_000)).toBe("2M");
    expect(formatCompact(null)).toBe("—");

    expect(formatPercent(12.345)).toBe("12.3%");
    expect(formatPercent(99.99, 0)).toBe("100%");
    expect(formatPercent(Number.NaN)).toBe("—");
  });

  it("handles dates defensively", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDate("2026-10-19T12:00:00Z")).toMatch(/\w{3} \d{1,2}, \d{4}/);

    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("2026-10-19T12:00:00Z")).toContain(",");
  });

  it("renders relative times across the thresholds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const at = (msAgo: number) => new Date(Date.now() - msAgo);

    expect(relativeTime(at(30_000))).toBe("just now");
    expect(relativeTime(at(5 * 60_000))).toBe("5m ago");
    expect(relativeTime(at(3 * 3_600_000))).toBe("3h ago");
    expect(relativeTime(at(2 * 86_400_000))).toBe("2d ago");
    expect(relativeTime(at(45 * 86_400_000))).toMatch(/\w{3} \d{1,2}, \d{4}/);
    expect(relativeTime(null)).toBe("—");
  });

  it("derives initials from names", () => {
    expect(initials("Ava Chen")).toBe("AC");
    expect(initials("ava")).toBe("A");
    expect(initials("Ava  Chen Smith")).toBe("AC");
    expect(initials("")).toBe("");
  });
});

describe("useDebounce", () => {
  it("only publishes the latest value after the delay", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "a" },
    });

    expect(result.current).toBe("a");
    rerender({ value: "b" });
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe("b");
  });

  it("resets the timer when the value changes again", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: "a" },
    });

    rerender({ value: "b" });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: "c" });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe("a");

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe("c");
  });
});

function Popover() {
  const [open, setOpen] = useState(true);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div>
      {open ? <div data-testid="popover" ref={ref}>Inside</div> : null}
      <button type="button">Outside</button>
    </div>
  );
}

describe("useClickOutside", () => {
  it("closes on mousedown outside and stays open on inside mousedown", () => {
    render(<Popover />);
    fireEvent.mouseDown(screen.getByTestId("popover"));
    expect(screen.getByTestId("popover")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByTestId("popover")).not.toBeInTheDocument();
  });
});
