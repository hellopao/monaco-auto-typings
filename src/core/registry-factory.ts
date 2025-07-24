import { inflate } from "pako";
import { untar, TarLocalFile } from "@andrewbranch/untar.js";
import { IDependency, IPackageInfo, ITypesResult } from '../types/index.ts';
import { fetchWithTimeout } from '../utils/index.ts';

/**
 * 注册表管理器基类
 */
abstract class BaseRegistry {
  protected registryUrl: string;

  constructor(registryUrl: string) {
    this.registryUrl = registryUrl;
  }

  /**
   * 解压依赖包的tar.gz文件并返回文件列表
   */
  protected async untarDependencyPkg(res: Response): Promise<TarLocalFile[]> {
    if (!res.ok) {
      throw new Error(`HTTP request failed: ${res.status} ${res.statusText}`);
    }

    try {
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength === 0) {
        throw new Error('Response content is empty');
      }

      const arr = inflate(buffer) as Uint8Array<ArrayBuffer>;
      const files = await untar(arr.buffer);
      return files;
    } catch (error) {
      console.error("Failed to extract dependency package:", error);
      throw new Error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 获取依赖的类型定义文件
   */
  abstract getDependencyTypes(dependency: Omit<IDependency, "registry">): Promise<ITypesResult>;
}

/**
 * NPM注册表管理器
 */
export class NPMRegistry extends BaseRegistry {
  constructor(registryUrl: string = "https://registry.npmjs.org") {
    super(registryUrl);
  }

  /**
   * 从NPM获取依赖的类型定义文件
   */
  public async getDependencyTypes(dependency: Omit<IDependency, "registry">): Promise<ITypesResult> {
    const result: ITypesResult = { types: "", files: [] };
    
    try {
      const { name, version } = dependency;
      
      if (!name) {
        throw new Error('Package name cannot be empty');
      }

      const packageVersion = version || "latest";
      const packageInfoUrl = `${this.registryUrl}/${encodeURIComponent(name)}/${encodeURIComponent(packageVersion)}`;
      
      // Get package information
      const packageInfoRes = await fetchWithTimeout(packageInfoUrl);
      
      if (!packageInfoRes.ok) {
        throw new Error(`Failed to get package information: ${packageInfoRes.status} ${packageInfoRes.statusText}`);
      }
      
      const packageInfo = await packageInfoRes.json() as IPackageInfo;
      
      if (packageInfo.error) {
        throw new Error(`Package information error: ${packageInfo.error}`);
      }

      if (!packageInfo.dist?.tarball) {
        throw new Error('Missing tarball download URL in package information');
      }

      // Download and extract npm package
      const tarballRes = await fetchWithTimeout(packageInfo.dist.tarball);
      const files = await this.untarDependencyPkg(tarballRes);
      
      result.types = packageInfo.types || packageInfo.typings || "";
      result.files = files.filter((item) => item.name.endsWith(".d.ts"));
      
      return result;
    } catch (error) {
      console.error(`Failed to get type definitions from NPM (${dependency.name}):`, error);
      throw error;
    }
  }
}

/**
 * JSR注册表管理器
 */
export class JSRRegistry extends BaseRegistry {
  constructor() {
    super("https://jsr.io");
  }

  /**
   * 从JSR获取依赖的类型定义文件
   */
  public async getDependencyTypes(dependency: Omit<IDependency, "registry">): Promise<ITypesResult> {
    try {
      let { name, version } = dependency;
      
      if (!name) {
        throw new Error('Package name cannot be empty');
      }

      if (!version) {
         // 如果没有指定版本，获取最新版本
        const metaUrl = `${this.registryUrl}/${name}/meta.json`;
        const res = await fetchWithTimeout(metaUrl);
        
        if (!res.ok) {
          throw new Error(`Failed to get package metadata: ${res.status} ${res.statusText}`);
        }
        
        const result = (await res.json()) as { latest: string };
        version = result.latest;
        
        if (!version) {
          throw new Error('Unable to get the latest version information for the package');
        }
      }

      if (!version) {
        throw new Error('Invalid package version information');
      }

       // 构建JSR包的下载URL
      const packageUrl = `https://npm.jsr.io/~/11/@jsr/${name
        .replace("@", "")
        .replace("/", "__")}/${version}.tgz`;
      
      const res = await fetchWithTimeout(packageUrl);
      const files = await this.untarDependencyPkg(res);
      
      // 只返回.d.ts类型定义文件
      return {
        types: "",
        files: files.filter((item) => item.name.endsWith(".d.ts"))
      };
    } catch (error) {
      console.error(`Failed to get type definitions from JSR (${dependency.name}):`, error);
      throw error;
    }
  }
}

export class RegistryFactory {
  private static npmRegistry: NPMRegistry;
  private static jsrRegistry: JSRRegistry;

  /**
   * NPM镜像
   */
  public static getNPMRegistry(registryUrl?: string): NPMRegistry {
    if (!this.npmRegistry || registryUrl) {
      this.npmRegistry = new NPMRegistry(registryUrl);
    }
    return this.npmRegistry;
  }

  /**
   * JSR仓库
   */
  public static getJSRRegistry(): JSRRegistry {
    if (!this.jsrRegistry) {
      this.jsrRegistry = new JSRRegistry();
    }
    return this.jsrRegistry;
  }

  /**
   * 根据注册表类型获取实例
   */
  public static getRegistry(type: string, registryUrl?: string): BaseRegistry {
    switch (type.toLowerCase()) {
      case 'jsr':
        return this.getJSRRegistry();
      case 'npm':
      default:
        return this.getNPMRegistry(registryUrl);
    }
  }
}