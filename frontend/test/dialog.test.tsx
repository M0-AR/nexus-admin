import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "../src/components/ui/dialog";

function BasicDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader title="Rename workspace" description="This changes the URL slug." onClose={onClose} />
      <DialogBody>
        <input aria-label="Workspace name" />
      </DialogBody>
      <DialogFooter>
        <button type="button">Cancel</button>
        <button type="button" data-autofocus>
          Save
        </button>
      </DialogFooter>
    </Dialog>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <BasicDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe("Dialog", () => {
  it("exposes an accessible dialog named by its header", () => {
    render(<BasicDialog open onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Rename workspace" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("This changes the URL slug.")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<BasicDialog open={false} onClose={() => undefined} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<BasicDialog open onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focuses the [data-autofocus] target on open", async () => {
    render(<BasicDialog open onClose={() => undefined} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toHaveFocus());
  });

  it("traps Tab: last → first and Shift+Tab: first → last", async () => {
    render(<BasicDialog open onClose={() => undefined} />);
    const save = screen.getByRole("button", { name: "Save" });
    const close = screen.getByRole("button", { name: "Close" });
    await waitFor(() => expect(save).toHaveFocus());

    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(save).toHaveFocus();
  });

  it("locks body scroll while open and restores it on close", () => {
    const { rerender } = render(<BasicDialog open onClose={() => undefined} />);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<BasicDialog open={false} onClose={() => undefined} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("restores focus to the trigger when closed", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("only dismisses the top-most dialog on Escape", () => {
    const closeFirst = vi.fn();
    const closeSecond = vi.fn();
    render(
      <>
        <Dialog open onClose={closeFirst}>
          <DialogHeader title="First" />
          <DialogBody>
            <button type="button">One</button>
          </DialogBody>
        </Dialog>
        <Dialog open onClose={closeSecond}>
          <DialogHeader title="Second" />
          <DialogBody>
            <button type="button">Two</button>
          </DialogBody>
        </Dialog>
      </>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(closeSecond).toHaveBeenCalledTimes(1);
    expect(closeFirst).not.toHaveBeenCalled();
  });
});
