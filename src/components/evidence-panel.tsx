"use client";

import { useId, useRef } from "react";
import { describeEvidenceId, isReferenceId, type EvidenceMap } from "@/lib/evidence";
import { lookupReference } from "@/lib/playbook";

/**
 * "Why this finding?": expands the exact supplied text a finding points to, right beside the finding.
 * The excerpts come from the validated evidence map, never from model-authored quotations, and opening or
 * closing the panel makes no network request.
 */
export function EvidenceToggle({
  ids,
  evidence,
  sample,
  open,
  onOpenChange,
}: {
  ids: string[];
  evidence: EvidenceMap;
  sample: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const shown = ids.slice(0, 3);
  // Playbook references are general background, not text the user supplied, so they never count as support.
  const hasSupplied = shown.some((id) => !isReferenceId(id));
  const hasReference = shown.some(isReferenceId);
  const textFor = (id: string) =>
    Object.hasOwn(evidence, id) ? evidence[id] : (lookupReference(id)?.text ?? "Reference unavailable.");

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          onOpenChange(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onOpenChange(!open)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-1 text-[0.9375rem] font-medium text-foreground underline decoration-border decoration-2 underline-offset-[6px] transition-colors duration-150 hover:text-rust hover:decoration-rust"
      >
        <span aria-hidden className="font-mono text-base leading-none">
          {open ? "−" : "+"}
        </span>
        {open ? "Hide evidence" : `View evidence${ids.length === 0 ? " (none)" : ""}`}
      </button>
      <div
        id={panelId}
        hidden={!open}
        role="region"
        aria-label="Why this finding?"
        className="mt-1 mb-2 rounded-md border border-border bg-olive/60 p-4"
      >
        <p className="label-mono">Why this finding?</p>
        {sample && <p className="mt-2 text-[0.9375rem] font-semibold">Fictional sample - not an assessment of your app.</p>}
        {hasSupplied && (
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">
            Supplied text this finding points to. It is user-reported and has not been independently verified.
          </p>
        )}
        {hasReference && (
          <p className="mt-2 text-[0.9375rem] text-muted-foreground">
            Items marked Reference are general background from the app&apos;s playbook of common failure patterns.
            They are not facts about your app and may not apply.
          </p>
        )}
        {!hasSupplied && (
          <p className="notice mt-3">
            <strong>Unconfirmed possibility.</strong> No supplied evidence directly supports this item, so treat it as
            something to check, not as an established observation.
          </p>
        )}
        {shown.length > 0 && (
          <ul className="mt-3 space-y-3">
            {shown.map((id) => (
              <li key={id} className="rounded-md border border-border bg-paper p-3">
                <p className="label-mono">{describeEvidenceId(id)}</p>
                <pre
                  tabIndex={0}
                  className="mt-1.5 max-h-48 overflow-auto font-sans text-[0.9375rem] leading-relaxed break-words whitespace-pre-wrap"
                >
                  {textFor(id)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
