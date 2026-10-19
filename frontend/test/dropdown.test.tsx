import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu, type MenuItem } from "../src/components/ui/dropdown";

function setup() {
  const onRename = vi.fn();
  const onDelete = vi.fn();
  const items: MenuItem[] = [
    { label: "Rename", onSelect: onRename },
    { separator: true },
    { label: "Duplicate", disabled: true },
    { label: "Delete", danger: true, onSelect: onDelete },
  ];
  render(
    <DropdownMenu trigger={<button type="button">Actions</button>} items={items} />,
  );
  const trigger = screen.getByRole("button", { name: "Actions" });
  return { trigger, onRename, onDelete };
}

describe("DropdownMenu", () => {
  it("exposes menu trigger semantics and toggles open state", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("focuses the first actionable item on open", async () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus());
  });

  it("moves with arrows, skips separators/disabled items and wraps", async () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const rename = screen.getByRole("menuitem", { name: "Rename" });
    const del = screen.getByRole("menuitem", { name: "Delete" });

    await waitFor(() => expect(rename).toHaveFocus());
    fireEvent.keyDown(document, { key: "ArrowDown" });
    await waitFor(() => expect(del).toHaveFocus());

    fireEvent.keyDown(document, { key: "ArrowDown" });
    await waitFor(() => expect(rename).toHaveFocus());

    fireEvent.keyDown(document, { key: "ArrowUp" });
    await waitFor(() => expect(del).toHaveFocus());

    fireEvent.keyDown(document, { key: "Home" });
    await waitFor(() => expect(rename).toHaveFocus());

    fireEvent.keyDown(document, { key: "End" });
    await waitFor(() => expect(del).toHaveFocus());
  });

  it("activates the highlighted item with Enter, then restores trigger focus", async () => {
    const { trigger, onRename } = setup();
    trigger.focus();
    fireEvent.click(trigger);
    const rename = screen.getByRole("menuitem", { name: "Rename" });
    await waitFor(() => expect(rename).toHaveFocus());

    fireEvent.keyDown(rename, { key: "Enter" });
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes on Escape and restores trigger focus", async () => {
    const { trigger } = setup();
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes when clicking outside", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("marks disabled items as disabled", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toBeDisabled();
  });
});
