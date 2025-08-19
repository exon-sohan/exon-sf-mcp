import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeSfCommand } from "./sf-command.js";

export function registerOrgTools(server: McpServer) {
    /**
     * @description Lists all Salesforce orgs the CLI is currently authenticated with.
     * @returns a Promise that resolves with an object containing the org list.
     */
    server.tool(
    "list_connected_salesforce_orgs",
    "Lists all Salesforce orgs the CLI is currently authenticated with.",
    {},
    async () => {
        const orgList = await executeSfCommand("sf org list --json");
        return {
        content: [{
            type: "text",
            text: JSON.stringify(orgList, null, 2)
        }],
        };
    }
    );

    /**
     * @description Gets org information and limits.
     */
    server.tool(
    "get_org_info",
    "Gets detailed information about the Salesforce org including limits.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        }),
    },
    async ({ input }) => {
        const { targetOrg } = input;
        
        const sfCommand = `sf org display --target-org ${targetOrg} --json`;
        const result = await executeSfCommand(sfCommand);
        
        return {
        content: [{
            type: "text",
            text: `Org Information:\n${JSON.stringify(result, null, 2)}`
        }],
        };
    }
    );

    /**
     * @description Gets org limits information.
     */
    server.tool(
    "get_org_limits",
    "Gets Salesforce org limits information.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        }),
    },
    async ({ input }) => {
        const { targetOrg } = input;
        
        const sfCommand = `sf data query --target-org ${targetOrg} --query "SELECT Id FROM Organization LIMIT 1" --json`;
        
        try {
        await executeSfCommand(sfCommand); // Test connection
        
        const limitsCommand = `sf apex run --target-org ${targetOrg} --file <(echo "System.debug(JSON.serialize(System.OrgLimits.getAll()));") --json`;
        const result = await executeSfCommand(limitsCommand);
        
        return {
            content: [{
            type: "text",
            text: `Org Limits:\n${JSON.stringify(result, null, 2)}`
            }],
        };
        } catch (error : any) {
        return {
            content: [{
            type: "text",
            text: `Error retrieving org limits: ${error.message}`
            }],
        };
        }
    }
    );
}
