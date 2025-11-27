"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";

export function ViewNavigation() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentView = searchParams.get("view") || "timeline";

  const setView = (view: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.push(`?${params.toString()}`);
  };

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-[1600px] px-4 sm:px-6">
        <div className="flex h-20 items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center gap-6">
            <Image
              src="/images/UN Logo_Horizontal_English/Colour/UN Logo_Horizontal_Colour_English.svg"
              alt="UN Logo"
              width={160}
              height={32}
              className="h-8 w-auto"
            />
            <h1 className="text-2xl font-light tracking-wide text-gray-800">
              UN80 Transcripts
            </h1>
          </div>

          {/* View Switcher */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setView("timeline")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                currentView === "timeline"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setView("outline")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                currentView === "outline"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Outline
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
