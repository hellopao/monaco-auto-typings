/**
 * 类型缓存管理器
 */
export class TypesCache {
  private static instance: TypesCache;
  private typesCache = new Set<string>();
  private loadingDependencies = new Set<string>();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): TypesCache {
    if (!TypesCache.instance) {
      TypesCache.instance = new TypesCache();
    }
    return TypesCache.instance;
  }

  /**
   * 检查类型是否已缓存
   */
  public has(key: string): boolean {
    return this.typesCache.has(key);
  }

  /**
   * 添加到缓存
   */
  public add(key: string): void {
    this.typesCache.add(key);
  }

  /**
   * 检查是否正在加载
   */
  public isLoading(key: string): boolean {
    return this.loadingDependencies.has(key);
  }

  /**
   * 标记为正在加载
   */
  public setLoading(key: string): void {
    this.loadingDependencies.add(key);
  }

  /**
   * 移除加载标记
   */
  public removeLoading(key: string): void {
    this.loadingDependencies.delete(key);
  }

  /**
   * 清空缓存
   */
  public clear(): void {
    this.typesCache.clear();
    this.loadingDependencies.clear();
  }

  /**
   * 获取缓存统计信息
   */
  public getStats(): { cached: number; loading: number } {
    return {
      cached: this.typesCache.size,
      loading: this.loadingDependencies.size
    };
  }
}