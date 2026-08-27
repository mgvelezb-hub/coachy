import { describe, expect, it } from "vitest";

import { bearerToken } from "@/lib/api/auth";

function requestWithHeader(header: string | null): Request {
  const headers = new Headers();
  if (header !== null) headers.set("authorization", header);
  return new Request("https://coachy.test/api/v1/me", { headers });
}

describe("bearerToken", () => {
  it("extrae el JWT de un header Bearer válido", () => {
    expect(bearerToken(requestWithHeader("Bearer eyJabc.def.ghi"))).toBe("eyJabc.def.ghi");
  });

  it("devuelve null si no hay header authorization", () => {
    expect(bearerToken(requestWithHeader(null))).toBeNull();
  });

  it("devuelve null con un header malformado", () => {
    expect(bearerToken(requestWithHeader("Token abc123"))).toBeNull();
    expect(bearerToken(requestWithHeader("Bearer"))).toBeNull();
    expect(bearerToken(requestWithHeader(""))).toBeNull();
  });

  it("es insensible a mayúsculas en la palabra Bearer", () => {
    expect(bearerToken(requestWithHeader("bearer eyJabc.def.ghi"))).toBe("eyJabc.def.ghi");
    expect(bearerToken(requestWithHeader("BEARER eyJabc.def.ghi"))).toBe("eyJabc.def.ghi");
  });
});
