import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSfCommand } from "./sf-command.js";

export function registerVscodeTools(server: McpServer) {
    /**
     * @description Opens the current directory in VS Code.
     * @returns a Promise that resolves when VS Code is opened.
     */
    server.tool(
    "open_vscode",
    "Opens the current directory in VS Code using 'code .' command.",
    {},
    async () => {
        try {
        await executeSfCommand("code .");
        return {
            content: [{
            type: "text",
            text: "Successfully opened current directory in VS Code"
            }],
        };
        } catch (error : any) {
        return {
            content: [{
            type: "text",
            text: `Error opening VS Code: ${error.message}`
            }],
        };
        }
    }
    );
}
