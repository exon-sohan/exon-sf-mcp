import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { executeSfCommand } from "./sf-command.js";

export function registerLwcTools(server: McpServer) {
    /**
     * @description Creates a new Lightning Web Component.
     */
    server.tool(
    "create_lwc",
    "Creates a new Lightning Web Component with HTML, JS, and metadata files.", {
        input: z.object({
        lwcName: z.string().describe("Name of the LWC component (camelCase)"),
        targetDir: z.string().optional().describe("Target directory path (default: force-app/main/default/lwc)"),
        apiVersion: z.string().default("59.0").describe("API version"),
        isExposed: z.boolean().default(false).describe("Whether component is exposed for Lightning App Builder"),
        targets: z.array(z.string()).default(["lightning__RecordPage"]).describe("Targets for the component"),
        }),
    },
    async ({ input }) => {
        const { lwcName, targetDir = "force-app/main/default/lwc", apiVersion, isExposed, targets } = input;
        
        const sfCommand = `sf lightning generate component --name ${lwcName} --type lwc --output-dir ${targetDir} --api-version ${apiVersion} --json`;
        const result = await executeSfCommand(sfCommand);

        // Update metadata if component should be exposed
        if (isExposed) {
        const metaPath = path.join(targetDir, lwcName, `${lwcName}.js-meta.xml`);
        const metaContent = `<?xml version="1.0" encoding="UTF-8"?>
<LightningComponentBundle xmlns="http://soap.sforce.com/2006/04/metadata">
    <apiVersion>${apiVersion}</apiVersion>
    <isExposed>true</isExposed>
    <targets>
        ${targets.map(target => `<target>${target}</target>`).join('\n        ')}
    </targets>
</LightningComponentBundle>`;
        
        try {
            await fs.writeFile(metaPath, metaContent);
        } catch (error) {
            console.error("Error updating metadata:", error);
        }
        }

        return {
        content: [{
            type: "text",
            text: `LWC '${lwcName}' created successfully.\n${JSON.stringify(result, null, 2)}`
        }],
        };
    }
    );

    /**
     * @description Views/reads an existing LWC component files.
     */
    server.tool(
    "view_lwc",
    "Views the content of an existing Lightning Web Component files.", {
        input: z.object({
        lwcName: z.string().describe("Name of the LWC component"),
        targetDir: z.string().optional().describe("Target directory path (default: force-app/main/default/lwc)"),
        fileType: z.enum(["js", "html", "css", "xml", "all"]).default("all").describe("Which file to view"),
        }),
    },
    async ({ input }) => {
        const { lwcName, targetDir = "force-app/main/default/lwc", fileType } = input;
        const lwcDir = path.join(targetDir, lwcName);
        
        try {
            const files = await fs.readdir(lwcDir);
            let content = "";

            if (fileType === "all") {
                for (const file of files) {
                const filePath = path.join(lwcDir, file);
                const fileContent = await fs.readFile(filePath, 'utf-8');
                content += `\n=== ${file} ===\n${fileContent}\n`;
                }
            } else {
                const extensions = { js: ".js", html: ".html", css: ".css", xml: ".js-meta.xml" };
                const fileName = `${lwcName}${extensions[fileType]}`;
                const filePath = path.join(lwcDir, fileName);
                content = await fs.readFile(filePath, 'utf-8');
            }

            return {
                content: [{
                type: "text",
                text: `LWC '${lwcName}' content:\n${content}`
                }],
            };
        } catch (error : any) {
            return {
                content: [{
                type: "text",
                text: `Error reading LWC '${lwcName}': ${error.message}`
                }],
            };
        }
    }
    );

    /**
     * @description Updates an existing LWC component file.
     */
    server.tool(
    "update_lwc",
    "Updates an existing Lightning Web Component file.", {
        input: z.object({
        lwcName: z.string().describe("Name of the LWC component"),
        fileType: z.enum(["js", "html", "css", "xml"]).describe("Which file to update"),
        content: z.string().describe("New content for the file"),
        targetDir: z.string().optional().describe("Target directory path (default: force-app/main/default/lwc)"),
        }),
    },
    async ({ input }) => {
        const { lwcName, fileType, content, targetDir = "force-app/main/default/lwc" } = input;
        
        const extensions = { js: ".js", html: ".html", css: ".css", xml: ".js-meta.xml" };
        const fileName = `${lwcName}${extensions[fileType]}`;
        const filePath = path.join(targetDir, lwcName, fileName);
        
        try {
            await fs.writeFile(filePath, content);
            return {
                content: [{
                type: "text",
                text: `Successfully updated ${fileName} for LWC '${lwcName}'`
                }],
            };
        } catch (error : any) {
            return {
                content: [{
                type: "text",
                text: `Error updating LWC file: ${error.message}`
                }],
            };
        }
    }
    );

    /**
     * @description Deletes an LWC component.
     */
    server.tool(
    "delete_lwc",
    "Deletes an existing Lightning Web Component.", {
        input: z.object({
        lwcName: z.string().describe("Name of the LWC component to delete"),
        targetDir: z.string().optional().describe("Target directory path (default: force-app/main/default/lwc)"),
        }),
    },
    async ({ input }) => {
        const { lwcName, targetDir = "force-app/main/default/lwc" } = input;
        const lwcDir = path.join(targetDir, lwcName);
        
        try {
            await fs.rm(lwcDir, { recursive: true, force: true });
            return {
                content: [{
                type: "text",
                text: `Successfully deleted LWC '${lwcName}'`
                }],
            };
        } catch (error : any) {
            return {
                content: [{
                type: "text",
                text: `Error deleting LWC '${lwcName}': ${error.message}`
                }],
            };
        }
    }
    );
}
