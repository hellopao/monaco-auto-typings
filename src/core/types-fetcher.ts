import { inflate } from "pako";
import { untar, TarLocalFile } from "@andrewbranch/untar.js";
import { IPackageInfo, IDependencyTypes } from '../types/index';
import { fetchWithTimeout } from '../utils/index';

async function untarDependencyPkg(res: Response): Promise<TarLocalFile[]> {
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
 * 从NPM获取依赖的类型定义文件
 */
export async function getDependencyTypesFromNpmRegistry(name: string, version: string, registryUrl: string): Promise<IDependencyTypes> {
  const result: IDependencyTypes = { entry: "", files: [] };

  try {
    const packageVersion = version || "latest";
    const packageInfoUrl = `${registryUrl}/${encodeURIComponent(name)}/${encodeURIComponent(packageVersion)}`;

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
    const files = await untarDependencyPkg(tarballRes);

    result.entry = packageInfo.types || packageInfo.typings || "";
    result.files = files.filter((item) => item.name.endsWith(".d.ts"));

    return result;
  } catch (error) {
    console.error(`Failed to get type definitions from NPM (${name}):`, error);
    throw error;
  }
}

/**
 * 从JSR获取依赖的类型定义文件
 */
export async function getDependencyTypesFromJsrRegistry(name: string, version: string): Promise<IDependencyTypes> {
  try {
    if (!version) {
      // 如果没有指定版本，获取最新版本
      const metaUrl = `https://jsr.io/${name}/meta.json`;
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
    const files = await untarDependencyPkg(res);

    // 只返回.d.ts类型定义文件
    return {
      entry: "",
      files: files.filter((item) => item.name.endsWith(".d.ts"))
    };
  } catch (error) {
    console.error(`Failed to get type definitions from JSR (${name}):`, error);
    throw error;
  }
}
