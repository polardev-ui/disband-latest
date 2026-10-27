import { DisplayName } from "@/components/ui/DisplayName";

export default function FontTestPage() {
  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl">Font test</h1>
      <p className="text-lg">
        <DisplayName profile={{ display_name: "Futuristic Name", name_font: "future", name_color: "#ff5ea8" }} />
      </p>
      <p className="mt-4 text-lg">
        <DisplayName profile={{ display_name: "Default Name" }} />
      </p>
    </div>
  );
}
