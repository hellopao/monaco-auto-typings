import debounceFn from "debounce";
import deepMerge from "deepmerge";
import { IAutoTypingsOptions, IBuiltinLib, IInternalOptions, ITsExtraLib } from '../types/index';
import { isValidUrl, createLogger } from '../utils/index';
import { getDependenciesFromImports, getImportsFromSourceCode } from './dependency-parser';
import { TypesManager } from './types-manager';
import { DEFAULT_OPTIONS } from '../config/index';

export type Monaco = typeof import('monaco-editor');
export type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
export type MonacoDisposable = import('monaco-editor').IDisposable;

/**
 * Monaco自动类型提示核心类
 */
export class MonacoAutoTypings {
	private options: IInternalOptions;
	private logger: ReturnType<typeof createLogger>;
	private typesManager: TypesManager;
	private disposable: MonacoDisposable | null = null;

	// 默认配置选项
	private static readonly defaultOptions: IInternalOptions = DEFAULT_OPTIONS;

	constructor(
		options: IAutoTypingsOptions = {}
	) {
		// 验证配置选项
		if (options.debounce !== undefined && (options.debounce < 0 || options.debounce > 5000)) {
			throw new Error('Debounce time must be between 0-5000 milliseconds');
		}

		if (options.registry && !isValidUrl(options.registry)) {
			throw new Error('Registry must be a valid URL');
		}

		if (options.maxConcurrency !== undefined && (options.maxConcurrency < 1 || options.maxConcurrency > 20)) {
			throw new Error('Maximum concurrency must be between 1-20');
		}

		// 合并默认选项和用户选项
		this.options = deepMerge<IInternalOptions>(MonacoAutoTypings.defaultOptions, options);

		this.logger = createLogger(this.options.verbose);
		this.typesManager = new TypesManager(this.options, this.logger);

		this.logger.info('Initializing Monaco Auto Typings plugin', this.options);
	}

	/**
	 * 初始化插件
	 */
	public initialize(monaco: Monaco, editor: MonacoEditor): { dispose: () => void } {
		try {
			// 加载内置类型定义
			const builtinLibs = Object.keys(this.options.builtins).filter(key => this.options.builtins[key as IBuiltinLib]) as IBuiltinLib[];
			if (builtinLibs.length > 0) {
				this.typesManager.createBuiltinExtraLibs(builtinLibs).then(libs => {
					this.addTypescriptExtraLibs(monaco, libs);
				}).catch(error => {
					this.logger.error('Failed to load built-in types:', error);
				});
			}

			// 创建代码变更处理函数并添加防抖
			const changeHandler = this.createCodeChangeHandler(monaco, editor);
			const debouncedHandler = debounceFn(changeHandler, this.options.debounce);
			this.disposable = editor.onDidChangeModelContent(debouncedHandler);

			this.logger.info('Monaco Auto Typings plugin initialization completed');

			// 立即执行一次处理函数
			changeHandler();

			return {
				dispose: () => this.dispose()
			};
		} catch (error) {
			this.logger.error('Initialization failed:', error);
			throw error;
		}
	}

	/**
	 * 添加类型定义
	 */
	private addTypescriptExtraLibs(monaco: Monaco, libs: Array<ITsExtraLib>) {
		libs.forEach(lib => {
			const { filepath, content } = lib;
			if (this.options.languages.includes('javascript')) {
				monaco.languages.typescript.javascriptDefaults.addExtraLib(content, filepath);
			}
			if (this.options.languages.includes('typescript')) {
				monaco.languages.typescript.typescriptDefaults.addExtraLib(content, filepath);
			}
		});
	}

	/**
	 * 创建代码变更处理函数
	 */
	private createCodeChangeHandler(monaco: Monaco, editor: MonacoEditor) {
		return async () => {
			try {
				const model = editor.getModel();
				if (!model) {
					this.logger.warn('Editor model does not exist');
					return;
				}

				const code = model.getValue();
				if (!code.trim()) {
					this.logger.info('Code is empty, skipping processing');
					return;
				}

				this.logger.info('Starting code dependency analysis');
				const imports = getImportsFromSourceCode(code);
				const dependencies = getDependenciesFromImports(imports);

				const extraLibs = await this.typesManager.createDenpendenciesExtraLibs(dependencies);
				this.addTypescriptExtraLibs(monaco, extraLibs)
			} catch (error) {
				this.logger.error('Error processing code changes:', error);
			}
		};
	}

	/**
	 * 销毁插件
	 */
	public dispose(): void {
		if (this.disposable) {
			this.disposable.dispose();
			this.disposable = null;
		}
		this.logger.info('Monaco Auto Typings plugin has been disposed');
	}

}
