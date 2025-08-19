import { exec } from "node:child_process";

/**
 * @param command The Salesforce CLI command to execute.
 * @description Executes a Salesforce CLI command and returns the result.
 * @returns a Promise that resolves with the parsed JSON result or an error message.
 * @throws {Error} If the command execution fails or if parsing the output fails.
 */
export const executeSfCommand = (command: string): Promise<any> => {
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
