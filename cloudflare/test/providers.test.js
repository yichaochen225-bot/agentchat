import test from "node:test";
import assert from "node:assert/strict";
import { CLOUD_PROVIDERS, PROVIDERS, getProvider, publicProvider } from "../src/providers.js";

test("manifest exposes the three cloud providers", () => {
  assert.deepEqual(
    CLOUD_PROVIDERS.map((provider) => provider.key),
    ["gemini", "claude", "deepseek"]
  );
});

test("getProvider rejects unknown keys", () => {
  assert.equal(getProvider("missing-provider"), null);
});

test("public provider data does not expose browser selectors", () => {
  const provider = publicProvider(PROVIDERS[0]);
  assert.deepEqual(Object.keys(provider).sort(), ["cloudEnabled", "key", "name", "phase"]);
  assert.equal(provider.key, "gemini");
  assert.equal(provider.cloudEnabled, true);
});

