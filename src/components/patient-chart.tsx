"use client";

import { useMemo } from "react";
import { ChartView } from "@/components/chart-view";
import type { SampleCase } from "@/data/sample-cases";
import { buildEvidenceMap, validateEvidence } from "@/lib/evidence";

export function PatientChart({ sample }: { sample: SampleCase }) {
  const evidence = useMemo(() => buildEvidenceMap(sample.intake, sample.answers), [sample]);
  const report = useMemo(() => validateEvidence(sample.report, evidence).report, [sample, evidence]);
  return (
    <ChartView
      caseId={`sample:${sample.id}`}
      title={sample.name}
      tagline={sample.tagline}
      intake={sample.intake}
      report={report}
      evidence={evidence}
      provenance="sample"
    />
  );
}
