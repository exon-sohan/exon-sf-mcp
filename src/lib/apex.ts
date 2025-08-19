import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeSfCommand } from "./sf-command.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function registerApexTools(server: McpServer) {
    /**
     * @description Creates and deploys a new Apex class to a Salesforce org.
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
<ApexClass xmlns=\"http://soap.sforce.com/2006/04/metadata\">
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

    /**
     * @description Views/retrieves an existing Apex class from Salesforce org.
     */
    server.tool(
    "view_apex_class",
    "Retrieves and displays an existing Apex class from Salesforce org.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        className: z.string().describe("Name of the Apex class to retrieve."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, className } = input;
        
        const sfCommand = `sf data query --target-org ${targetOrg} --query "SELECT Body FROM ApexClass WHERE Name='${className}'" --json`;
        
        try {
        const result = await executeSfCommand(sfCommand);
        const classBody = result.result.records[0]?.Body || "Class not found";
        
        return {
            content: [{
            type: "text",
            text: `Apex Class '${className}':\n\n${classBody}`
            }],
        };
        } catch (error : any) {
        return {
            content: [{
            type: "text",
            text: `Error retrieving class '${className}': ${error.message}`
            }],
        };
        }
    }
    );

    /**
     * @description Updates an existing Apex class.
     */
    server.tool(
    "update_apex_class",
    "Updates an existing Apex class in Salesforce org.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        className: z.string().describe("Name of the Apex class to update."),
        classContent: z.string().describe("Updated content of the Apex class."),
        apiVersion: z.string().default("59.0").describe("API version."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, className, classContent, apiVersion } = input;

        const tempDir = path.join(__dirname, 'temp_update');
        const classesDir = path.join(tempDir, 'classes');
        await fs.mkdir(classesDir, { recursive: true });

        const classPath = path.join(classesDir, `${className}.cls`);
        const metaPath = path.join(classesDir, `${className}.cls-meta.xml`);

        const metaContent = `<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns=\"http://soap.sforce.com/2006/04/metadata\">
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
            text: `Successfully updated Apex class '${className}'.\n${JSON.stringify(result, null, 2)}`
            }],
        };
        } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        }
    }
    );

    /**
     * @description Deletes an Apex class from Salesforce org.
     */
    server.tool(
    "delete_apex_class",
    "Deletes an Apex class from Salesforce org.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        className: z.string().describe("Name of the Apex class to delete."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, className } = input;
        
        const tempDir = path.join(__dirname, 'temp_delete');
        const destructiveDir = path.join(tempDir, 'destructiveChanges');
        await fs.mkdir(destructiveDir, { recursive: true });

        const destructiveChangesPath = path.join(tempDir, 'destructiveChanges.xml');
        const packagePath = path.join(tempDir, 'package.xml');

        const destructiveContent = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns=\"http://soap.sforce.com/2006/04/metadata\">
    <types>
        <members>${className}</members>
        <name>ApexClass</name>
    </types>
    <version>59.0</version>
</Package>`;

        const packageContent = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns=\"http://soap.sforce.com/2006/04/metadata\">
    <version>59.0</version>
</Package>`;

        await fs.writeFile(destructiveChangesPath, destructiveContent);
        await fs.writeFile(packagePath, packageContent);

        const sfCommand = `sf project deploy start --source-dir "${tempDir}" --target-org ${targetOrg} --json`;

        try {
        const result = await executeSfCommand(sfCommand);
        return {
            content: [{
            type: "text",
            text: `Successfully deleted Apex class '${className}'.\n${JSON.stringify(result, null, 2)}`
            }],
        };
        } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        }
    }
    );

    /**
     * @description Creates a test class for an existing Apex class.
     */
    server.tool(
    "create_test_class",
    "Creates a test class for an existing Apex class.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        className: z.string().describe("Name of the class to create tests for."),
        testClassName: z.string().optional().describe("Name of the test class (defaults to {className}Test)."),
        apiVersion: z.string().default("59.0").describe("API version."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, className, apiVersion } = input;
        const testClassName = input.testClassName || `${className}Test`;

        const testClassContent = `@isTest
public class ${testClassName} {
    
    @TestSetup
    static void setupTestData() {
        // Setup test data here
    }
    
    @isTest
    static void test${className}Method1() {
        Test.startTest();
        
        // TODO: Add test logic for ${className}
        // ${className} instance = new ${className}();
        // Add assertions here
        // System.assertNotNull(instance);
        
        Test.stopTest();
    }
    
    @isTest
    static void test${className}Method2() {
        Test.startTest();
        
        // TODO: Add more test methods as needed
        
        Test.stopTest();
    }
    
    @isTest
    static void test${className}Exception() {
        Test.startTest();
        
        // TODO: Test exception scenarios
        
        Test.stopTest();
    }
}`;

        const tempDir = path.join(__dirname, 'temp_test_deploy');
        const classesDir = path.join(tempDir, 'classes');
        await fs.mkdir(classesDir, { recursive: true });

        const classPath = path.join(classesDir, `${testClassName}.cls`);
        const metaPath = path.join(classesDir, `${testClassName}.cls-meta.xml`);

        const metaContent = `<?xml version="1.0" encoding="UTF-8"?>
<ApexClass xmlns=\"http://soap.sforce.com/2006/04/metadata\">
    <apiVersion>${apiVersion}</apiVersion>
    <status>Active</status>
</ApexClass>`;

        await fs.writeFile(classPath, testClassContent);
        await fs.writeFile(metaPath, metaContent);

        const sfCommand = `sf project deploy start --source-dir "${tempDir}" --target-org ${targetOrg} --json`;

        try {
        const result = await executeSfCommand(sfCommand);
        return {
            content: [{
            type: "text",
            text: `Successfully created test class '${testClassName}' for '${className}'.\n${JSON.stringify(result, null, 2)}`
            }],
        };
        } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
        }
    }
    );

    /**
     * @description Runs Apex tests in the org.
     */
    server.tool(
    "run_apex_tests",
    "Runs Apex tests in the Salesforce org.", {
        input: z.object({
        targetOrg: z.string().describe("Target Salesforce Org alias or username."),
        testClasses: z.array(z.string()).optional().describe("Specific test classes to run (optional)."),
        testLevel: z.enum(["RunLocalTests", "RunAllTestsInOrg", "RunSpecifiedTests"]).default("RunLocalTests").describe("Test level to run."),
        }),
    },
    async ({ input }) => {
        const { targetOrg, testClasses, testLevel } = input;
        
        let sfCommand = `sf apex run test --target-org ${targetOrg} --test-level ${testLevel} --json`;
        
        if (testLevel === "RunSpecifiedTests" && testClasses && testClasses.length > 0) {
        sfCommand += ` --class-names ${testClasses.join(',')}`;
        }

        const result = await executeSfCommand(sfCommand);
        return {
        content: [{
            type: "text",
            text: `Test execution completed.\n${JSON.stringify(result, null, 2)}`
        }],
        };
    }
    );

    /**
     * @description Executes a block of anonymous Apex code in a Salesforce org.
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
}
