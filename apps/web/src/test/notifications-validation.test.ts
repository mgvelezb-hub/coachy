import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { markNotificationsReadSchema } from "@/lib/validation/notifications";

describe("markNotificationsReadSchema", () => {
  it("acepta uno o varios UUID", () => {
    const result = markNotificationsReadSchema.safeParse({ ids: [randomUUID(), randomUUID()] });
    expect(result.success).toBe(true);
  });

  it("rechaza una lista vacía", () => {
    expect(markNotificationsReadSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("rechaza más de 50 ids", () => {
    const ids = Array.from({ length: 51 }, () => randomUUID());
    expect(markNotificationsReadSchema.safeParse({ ids }).success).toBe(false);
  });

  it("acepta exactamente 50 ids", () => {
    const ids = Array.from({ length: 50 }, () => randomUUID());
    expect(markNotificationsReadSchema.safeParse({ ids }).success).toBe(true);
  });

  it("rechaza un id que no es UUID", () => {
    expect(markNotificationsReadSchema.safeParse({ ids: ["no-es-un-uuid"] }).success).toBe(false);
  });

  it("rechaza el campo faltante", () => {
    expect(markNotificationsReadSchema.safeParse({}).success).toBe(false);
  });
});
