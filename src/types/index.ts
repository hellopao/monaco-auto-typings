import { TarLocalFile } from "@andrewbranch/untar.js";

/**
 * 语言
 */
export type ILanguage = "javascript" | "typescript";

/**
 * 内置类型支持
 */
export type IBuiltinTypes = "typescript" | "node" | "deno" | "bun";

/**
 * 依赖项信息接口
 */
export interface IDependency {
  /** 依赖项源（如npm、jsr等） */
  registry: string;
  /** 包名 */
  name: string;
  /** 版本号 */
  version: string;
  /** 原始依赖名称 */
  key: string;
}

/**
 * 自动类型提示配置选项接口
 */
export interface IAutoTypingsOptions {
  /** npm镜像地址 */
  registry?: string;
  /** 防抖延迟时间(毫秒) */
  debounce?: number;
  /** 内置类型支持配置 */
  builtins?: Record<IBuiltinTypes, boolean>;
  /** 是否启用详细日志 */
  verbose?: boolean;
  /** 最大并发请求数 */
  maxConcurrency?: number;
  /** 语言 */
  languages?: Array<ILanguage>;
}

/**
 * 内部完整配置选项接口
 */
export interface IInternalOptions extends Required<IAutoTypingsOptions> {}

/**
 * 包信息接口
 */
export interface IPackageInfo {
  error?: string;
  dist: {
    tarball: string;
  };
  types?: string;
  typings?: string;
  name: string;
  version: string;
}

/**
 * 类型定义结果接口
 */
export interface ITypesResult {
  types: string;
  files: TarLocalFile[];
}

/**
 * typescript额外类型定义
 */
export interface ITsExtraLib {
  /** lib key */
  key: string;
  /** .d.ts文件名 */
  filename: string;
  /** .d.ts文件内容 */
  content: string;
}

/**
 * 日志工具接口
 */
export interface ILogger {
  info: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
}
