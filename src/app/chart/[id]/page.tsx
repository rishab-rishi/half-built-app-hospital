import { notFound } from "next/navigation";
import { PatientChart } from "@/components/patient-chart";
import { sampleCases } from "@/data/sample-cases";

export function generateStaticParams() {
  return sampleCases.map((c) => ({ id: c.id }));
}

export default async function ChartPage({ params }: PageProps<"/chart/[id]">) {
  const { id } = await params;
  const sample = sampleCases.find((c) => c.id === id);
  if (!sample) notFound();
  return <PatientChart key={sample.id} sample={sample} />;
}
