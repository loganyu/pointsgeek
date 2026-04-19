"use client";

import { useState } from "react";
import { AddProgramModal } from "./add-program-modal";

export function AddProgramButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg text-white text-sm font-medium px-3 py-1.5 transition-colors"
        style={{
          backgroundColor: "var(--purple-primary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--purple-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--purple-primary)";
        }}
      >
        <PlusIcon />
        Add program
      </button>
      <AddProgramModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}
