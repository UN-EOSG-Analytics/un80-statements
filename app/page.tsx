import { VideoTimeline } from "@/components/video-timeline";
import { scheduleLookbackDays } from "@/lib/config";
import { getScheduleVideos } from "@/lib/un-api";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const allVideos = await getScheduleVideos(scheduleLookbackDays);

  // Filter videos to only show those including "UN80" (case-insensitive)
  const videos = allVideos.filter((video) =>
    video.cleanTitle?.toLowerCase().includes("un80"),
  );

  return (
    <main className="min-h-screen bg-background px-4 sm:px-6">
      <div className="mx-auto max-w-4xl py-8">
        <div className="mb-8 flex items-start justify-between">
          <Image
            src="/images/UN Logo_Stacked_English/Colour/UN Logo_Stacked_Colour_English.svg"
            alt="UN Logo"
            width={60}
            height={60}
            className="h-12 w-auto"
          />
          <Link href="/chat">
            <Button variant="outline" size="sm">
              <MessageSquare className="mr-2 h-4 w-4" />
              <span className="font-bold">UN80</span>Chat
            </Button>
          </Link>
        </div>

        <header className="mb-12">
          <h1 className="text-4xl text-gray-800">
            <span className="font-bold">UN80</span> Statements
          </h1>
          <div className="mt-1">
            <Link
              href="/topics"
              className="text-un-blue hover:text-un-blue/80 hover:underline"
            >
              View Actions & Proposals →
            </Link>
          </div>
        </header>

        <Suspense fallback={<div className="text-gray-500">Loading...</div>}>
          <VideoTimeline videos={videos} />
        </Suspense>
      </div>
    </main>
  );
}
