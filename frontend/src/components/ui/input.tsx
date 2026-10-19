"use client";

import { cloneElement, forwardRef, isValidElement, useId } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "focus-brand h-9.5 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground",
          "placeholder:text-muted-foreground/70 transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "focus-brand h-9.5 w-full appearance-none rounded-lg border border-border bg-surface px-3 pr-8 text-sm text-foreground",
          "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2394a3b8%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E')] bg-[position:right_0.65rem_center] bg-no-repeat",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export function Label({ className, htmlFor, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("mb-1.5 block text-[13px] font-medium text-foreground", className)} {...props}>
      {children}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  let control = children;
  let controlId = id;
  if (isValidElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>(children)) {
    controlId = children.props.id ?? id;
    control = cloneElement(children, {
      id: controlId,
      "aria-describedby": [children.props["aria-describedby"], describedBy].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : children.props["aria-invalid"],
    });
  }

  return (
    <div className={cn("w-full", className)}>
      {label ? <Label htmlFor={controlId}>{label}</Label> : null}
      {control}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[12.5px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-[12.5px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
