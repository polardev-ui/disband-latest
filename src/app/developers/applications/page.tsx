"use client";

import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { AppProvider } from "@/contexts/AppContext";
import { DeveloperPortal } from "@/components/developers/DeveloperPortal";
import { DevelopersHeader } from "@/components/developers/DevelopersHeader";

export default function DevelopersApplicationsPage() {
  return (
    <ThemeProvider>
      <AppProvider>
        <div className="min-h-screen bg-bg-primary text-text-normal">
          <DevelopersHeader current="applications" />
          <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
            <DeveloperPortal />
          </main>
        </div>
      </AppProvider>
    </ThemeProvider>
  );
}
