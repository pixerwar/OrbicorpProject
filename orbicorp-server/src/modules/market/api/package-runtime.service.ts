import prisma from '../../shared/utils/prisma.js';
import { Tool } from './llm-types.js';

/**
 * PackageRuntime - Agent çalışırken kurulu paketlerden tool ve prompt yükler
 */
class PackageRuntimeService {
  
  /**
   * Agent için aktif paketlerden tool'ları topla
   */
  async getToolsForAgent(agentId: string): Promise<Tool[]> {
    try {
      // Agent'a atanmış ve aktif olan paketleri getir
      const agentPackages = await prisma.agentPackage.findMany({
        where: {
          agentId,
          enabled: true,
          installation: {
            status: 'ACTIVE',
          },
        },
        include: {
          installation: {
            include: {
              package: {
                select: {
                  name: true,
                  type: true,
                  tools: true,
                  manifest: true,
                },
              },
            },
          },
        },
      });

      const tools: Tool[] = [];

      for (const ap of agentPackages) {
        const pkg = ap.installation.package;
        
        // Sadece SKILL ve TOOL tiplerinden tool'ları al
        if (pkg.type !== 'SKILL' && pkg.type !== 'TOOL') {
          continue;
        }

        const pkgTools = pkg.tools as any[] || [];
        
        for (const tool of pkgTools) {
          // Tool formatını LLM formatına dönüştür
          const llmTool: Tool = {
            name: tool.name,
            description: tool.description,
            input_schema: this.convertParametersToInputSchema(tool.parameters),
          };
          
          tools.push(llmTool);
        }
      }

      console.log(`[PackageRuntime] Agent ${agentId.slice(-8)} için ${tools.length} tool yüklendi:`, tools.map(t => t.name));
      
      return tools;
    } catch (error) {
      console.error('[PackageRuntime] Tool yükleme hatası:', error);
      return [];
    }
  }

  /**
   * Agent için system prompt eklerini topla
   */
  async getSystemPromptAdditions(agentId: string): Promise<string[]> {
    try {
      const agentPackages = await prisma.agentPackage.findMany({
        where: {
          agentId,
          enabled: true,
          installation: {
            status: 'ACTIVE',
          },
        },
        include: {
          installation: {
            include: {
              package: {
                select: {
                  name: true,
                  manifest: true,
                },
              },
            },
          },
        },
      });

      const additions: string[] = [];

      for (const ap of agentPackages) {
        const manifest = ap.installation.package.manifest as any;
        
        if (manifest?.systemPromptAddition) {
          additions.push(manifest.systemPromptAddition);
        }
      }

      if (additions.length > 0) {
        console.log(`[PackageRuntime] Agent ${agentId.slice(-8)} için ${additions.length} prompt eki yüklendi`);
      }

      return additions;
    } catch (error) {
      console.error('[PackageRuntime] Prompt eki yükleme hatası:', error);
      return [];
    }
  }

  /**
   * Agent için paket ayarlarını getir (tool çalıştırma için)
   */
  async getPackageConfig(agentId: string, packageName: string): Promise<Record<string, any> | null> {
    try {
      const agentPackage = await prisma.agentPackage.findFirst({
        where: {
          agentId,
          enabled: true,
          installation: {
            status: 'ACTIVE',
            package: {
              name: packageName,
            },
          },
        },
        include: {
          installation: {
            select: {
              config: true,
            },
          },
        },
      });

      if (!agentPackage) {
        return null;
      }

      return agentPackage.installation.config as Record<string, any>;
    } catch (error) {
      console.error('[PackageRuntime] Config getirme hatası:', error);
      return null;
    }
  }

  /**
   * Handler tipi kontrol - builtin mi custom mı
   */
  getHandlerType(handler: string | undefined): 'builtin' | 'custom' | 'unknown' {
    if (!handler) return 'unknown';
    if (handler.startsWith('builtin:')) return 'builtin';
    if (handler.startsWith('custom:')) return 'custom';
    return 'unknown';
  }

  /**
   * Builtin handler adını parse et
   */
  parseBuiltinHandler(handler: string): { category: string; action: string } | null {
    if (!handler.startsWith('builtin:')) return null;
    
    const parts = handler.replace('builtin:', '').split('.');
    if (parts.length !== 2) return null;
    
    return {
      category: parts[0],
      action: parts[1],
    };
  }

  /**
   * Tool tanımındaki parameters formatını input_schema formatına dönüştür
   */
  private convertParametersToInputSchema(parameters: any): Tool['input_schema'] {
    if (!parameters) {
      return {
        type: 'object',
        properties: {},
      };
    }

    // Zaten doğru formatta mı kontrol et
    if (parameters.type === 'object' && parameters.properties) {
      return {
        type: 'object',
        properties: this.convertProperties(parameters.properties),
        required: parameters.required,
      };
    }

    return {
      type: 'object',
      properties: {},
    };
  }

  /**
   * Properties formatını LLM uyumlu hale getir
   */
  private convertProperties(properties: Record<string, any>): Record<string, any> {
    const converted: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(properties)) {
      converted[key] = {
        type: value.type || 'string',
        description: value.description || key,
      };
      
      if (value.enum) {
        converted[key].enum = value.enum;
      }
    }
    
    return converted;
  }

  /**
   * Belirli bir tool'un hangi pakete ait olduğunu bul
   */
  async findToolPackage(agentId: string, toolName: string): Promise<{
    packageName: string;
    handler: string;
    config: Record<string, any>;
  } | null> {
    try {
      const agentPackages = await prisma.agentPackage.findMany({
        where: {
          agentId,
          enabled: true,
          installation: {
            status: 'ACTIVE',
          },
        },
        include: {
          installation: {
            include: {
              package: {
                select: {
                  name: true,
                  tools: true,
                },
              },
            },
          },
        },
      });

      for (const ap of agentPackages) {
        const pkg = ap.installation.package;
        const pkgTools = pkg.tools as any[] || [];
        
        const tool = pkgTools.find((t: any) => t.name === toolName);
        if (tool) {
          return {
            packageName: pkg.name,
            handler: tool.handler || `builtin:${toolName}`,
            config: ap.installation.config as Record<string, any> || {},
          };
        }
      }

      return null;
    } catch (error) {
      console.error('[PackageRuntime] Tool paketi bulunamadı:', error);
      return null;
    }
  }

  /**
   * Agent için tüm paket bilgilerini toplu getir (optimizasyon için)
   */
  async getAgentPackageContext(agentId: string): Promise<{
    tools: Tool[];
    systemPromptAdditions: string[];
    packageConfigs: Record<string, Record<string, any>>;
  }> {
    try {
      const agentPackages = await prisma.agentPackage.findMany({
        where: {
          agentId,
          enabled: true,
          installation: {
            status: 'ACTIVE',
          },
        },
        include: {
          installation: {
            include: {
              package: true,
            },
          },
        },
      });

      const tools: Tool[] = [];
      const systemPromptAdditions: string[] = [];
      const packageConfigs: Record<string, Record<string, any>> = {};

      for (const ap of agentPackages) {
        const pkg = ap.installation.package;
        const manifest = pkg.manifest as any;

        // Config
        packageConfigs[pkg.name] = ap.installation.config as Record<string, any> || {};

        // System prompt additions
        if (manifest?.systemPromptAddition) {
          systemPromptAdditions.push(manifest.systemPromptAddition);
        }

        // Tools
        if (pkg.type === 'SKILL' || pkg.type === 'TOOL') {
          const pkgTools = pkg.tools as any[] || [];
          
          for (const tool of pkgTools) {
            tools.push({
              name: tool.name,
              description: tool.description,
              input_schema: this.convertParametersToInputSchema(tool.parameters),
            });
          }
        }
      }

      return { tools, systemPromptAdditions, packageConfigs };
    } catch (error) {
      console.error('[PackageRuntime] Paket context hatası:', error);
      return { tools: [], systemPromptAdditions: [], packageConfigs: {} };
    }
  }
}

export const packageRuntime = new PackageRuntimeService();
