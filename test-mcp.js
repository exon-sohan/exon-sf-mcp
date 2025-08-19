import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

// Get current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to your MCP server (adjust as needed)
const serverPath = path.join(__dirname, "/build/index.js");

// Start the MCP server
const serverProcess = spawn("node", [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
});

// Handle server output
serverProcess.stdout.on("data", (data) => {
    console.log(`Server stdout: ${data}`);
});

serverProcess.stderr.on("data", (data) => {
    console.error(`Server stderr: ${data}`);
});

// Function to send a message to the server
function sendMessage(message) {
    const messageStr = JSON.stringify(message) + "\n";
    serverProcess.stdin.write(messageStr);
}

// Test the custom object creation
setTimeout(() => {
    const createObjectRequest = {
        jsonrpc: "2.0",
        method: "create_custom_object",
        params: {
            input: {
                targetOrg: "exonuat",
                objectName: "TestObject",
                label: "Test Object",
                pluralLabel: "Test Objects",
                description: "This is a test object created via MCP",
                apiVersion: "59.0",
            },
        },
        id: 1,
    };

    sendMessage(createObjectRequest);
}, 2000); // Give server time to initialize

// Handle responses from the server
serverProcess.stdout.on("data", (data) => {
    try {
        const response = JSON.parse(data.toString());
        if (response.id === 1) {
            console.log("Response from server:", response);
            if (response.error) {
                console.error("Error creating object:", response.error);
            } else {
                console.log("Object creation successful:", response.result);
            }
        }
    } catch (e) {
        // Not all stdout is JSON
    }
});

// Clean up on exit
process.on("exit", () => {
    serverProcess.kill();
});
