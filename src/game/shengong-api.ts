import { createServerFn } from "@tanstack/react-start";

/** 深宮 server functions; validation, anti-cheat and storage live in shengong.server.ts. */
export const sgBoard = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => (await import("./shengong.server")).boardServer(data));

export const sgSubmit = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => (await import("./shengong.server")).submitServer(data));

export const sgNickname = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => (await import("./shengong.server")).nicknameServer(data));

export const sgForget = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => (await import("./shengong.server")).forgetServer(data));
