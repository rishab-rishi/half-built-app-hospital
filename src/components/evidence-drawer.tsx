"use client";

import { describeEvidenceId, type EvidenceMap } from "@/lib/evidence";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type EvidenceRequest = { heading: string; ids: string[] } | null;

export function EvidenceDrawer({
  request,
  evidence,
  sample,
  onClose,
}: {
  request: EvidenceRequest;
  evidence: EvidenceMap;
  sample: boolean;
  onClose: () => void;
}) {
  const ids = request?.ids.slice(0, 3) ?? [];
  return (
    <Sheet open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto p-4 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle>Why this finding?</SheetTitle>
          <SheetDescription>
            {sample && <strong className="block">Fictional sample - not an assessment of your app.</strong>}
            Supplied text this finding points to. It is user-reported and has not been independently verified.
          </SheetDescription>
        </SheetHeader>
        {request && <p className="text-sm font-medium break-words">{request.heading}</p>}
        {ids.length === 0 ? (
          <p className="rounded-md border p-3 text-sm">
            <strong>Unconfirmed possibility.</strong> No supplied evidence directly supports this item, so
            treat it as something to check, not as an established observation.
          </p>
        ) : (
          <ul className="space-y-3">
            {ids.map((id) => (
              <li key={id} className="rounded-md border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {describeEvidenceId(id)}
                </p>
                <pre
                  tabIndex={0}
                  className="mt-1 max-h-48 overflow-auto font-sans text-sm break-words whitespace-pre-wrap"
                >
                  {Object.hasOwn(evidence, id) ? evidence[id] : "Reference unavailable."}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
