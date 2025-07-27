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
};
