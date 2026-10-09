import { AdmissionFlow } from "@/components/admission-flow";

export const metadata = { title: "Admit your app - Half-Built App Hospital" };

export default function AdmissionPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Admit your app</h1>
      <AdmissionFlow />
    </div>
  );
}
