import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerApexTools } from "./lib/apex.js";
import { registerDataTools } from "./lib/data.js";
import { registerLwcTools } from "./lib/lwc.js";
import { registerMetadataTools } from "./lib/metadata.js";
import { registerOrgTools } from "./lib/org.js";
import { registerVscodeTools } from "./lib/vscode.js";
import { registerManifestTools } from "./lib/manifest.js"; 

const server = new McpServer({
  name: "sf-mcp-server",
  version: "2.0.0",
  capabilities: {
    tools: {},
  },
});

registerApexTools(server);
registerDataTools(server);
registerMetadataTools(server);
registerOrgTools(server);
registerVscodeTools(server);
registerManifestTools(server); 

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Enhanced Salesforce MCP Server v2.0.0 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});