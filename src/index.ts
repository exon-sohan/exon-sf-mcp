import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new McpServer({
    name: "sf-mcp-server",
    version: "1.1.0",
    capabilities: {
        tools: {},
    },
});

/**
 * @param command The Salesforce CLI command to execute.
 * @description Executes a Salesforce CLI command and returns the result.
 * @returns a Promise that resolves with the parsed JSON result or an error message.
 * @throws {Error} If the command execution fails or if parsing the output fails.
 */
const executeSfCommand = (command: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                try {
                    const sfError = JSON.parse(stderr);
                    return reject(new Error(sfError.message || stderr));
                } catch (e) {
                    return reject(error);
                }
            }
            if (stderr && !stdout) {
                 try {
                    const sfError = JSON.parse(stderr);
                    return reject(new Error(sfError.message || stderr));
                } catch (e) {
                    return reject(new Error(stderr));
                }
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            } catch (parseError) {
                resolve({ message: stdout.trim() });
            }
        });
    });
};



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
 * @description Retrieves the details of a specific Salesforce org.
 * @param targetOrg The alias or username of the Salesforce org to retrieve details for.
 * @returns a Promise that resolves with the org details.
 * @throws {Error} If the org does not exist or if an error occurs during retrieval.
 */
server.tool(
    "query_records",
    "Execute a SOQL query in Salesforce Org (Read operation).", {
        input: z.object({
            targetOrg: z.string().describe("Target Salesforce Org alias or username to execute the query against"),
            sObject: z.string().describe("Salesforce SObject API Name to query from"),
            fields: z.string().describe("Comma-separated list of fields to retrieve"),
            where: z.string().optional().describe("Optional WHERE clause for the query (e.g., \"Name = 'Test Corp'\")"),
            orderBy: z.string().optional().describe("Optional ORDER BY clause for the query (e.g., \"CreatedDate DESC\")"),
            limit: z.number().optional().describe("Optional limit for the number of records returned"),
        }),
    },
    async ({ input }) => {
        const { targetOrg, sObject, fields, where, orderBy, limit } = input;

        let query = `SELECT ${fields} FROM ${sObject}`;
        if (where) query += ` WHERE ${where}`;
        if (orderBy) query += ` ORDER BY ${orderBy}`;
        if (limit) query += ` LIMIT ${limit}`;

        const sfCommand = `sf data query --target-org ${targetOrg} --query "${query}" --json`;
        const result = await executeSfCommand(sfCommand);

        return {
            content: [{
                type: "text",
                text: JSON.stringify(result.result.records, null, 2)
            }],
        };
    }
);


/**
 * @description Creates a new record in Salesforce for a given SObject.
 * @param targetOrg The alias or username of the Salesforce org to create the record in.
 * @param sObject The API name of the SObject to create a record for (e
 * @param values A string of key-value pairs for the record's fields (e.g., "Name='New Account' Phone='(555) 555-1234'").
 * @returns a Promise that resolves with the created record's details.
 * @throws {Error} If the record creation fails or if parsing the output fails.
 */
server.tool(
    "create_record",
    "Create a new record for a given SObject in Salesforce (Create operation).", {
        input: z.object({
            targetOrg: z.string().describe("Target Salesforce Org alias or username."),
            sObject: z.string().describe("API name of the SObject to create a record for (e.g., Account, Contact)."),
            values: z.string().describe("A string of key-value pairs for the record's fields. e.g., \"Name='New Account' Phone='(555) 555-1234'\""),
        }),
    },
    async ({ input }) => {
        const { targetOrg, sObject, values } = input;
        const sfCommand = `sf data create record --sobject ${sObject} --values "${values}" --target-org ${targetOrg} --json`;
        const result = await executeSfCommand(sfCommand);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
);



/** 
 * @description Updates an existing record in Salesforce for a given SObject.
 * @param targetOrg The alias or username of the Salesforce org to update the record in.
 * @param sObject The API name of the SObject to update a record for (e.g., Account, Contact).
 * @param recordId The 15 or 18-character ID of the record to update.
 * @param values A string of key-value pairs for the fields to update (e.g., "Name='Updated Name' Description='New details.'").
 * @returns a Promise that resolves with the updated record's details.
 * @throws {Error} If the record update fails or if parsing the output fails.
 */
server.tool(
    "update_record",
    "Update an existing record in Salesforce (Update operation).", {
        input: z.object({
            targetOrg: z.string().describe("Target Salesforce Org alias or username."),
            sObject: z.string().describe("API name of the SObject to update."),
            recordId: z.string().describe("The 15 or 18-character ID of the record to update."),
            values: z.string().describe("A string of key-value pairs for the fields to update. e.g., \"Name='Updated Name' Description='New details.'\""),
        }),
    },
    async ({ input }) => {
        const { targetOrg, sObject, recordId, values } = input;
        const sfCommand = `sf data update record --sobject ${sObject} --record-id ${recordId} --values "${values}" --target-org ${targetOrg} --json`;
        const result = await executeSfCommand(sfCommand);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
);


/**
 * @description Deletes a record from Salesforce for a given SObject.
 * @param targetOrg The alias or username of the Salesforce org to delete the record from.
 * @param sObject The API name of the SObject to delete a record for (e.g., Account, Contact).
 * @param recordId The 15 or 18-character ID of the record to delete.
 * @returns a Promise that resolves with the result of the deletion operation.
 * @throws {Error} If the record deletion fails or if parsing the output fails.
 */
server.tool(
    "delete_record",
    "Delete a record from Salesforce (Delete operation).", {
        input: z.object({
            targetOrg: z.string().describe("Target Salesforce Org alias or username."),
            sObject: z.string().describe("API name of the SObject to delete from."),
            recordId: z.string().describe("The 15 or 18-character ID of the record to delete."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, sObject, recordId } = input;
        const sfCommand = `sf data delete record --sobject ${sObject} --record-id ${recordId} --target-org ${targetOrg} --json --no-prompt`;
        const result = await executeSfCommand(sfCommand);
        return {
            content: [{
                type: "text",
                text: JSON.stringify(result, null, 2)
            }],
        };
    }
);



/** * @description Creates and deploys a new Apex class to a Salesforce org.
 * @param targetOrg The alias or username of the Salesforce org to deploy the class to.
 * @param className The name of the Apex class to create (e.g., 'MyNewController').
 * @param apiVersion The API version for the class metadata (default is '59.0').
 * @param classContent The full string content of the Apex class code.
 * @returns a Promise that resolves with the deployment result.
 * @throws {Error} If the deployment fails or if parsing the output fails.
 */
server.tool(
    "create_apex_class",
    "Creates and deploys a new Apex class to a Salesforce org.", {
        input: z.object({
            targetOrg: z.string().describe("Target Salesforce Org alias or username."),
            className: z.string().describe("The name of the Apex class to create (e.g., 'MyNewController')."),
            apiVersion: z.string().default("59.0").describe("The API version for the class metadata."),
            classContent: z.string().describe("The full string content of the Apex class code."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, className, apiVersion, classContent } = input;

        const tempDir = path.join(__dirname, 'temp_deploy');
        const classesDir = path.join(tempDir, 'classes');
        await fs.mkdir(classesDir, { recursive: true });

        const classPath = path.join(classesDir, `${className}.cls`);
        const metaPath = path.join(classesDir, `${className}.cls-meta.xml`);

        const metaContent = `<?xml version="1.0" encoding="UTF-8"?>
                                <ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">
                                    <apiVersion>${apiVersion}</apiVersion>
                                    <status>Active</status>
                                </ApexClass>`;

        await fs.writeFile(classPath, classContent);
        await fs.writeFile(metaPath, metaContent);

        const sfCommand = `sf project deploy start --source-dir "${tempDir}" --target-org ${targetOrg} --json`;

        try {
            const result = await executeSfCommand(sfCommand);
            return {
                content: [{
                    type: "text",
                    text: `Successfully deployed Apex class '${className}'.\n${JSON.stringify(result, null, 2)}`
                }],
            };
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    }
);

/** * @description Executes a block of anonymous Apex code in a Salesforce org.
 * @param targetOrg The alias or username of the Salesforce org to execute the code in.
 * @param apexCode The Apex code to execute. Do not include 'execute-anonymous' block wrappers.
 * @returns a Promise that resolves with the execution result.
 * @throws {Error} If the execution fails or if parsing the output fails.
 */
server.tool(
    "execute_anonymous_apex",
    "Executes a block of anonymous Apex code in a Salesforce org.", {
        input: z.object({
            targetOrg: z.string().describe("Target Salesforce Org alias or username."),
            apexCode: z.string().describe("The Apex code to execute. Do not include 'execute-anonymous' block wrappers."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, apexCode } = input;
        const tempFilePath = path.join(__dirname, 'temp_apex_to_run.apex');
        await fs.writeFile(tempFilePath, apexCode);

        const sfCommand = `sf apex run --file "${tempFilePath}" --target-org ${targetOrg} --json`;

        try {
            const result = await executeSfCommand(sfCommand);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }],
            };
        } finally {
            await fs.unlink(tempFilePath);
        }
    }
);



async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Salesforce Extended MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});