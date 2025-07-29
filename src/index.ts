import { MonacoAutoTypings, Monaco, MonacoEditor } from './core/auto-typings';
import { IAutoTypingsOptions } from './types/index';

/**
 * Initialize auto typings
 * @param monaco monaco 
 * @param editor monaco editor instance
 * @param options Configuration options
 */
export default function initialize(
  monaco: Monaco,
  editor: MonacoEditor,
  options: IAutoTypingsOptions = {}
): { dispose: () => void } {
  const autoTypings = new MonacoAutoTypings(options);
  return autoTypings.initialize(monaco, editor);
}
