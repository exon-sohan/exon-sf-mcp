import { z } from "zod";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { parseStringPromise } from "xml2js";

interface GenerateManifestParams {
  orgAlias: string;
  outputDir?: string;
  metadataTypes?: string[]; 
  maxItems?: number; 
}

interface SummaryItem {
  name: string;
  memberCount: number;
  sampleMembers: string[];
}


interface FilterManifestParams {
  manifestPath: string;
  metadataTypes: string[];
  outputPath?: string;
  maxItemsPerType?: number; // NEW: Limit items per type
}

interface RetrieveFilteredMetadataParams {
  manifestPath: string;
  targetDir?: string;
}

interface RetrieveApexClassesParams {
  orgAlias: string;
  outputDir?: string;
  maxClasses?: number; // NEW: Limit number of classes
}

interface ManifestSummaryParams {
  manifestPath: string;
}

export function registerManifestTools(server: any) {
  
  // NEW: Get manifest summary without loading full content
  server.tool(
    "getManifestSummary",
    "Get summary of manifest file without loading full content - prevents quota issues",
    {
      manifestPath: z.string().describe("Path to the package.xml file")
    },
    async (params: ManifestSummaryParams) => {
      const { manifestPath } = params;
      
      try {
        if (!existsSync(manifestPath)) {
          throw new Error(`Manifest file not found at: ${manifestPath}`);
        }

        // Read and parse only the structure, not all items
        const xmlContent = readFileSync(manifestPath, 'utf-8');
        const parsedXml = await parseStringPromise(xmlContent);
        
        if (!parsedXml.Package || !parsedXml.Package.types) {
          throw new Error("Invalid package.xml format");
        }

        // Create summary without exposing full content to LLM
        const summary = parsedXml.Package.types.map((type: any) => ({
          name: type.name?.[0],
          memberCount: type.members ? type.members.length : 0,
          // Only show first few members as examples, not all
          sampleMembers: type.members ? type.members.slice(0, 3) : []
        }));

        const totalItems = summary.reduce((sum : any, type : any) => sum + type.memberCount, 0);

        return {
            content: [
                {
                type: "text",
                text: `📊 Manifest Summary (${manifestPath})\n\nTotal Metadata Types: ${summary.length}\nTotal Items: ${totalItems}\n\n${summary.map((s: SummaryItem) => 
                    `${s.name}: ${s.memberCount} items ${s.sampleMembers.length > 0 ? `(samples: ${s.sampleMembers.join(', ')})` : ''}`
                ).join('\n')}\n\n💡 Use filterManifest with specific metadata types to avoid quota issues.`
                }
            ]
            };

      } catch (error) {
        throw new Error(`Failed to get manifest summary: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // ENHANCED: Generate manifest with pre-filtering
  server.tool(
    "generateManifest",
    "Generate manifest file with optional pre-filtering to avoid large files",
    {
      orgAlias: z.string().describe("Salesforce org alias to generate manifest from"),
      outputDir: z.string().optional().describe("Output directory for manifest (default: ./manifest)"),
      metadataTypes: z.array(z.string()).optional().describe("Pre-filter to specific metadata types during generation"),
      maxItems: z.number().optional().describe("Maximum items per metadata type (default: 1000)")
    },
    async (params: GenerateManifestParams) => {
      const { orgAlias, outputDir = "./manifest", metadataTypes, maxItems = 1000 } = params;

      try {
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }

        let command = `sf project generate manifest --output-dir ${outputDir} --from-org ${orgAlias}`;
        
        // If specific metadata types requested, add them to command
        if (metadataTypes && metadataTypes.length > 0) {
          command += ` --metadata ${metadataTypes.join(',')}`;
        }

        execSync(command, { stdio: 'inherit' });

        const packageXmlPath = join(outputDir, "package.xml");

        if (existsSync(packageXmlPath)) {
          // If maxItems specified, automatically filter the generated manifest
          if (maxItems < Infinity) {
            await filterLargeManifest(packageXmlPath, maxItems);
          }

          return {
            content: [
              {
                type: "text",
                text: `✅ Manifest generated successfully at: ${packageXmlPath}\n\n${metadataTypes ? `Pre-filtered for: ${metadataTypes.join(', ')}\n` : ''}${maxItems < 1000 ? `Limited to ${maxItems} items per type\n` : ''}\n💡 Use getManifestSummary to see what's included without quota issues.`
              }
            ]
          };
        } else {
          throw new Error("Failed to generate package.xml file");
        }
      } catch (error) {
        throw new Error(`Failed to generate manifest: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // ENHANCED: Filter manifest with item limits
  server.tool(
    "filterManifest",
    "Filter manifest file with smart limits to prevent quota issues",
    {
      manifestPath: z.string().describe("Path to the package.xml file"),
      metadataTypes: z.array(z.string()).describe("Array of metadata types to include"),
      outputPath: z.string().optional().describe("Optional output path for filtered manifest"),
      maxItemsPerType: z.number().optional().describe("Maximum items per metadata type (default: 500)")
    },
    async (params: FilterManifestParams) => {
      const { manifestPath, metadataTypes, outputPath, maxItemsPerType = 500 } = params;

      try {
        if (!existsSync(manifestPath)) {
          throw new Error(`Manifest file not found at: ${manifestPath}`);
        }

        const xmlContent = readFileSync(manifestPath, 'utf-8');
        const parsedXml = await parseStringPromise(xmlContent);

        if (!parsedXml.Package || !parsedXml.Package.types) {
          throw new Error("Invalid package.xml format");
        }

        // Filter and limit types
        const filteredTypes = parsedXml.Package.types
          .filter((type: any) => {
            const typeName = type.name?.[0];
            return metadataTypes.includes(typeName);
          })
          .map((type: any) => {
            // Limit members per type to prevent large files
            if (type.members && type.members.length > maxItemsPerType) {
              return {
                ...type,
                members: type.members.slice(0, maxItemsPerType)
              };
            }
            return type;
          });

        const filteredPackage = {
          Package: {
            $: { xmlns: "http://soap.sforce.com/2006/04/metadata" },
            types: filteredTypes,
            version: parsedXml.Package.version
          }
        };

        const { Builder } = await import('xml2js');
        const builder = new Builder();
        const filteredXml = builder.buildObject(filteredPackage);

        const finalOutputPath = outputPath || 
          manifestPath.replace('package.xml', `package-filtered-${metadataTypes.join('-')}.xml`);

        writeFileSync(finalOutputPath, filteredXml);

        const totalItems = filteredTypes.reduce((sum: number, type: any) => 
          sum + (type.members ? type.members.length : 0), 0
        );

        return {
          content: [
            {
              type: "text",
              text: `✅ Manifest filtered successfully!\n\nIncluded: ${metadataTypes.join(', ')}\nTotal items: ${totalItems}\nMax per type: ${maxItemsPerType}\n\nSaved to: ${finalOutputPath}\n\n💡 Use retrieveFilteredMetadata to deploy these components.`
            }
          ]
        };
      } catch (error) {
        throw new Error(`Failed to filter manifest: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Keep existing retrieveFilteredMetadata unchanged
  server.tool(
    "retrieveFilteredMetadata",
    "Retrieve metadata using a filtered manifest file",
    {
      manifestPath: z.string().describe("Path to the filtered package.xml file"),
      targetDir: z.string().optional().describe("Target directory for retrieved metadata (default: ./force-app/main/default)")
    },
    async (params: RetrieveFilteredMetadataParams) => {
      const { manifestPath, targetDir = "./force-app/main/default" } = params;

      try {
        if (!existsSync(manifestPath)) {
          throw new Error(`Manifest file not found at: ${manifestPath}`);
        }

        if (!existsSync("sfdx-project.json")) {
          const projectConfig = {
            "packageDirectories": [{ "path": targetDir, "default": true }],
            "namespace": "",
            "sfdcLoginUrl": "https://login.salesforce.com",
            "sourceApiVersion": "58.0"
          };
          writeFileSync("sfdx-project.json", JSON.stringify(projectConfig, null, 2));
        }

        const command = `sf project retrieve start --manifest ${manifestPath}`;
        execSync(command, { stdio: 'inherit' });

        return {
          content: [
            {
              type: "text",
              text: `✅ Metadata retrieval completed successfully using manifest: ${manifestPath}\n\nRetrieved metadata has been saved to the default package directory.`
            }
          ]
        };
      } catch (error) {
        throw new Error(`Failed to retrieve metadata: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // ENHANCED: Optimized Apex classes retrieval
  server.tool(
    "retrieveApexClasses",
    "Optimized workflow to retrieve Apex classes with limits to prevent quota issues",
    {
      orgAlias: z.string().describe("Salesforce org alias"),
      outputDir: z.string().optional().describe("Output directory for manifest (default: ./manifest)"),
      maxClasses: z.number().optional().describe("Maximum number of classes to retrieve (default: 100)")
    },
    async (params: RetrieveApexClassesParams) => {
      const { orgAlias, outputDir = "./manifest", maxClasses = 100 } = params;

      try {
        // Step 1: Generate manifest with pre-filtering
        const packageXmlPath = join(outputDir, "package.xml");
        
        // Generate only for ApexClass to avoid large manifest
        let command = `sf project generate manifest --output-dir ${outputDir} --from-org ${orgAlias} --metadata ApexClass`;
        
        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }
        
        execSync(command, { stdio: 'inherit' });

        // Step 2: Filter with limits
        const filteredPath = join(outputDir, "package-apex-limited.xml");
        
        // Read and limit the manifest
        const xmlContent = readFileSync(packageXmlPath, 'utf-8');
        const parsedXml = await parseStringPromise(xmlContent);
        
        if (parsedXml.Package && parsedXml.Package.types) {
          const apexType = parsedXml.Package.types.find((type: any) => type.name?.[0] === 'ApexClass');
          if (apexType && apexType.members && apexType.members.length > maxClasses) {
            apexType.members = apexType.members.slice(0, maxClasses);
          }
        }

        const { Builder } = await import('xml2js');
        const builder = new Builder();
        const limitedXml = builder.buildObject(parsedXml);
        writeFileSync(filteredPath, limitedXml);

        // Step 3: Retrieve limited metadata
        const retrieveCommand = `sf project retrieve start --manifest ${filteredPath}`;
        execSync(retrieveCommand, { stdio: 'inherit' });

        return {
          content: [
            {
              type: "text",
              text: `✅ Apex Classes Retrieved Successfully!\n\n📊 Limited to ${maxClasses} classes to prevent quota issues\n📁 Manifest: ${filteredPath}\n🎯 Retrieved from org: ${orgAlias}\n\n💡 Increase maxClasses parameter if you need more classes.`
            }
          ]
        };
      } catch (error) {
        throw new Error(`Failed to retrieve Apex classes: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}

// Helper function to filter large manifests
async function filterLargeManifest(manifestPath: string, maxItemsPerType: number) {
  const xmlContent = readFileSync(manifestPath, 'utf-8');
  const parsedXml = await parseStringPromise(xmlContent);
  
  if (parsedXml.Package && parsedXml.Package.types) {
    let modified = false;
    
    parsedXml.Package.types = parsedXml.Package.types.map((type: any) => {
      if (type.members && type.members.length > maxItemsPerType) {
        modified = true;
        return {
          ...type,
          members: type.members.slice(0, maxItemsPerType)
        };
      }
      return type;
    });
    
    if (modified) {
      const { Builder } = await import('xml2js');
      const builder = new Builder();
      const limitedXml = builder.buildObject(parsedXml);
      writeFileSync(manifestPath, limitedXml);
    }
  }
}