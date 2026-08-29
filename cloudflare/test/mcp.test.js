import test from "node:test";
import assert from "node:assert/strict";
import {
  MCP_PROTOCOL_VERSION,
  MCP_RESOURCE_MIME_TYPE,
  MCP_RESOURCE_URI,
  handleMcpRequest
} from "../src/mcp.js";

test("MCP resource is versioned and uses the Apps UI MIME type", () => {
  assert.match(MCP_RESOURCE_URI, /^ui:\/\/agentchat\/result\/v1\.html$/);
  assert.equal(MCP_RESOURCE_MIME_TYPE, "text/html;profile=mcp-app");
  assert.equal(typeof MCP_PROTOCOL_VERSION, "string");
});

test("MCP initialize and tools/list are available behind the MCP token", async () => {
  const env = { MCP_API_TOKEN: "test-token" };
  const makeRequest = (message) => new Request("https://agentchat.example/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/json"
    },
    body: JSON.stringify(message)
  });

  const initializeResponse = await handleMcpRequest(makeRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {}
  }), env);
  const initialize = await initializeResponse.json();
  assert.equal(initialize.result.serverInfo.name, "agentchat-cloud");
  assert.equal(initialize.result.protocolVersion, MCP_PROTOCOL_VERSION);

  const toolsResponse = await handleMcpRequest(makeRequest({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list"
  }), env);
  const tools = await toolsResponse.json();
  assert.deepEqual(
    tools.result.tools.map((tool) => tool.name),
    ["agentchat_list_providers", "agentchat_run", "agentchat_compare", "agentchat_open_login"]
  );
});
