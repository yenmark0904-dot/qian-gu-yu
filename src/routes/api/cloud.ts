import { createFileRoute } from "@tanstack/react-router";
import { handleCloudGet, handleCloudPost } from "@/game/cloud-api.server";

/** 雲端存檔 (Google 帳號綁定) — see src/game/cloud-api.server.ts. */
export const Route = createFileRoute("/api/cloud")({
  server: {
    handlers: {
      GET: ({ request }) => handleCloudGet(request),
      POST: ({ request }) => handleCloudPost(request),
    },
  },
});
