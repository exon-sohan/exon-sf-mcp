import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { executeSfCommand } from "./sf-command.js";

export function registerDataTools(server: McpServer) {

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
}
