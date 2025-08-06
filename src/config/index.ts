import { IInternalOptions } from '../types';

/**
 * 默认配置选项
 */
export const DEFAULT_OPTIONS: IInternalOptions = {
  registry: "https://registry.npmjs.org",
  debounce: 300,
  builtins: {
    typescript: true,
    node: true,
    deno: false,
    bun: false,
  },
  verbose: false,
  maxConcurrency: 5,
  languages: ['typescript']
};

/**
 * 内置类型对应的包名
 */
export const BUILTIN_PACKAGES = {
  typescript: 'typescript',
  node: '@types/node',
  deno: '@types/deno',
  bun: 'bun-types'
};
