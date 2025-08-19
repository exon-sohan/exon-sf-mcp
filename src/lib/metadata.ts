import os from 'node:os';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { executeSfCommand } from "./sf-command.js";

// This is the function you need to replace
export function registerMetadataTools(server: McpServer) {
    /**
     * @description Creates a custom object and its fields in Salesforce.
     */
    server.tool(
        "create_custom_object",
        "Creates a custom object and its associated fields in a Salesforce org.", {
        input: z.object({
            targetOrg: z.string().describe("Target Salesforce Org alias or username."),
            objectName: z.string().describe("API Name of the custom object, without __c (e.g., 'Property')."),
            label: z.string().describe("Singular label for the custom object."),
            pluralLabel: z.string().describe("Plural label for the custom object."),
            description: z.string().optional().describe("Description of the custom object."),
            apiVersion: z.string().default("59.0").describe("API version for the deployment."),
            fields: z.array(z.object({
                fullName: z.string().describe("API name of the field, ending with __c (e.g., 'Property_ID__c')."),
                label: z.string().describe("User-friendly label for the field."),
                type: z.enum([
                    "Text", "Number", "Percent", "Phone", "Email", "URL", "Date", "DateTime",
                    "Currency", "Picklist", "MultiselectPicklist", "Checkbox", "TextArea", "LongTextArea"
                ]).describe("Data type of the field."),
                description: z.string().optional().describe("Description for the field."),
                required: z.boolean().default(false).describe("Whether the field is required."),
                unique: z.boolean().default(false).describe("Whether the field value must be unique."),
                externalId: z.boolean().default(false).describe("Whether the field is an external ID."),
                length: z.number().optional().describe("Length for text-based fields (e.g., Text, URL)."),
                precision: z.number().optional().describe("Total number of digits for Number/Currency/Percent fields."),
                scale: z.number().optional().describe("Number of decimal places for Number/Currency/Percent fields."),
                picklistValues: z.array(z.string()).optional().describe("Array of values for a Picklist or MultiselectPicklist.")
            })).optional().describe("An array of custom fields to create on the object."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, objectName, label, pluralLabel, description, apiVersion, fields } = input;
        
        const objectApiName = `${objectName}__c`;
        const tempDir = path.join(os.tmpdir(), `sf_mcp_${Date.now()}`);
        const sourcePath = path.join(tempDir, 'main', 'default');
        const objectDirPath = path.join(sourcePath, 'objects', objectApiName);
        await fs.mkdir(objectDirPath, { recursive: true });

        // --- FIX 1: Create a minimal sfdx-project.json file to provide project context ---
        const projectConfigPath = path.join(tempDir, 'sfdx-project.json');
        const projectConfigContent = JSON.stringify({
            "packageDirectories": [
                {
                    "path": "main/default", // This path must match your source directory
                    "default": true
                }
            ],
            "namespace": "",
            "sfdcLoginUrl": "https://login.salesforce.com",
            "sourceApiVersion": apiVersion
        }, null, 2);
        await fs.writeFile(projectConfigPath, projectConfigContent);


        // --- 1. Generate XML for Custom Fields ---
        let fieldsXml = '';
        if (fields && fields.length > 0) {
            fieldsXml = fields.map(field => {
                let fieldMeta = `    <fields>
        <fullName>${field.fullName}</fullName>
        <label>${field.label}</label>
        <type>${field.type}</type>
        ${field.description ? `<description>${field.description}</description>` : ''}
        ${field.required ? `<required>${field.required}</required>` : ''}
        ${field.unique ? `<unique>${field.unique}</unique>` : ''}
        ${field.externalId ? `<externalId>${field.externalId}</externalId>` : ''}
        ${field.length ? `<length>${field.length}</length>` : ''}
        ${field.precision ? `<precision>${field.precision}</precision>` : ''}
        ${field.scale ? `<scale>${field.scale}</scale>` : ''}
        <trackHistory>false</trackHistory>
        <trackTrending>false</trackTrending>`;

                if (field.type === 'LongTextArea') {
                     fieldMeta += `
        <visibleLines>3</visibleLines>`;
                }

                if ((field.type === 'Picklist' || field.type === 'MultiselectPicklist') && field.picklistValues) {
                     fieldMeta += `
        <valueSet>
            <restricted>true</restricted>
            <valueSetDefinition>
                <sorted>false</sorted>
                ${field.picklistValues.map(val => `
                <value>
                    <fullName>${val}</fullName>
                    <default>false</default>
                    <label>${val}</label>
                </value>`).join('')}
            </valueSetDefinition>
        </valueSet>`;
                     if(field.type === 'MultiselectPicklist') {
                        fieldMeta += `
        <visibleLines>4</visibleLines>`;
                     }
                }

                fieldMeta += `
    </fields>`;
                return fieldMeta;
            }).join('\n');
        }

        // --- 2. Generate the main Object XML with fields included ---
        const objectPath = path.join(objectDirPath, `${objectApiName}.object-meta.xml`);
        const objectContent = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>${label}</label>
    <pluralLabel>${pluralLabel}</pluralLabel>
    <description>${'**Generated by sf-mcp**' + ' ' + (description || '')}</description>
    <deploymentStatus>Deployed</deploymentStatus>
    <sharingModel>ReadWrite</sharingModel>
    <enableActivities>true</enableActivities>
    <enableHistory>true</enableHistory>
    <enableReports>true</enableReports>
    <nameField>
        <label>${label} Name</label>
        <type>Text</type>
        <trackHistory>false</trackHistory>
    </nameField>
${fieldsXml}
</CustomObject>`;
        await fs.writeFile(objectPath, objectContent);

        // --- 3. Generate the package.xml including all fields ---
        const packageXmlPath = path.join(sourcePath, 'package.xml');
        const customFieldMembers = fields && fields.length > 0
            ? fields.map(field => `    <members>${objectApiName}.${field.fullName}</members>`).join('\n')
            : '';
            
        const packageXmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${objectApiName}</members>
        <name>CustomObject</name>
    </types>
${fields && fields.length > 0 ? `    <types>
${customFieldMembers}
        <name>CustomField</name>
    </types>` : ''}
    <version>${apiVersion}</version>
</Package>`;
        await fs.writeFile(packageXmlPath, packageXmlContent);

        // --- FIX 2: Construct a command that first changes directory, then deploys ---
        // This ensures the sf command runs from within the temporary project context.
        const sfCommand = `cd "${tempDir}" && sf project deploy start --source-dir "main/default" --target-org ${targetOrg} --json`;

        try {
            // Execute the command with a single argument, as expected.
            const result = await executeSfCommand(sfCommand);
            const status = result.status === 0 ? 'succeeded' : 'failed';
            return {
                content: [{
                type: "text",
                text: `Custom object '${objectApiName}' creation ${status}.\n${JSON.stringify(result, null, 2)}`
                }],
            };
        } finally {
            // Clean up the temporary directory
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    }
    );

    /**
     * @description Deploys source code to Salesforce org.
     */
    server.tool(
    "deploy_source",
    "Deploys source code from local directory to Salesforce org.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        sourceDir: z.string().describe("Source directory to deploy."),
        checkOnly: z.boolean().default(false).describe("Perform validation deploy only (check-only)."),
        testLevel: z.enum(["NoTestRun", "RunLocalTests", "RunAllTestsInOrg", "RunSpecifiedTests"]).default("RunLocalTests").describe("Test level for deployment."),
        ignoreWarnings: z.boolean().default(false).describe("Ignore warnings during deployment."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, sourceDir, checkOnly, testLevel, ignoreWarnings } = input;
        
        let sfCommand = `sf project deploy start --source-dir "${sourceDir}" --target-org ${targetOrg} --test-level ${testLevel} --json`;
        
        if (checkOnly) {
        sfCommand += " --dry-run";
        }
        
        if (ignoreWarnings) {
        sfCommand += " --ignore-warnings";
        }

        const result = await executeSfCommand(sfCommand);
        return {
        content: [{
            type: "text",
            text: `Deployment ${checkOnly ? '(validation)' : ''} completed.\n${JSON.stringify(result, null, 2)}`
        }],
        };
    }
    );

    /**
     * @description Retrieves source code from Salesforce org.
     */
    server.tool(
    "retrieve_source",
    "Retrieves source code from Salesforce org.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        metadata: z.array(z.string()).describe("Metadata types to retrieve (e.g., ['ApexClass', 'LightningComponentBundle'])."),
        targetDir: z.string().optional().describe("Target directory for retrieved source."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, metadata, targetDir } = input;
        
        let sfCommand = `sf project retrieve start --target-org ${targetOrg} --metadata ${metadata.join(',')} --json`;
        
        if (targetDir) {
        sfCommand += ` --target-dir "${targetDir}"`;
        }

        const result = await executeSfCommand(sfCommand);
        return {
        content: [{
            type: "text",
            text: `Source retrieval completed.\n${JSON.stringify(result, null, 2)}`
        }],
        };
    }
    );

    /**
     * @description Describes a Salesforce object and its fields.
     */
    server.tool(
    "describe_object",
    "Describes a Salesforce object and its fields.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        objectName: z.string().describe("Name of the object to describe."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, objectName } = input;
        
        const sfCommand = `sf sobject describe --sobject ${objectName} --target-org ${targetOrg} --json`;
        const result = await executeSfCommand(sfCommand);
        
        return {
        content: [{
            type: "text",
            text: `Object Description for '${objectName}':\n${JSON.stringify(result, null, 2)}`
        }],
        };
    }
    );
}
