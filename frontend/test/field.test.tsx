import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, Input } from "../src/components/ui/input";

describe("Field", () => {
  it("links the label to the control", () => {
    render(
      <Field label="Customer email">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Customer email");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("links a hint via aria-describedby", () => {
    render(
      <Field label="Email" hint="We never share it">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    const hint = screen.getByText("We never share it");
    expect(input).toHaveAttribute("aria-describedby", hint.id);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("renders errors as alerts and marks the control invalid", () => {
    render(
      <Field label="Email" error="Enter a valid email address">
        <Input />
      </Field>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Enter a valid email address");

    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
  });

  it("swaps the hint for the error when both are provided", () => {
    render(
      <Field label="Email" hint="We never share it" error="Required">
        <Input />
      </Field>,
    );
    expect(screen.queryByText("We never share it")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("preserves an explicit control id and merges existing descriptions", () => {
    render(
      <Field label="Email" hint="Helpful">
        <Input id="customer-email" aria-describedby="existing-help" />
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "customer-email");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(describedBy).toContain("existing-help");
    expect(describedBy).toContain(screen.getByText("Helpful").id);
  });
});
