import { MonacoAutoTypings } from './core/auto-typings.ts';
import { IAutoTypingsOptions } from './types/index.ts';

/**
 * 初始化自动类型提示功能
 * @param monaco Monaco编辑器实例
 * @param editor 编辑器实例
 * @param options 配置选项
 */
export default function initialize(
  monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  options: IAutoTypingsOptions = {}
): Promise<{ dispose: () => void }> {
  const autoTypings = new MonacoAutoTypings(options);
  return autoTypings.initialize(monaco, editor);
}
