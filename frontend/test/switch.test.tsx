import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "../src/components/ui/switch";

describe("Switch", () => {
  it("exposes switch semantics with an accessible label", () => {
    render(<Switch checked={false} onChange={() => undefined} label="Priority support" />);
    const toggle = screen.getByRole("switch", { name: "Priority support" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("reports the next value on click (off → on)", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Priority support" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports the next value on click (on → off)", () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} label="Priority support" />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("does nothing when disabled", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} disabled label="Priority support" />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the shipped 40×24px track and 18px knob geometry", () => {
    render(<Switch checked onChange={() => undefined} label="Priority support" />);
    const toggle = screen.getByRole("switch");
    expect(toggle.className).toContain("h-6");
    expect(toggle.className).toContain("w-10");
    expect(toggle.querySelector("span")?.className).toContain("size-4.5");
    expect(toggle.querySelector("span")?.className).toContain("translate-x-[19px]");
  });
});
