import { createServerFn } from "@tanstack/react-start";

/** 玩家心聲 ♡ — anonymous POST; validation, limits and storage live in feedback.server.ts. */
export const submitFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const { submitFeedbackServer } = await import("./feedback.server");
    return submitFeedbackServer(data);
  });
