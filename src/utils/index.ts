/**
 * HTTP请求超时时间(毫秒)
 */
export const REQUEST_TIMEOUT = 30000;

/**
 * 创建带超时的fetch请求
 */
export async function fetchWithTimeout(url: string, timeout: number = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 检查URL是否有效
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 转义正则表达式特殊字符
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 日志输出工具
 */
export function createLogger(verbose: boolean) {
  return {
    info: (message: string, ...args: any[]) => {
      if (verbose) {
        console.log(`[Monaco Auto Typings] ${message}`, ...args);
      }
    },
    error: (message: string, ...args: any[]) => {
      if (verbose) {
        console.error(`[Monaco Auto Typings] ${message}`, ...args);
      }
    },
    warn: (message: string, ...args: any[]) => {
      if (verbose) {
        console.warn(`[Monaco Auto Typings] ${message}`, ...args);
      }
    }
  };
}
