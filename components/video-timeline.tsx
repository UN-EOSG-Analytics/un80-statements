"use client";

import { Video } from "@/lib/un-api";
import { useMemo } from "react";

// Apply UN Web TV's timezone workaround
function parseUNTimestamp(timestamp: string): Date {
  const dateTimeWithoutTz = timestamp.slice(0, 19);
  return new Date(dateTimeWithoutTz + "Z");
}

interface SessionDetails {
  date: string; // Format: "YYYY-MM-DD" or "Day DD Month YYYY"
  timeRange?: string; // e.g., "1000-1130"
  location?: string; // e.g., "ECOSOC chamber"
  description?: string;
}

// Session details mapping - add your meeting information here
const SESSION_DETAILS: Record<string, SessionDetails> = {
  "2025-09-16": {
    date: "Tuesday 16 September",
    timeRange: undefined,
    location: undefined,
    description: "First meeting of the working group",
  },
  // Discovery phase (October-December 2025)
  "2025-10-13": {
    date: "Monday 13 October",
    timeRange: "1000-1130",
    location: "ECOSOC chamber",
    description:
      '"Mandate Creation" briefing - Panel followed by questions from members of the working group',
  },
  "2025-10-23": {
    date: "Thursday 23 October",
    timeRange: "1000-1300",
    location: "ECOSOC Chamber",
    description:
      '"Mandate Creation" consultations - Statements from members of the working group',
  },
  "2025-10-30": {
    date: "Thursday 30 October",
    timeRange: "1500-1630",
    location: "ECOSOC Chamber",
    description:
      '"Mandate Implementation" briefing - Panel followed by questions from members of the working group',
  },
  "2025-11-14": {
    date: "Friday 14 November",
    timeRange: "1000-1300",
    location: "ECOSOC Chamber",
    description:
      '"Mandate Implementation" consultations - Statements from members of the working group',
  },
  "2025-11-25": {
    date: "Tuesday 25 November",
    timeRange: "1000-1130",
    location: "CR-1",
    description:
      '"Mandate Review" briefing - Panel followed by questions from members of the working group',
  },
  "2025-12-03": {
    date: "Wednesday 3 December",
    timeRange: "1000-1300",
    location: "CR4",
    description:
      '"Mandate Review" consultations - Statements from members of the working group',
  },
  // Production phase (January-March 2026)
  "2026-01-05": {
    date: "5 January",
    timeRange: undefined,
    location: undefined,
    description: "Updated program of work provided to the IAHWG",
  },
  "2026-03-31": {
    date: "31 March",
    timeRange: undefined,
    location: undefined,
    description: "Final outcome",
  },
};

interface TimelineEvent {
  video: Video;
  date: Date;
  isIAHWG: boolean;
  sessionDetails?: SessionDetails;
}

export function VideoTimeline({ videos }: { videos: Video[] }) {
  const events = useMemo(() => {
    // Parse and sort videos by date (newest first)
    const parsedEvents: TimelineEvent[] = videos
      .filter((video) => {
        const title = video.cleanTitle?.toLowerCase() || "";
        // Filter out Daily Press Briefings
        return !title.includes("daily press briefing");
      })
      .map((video) => {
        const date = video.scheduledTime
          ? parseUNTimestamp(video.scheduledTime)
          : new Date(video.date);
        const title = video.cleanTitle?.toLowerCase() || "";
        // Check if it's an IAHWG session
        const isIAHWG =
          title.includes("iahwg") ||
          title.includes("informal ad hoc working group");

        // Look up session details by date (YYYY-MM-DD format)
        const dateKey = date.toISOString().split("T")[0];
        const sessionDetails = SESSION_DETAILS[dateKey];

        return { video, date, isIAHWG, sessionDetails };
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime()); // Descending order (newest first)

    return parsedEvents;
  }, [videos]);

  if (events.length === 0) {
    return (
      <div className="text-gray-500 py-12">No UN80 initiative videos found</div>
    );
  }

  return (
    <div className="py-4">
      {/* Legend */}
      <div className="mb-8 flex items-center gap-6 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-un-blue"></div>
          <span>IAHWG Sessions</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-400"></div>
          <span>Other Sessions</span>
        </div>
      </div>

      {/* Timeline - left aligned with vertical line */}
      <div className="relative">
        {/* Vertical line - positioned absolutely from top */}
        {events.length > 1 && (
          <div
            className="absolute left-[5px] w-0.5 bg-gray-200"
            style={{
              top: "12px",
              bottom: "2rem",
            }}
          />
        )}

        {/* Events */}
        <div className="space-y-6 pl-8">
          {events.map((event) => (
            <div key={event.video.id} className="relative">
              {/* Colored dot */}
              <div
                className={`absolute left-[-32px] top-[6px] w-3 h-3 rounded-full ${
                  event.isIAHWG ? "bg-un-blue" : "bg-gray-400"
                }`}
              ></div>

              {/* Content */}
              <div className="pb-2">
                {/* Date */}
                <div className="text-xs text-gray-500 mb-1">
                  {event.date.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  {event.date.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })}
                  ‰
                </div>

                {/* Title */}
                <a
                  href={`/video/${encodeURIComponent(event.video.id)}`}
                  className="block text-sm font-medium text-gray-800 hover:text-un-blue transition-colors"
                >
                  {event.video.cleanTitle}
                </a>

                {/* Additional Session Details */}
                {event.sessionDetails && (
                  <div className="mt-2 text-xs space-y-1">
                    {event.sessionDetails.timeRange && (
                      <div className="text-gray-600">
                        {event.sessionDetails.timeRange}
                      </div>
                    )}
                    {event.sessionDetails.location && (
                      <div className="text-gray-600">
                        {event.sessionDetails.location}
                      </div>
                    )}
                    {event.sessionDetails.description && (
                      <div className="text-gray-700 italic">
                        {event.sessionDetails.description}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
