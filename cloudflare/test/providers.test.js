import test from "node:test";
import assert from "node:assert/strict";
import { CLOUD_PROVIDERS, PROVIDERS, getProvider, publicProvider } from "../src/providers.js";

test("manifest exposes the eight cloud providers", () => {
  assert.deepEqual(
    CLOUD_PROVIDERS.map((provider) => provider.key),
    ["gemini", "chatgpt", "claude", "qwen", "kimi", "minimax", "mimo", "deepseek"]
  );
});

test("all cloud providers have the generic runner fields", () => {
  for (const provider of CLOUD_PROVIDERS) {
    assert.ok(provider.url, provider.key + " url");
    assert.ok(Array.isArray(provider.hosts) && provider.hosts.length, provider.key + " hosts");
    assert.ok(Array.isArray(provider.editorSelectors) && provider.editorSelectors.length, provider.key + " editor selectors");
    assert.ok(Array.isArray(provider.responseSelectors) && provider.responseSelectors.length, provider.key + " response selectors");
    assert.ok(Number.isFinite(provider.timeoutMs), provider.key + " timeout");
    assert.ok(Number.isFinite(provider.stabilityMs), provider.key + " stability");
  }
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
