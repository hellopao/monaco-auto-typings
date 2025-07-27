import chunk from 'chunk';
import path from 'path-browserify';
import { concat } from 'uint8arrays/concat'
import { TarLocalFile } from '@andrewbranch/untar.js';
import { IDependency, IInternalOptions, ILogger, ITypesResult } from '../types/index';
import { TypesCache } from './types-cache';
import { RegistryFactory } from './registry-factory';
import { escapeRegExp } from '../utils/index';
import { DependencyParser } from './dependency-parser';

/**
 * 类型管理器
 */
export class TypesManager {
	private cache: TypesCache;
	private options: IInternalOptions;
	private logger: ILogger;

	constructor(options: IInternalOptions, logger: ILogger) {
		this.cache = TypesCache.getInstance();
		this.options = options;
		this.logger = logger;
	}

	/**
	 * 加载依赖的类型定义
	 */
	public async createDenpendencyTypes(dependencies: IDependency[]): Promise<string[]> {
		if (dependencies.length === 0) {
			this.logger.info('No external dependencies found');
			return [];
		}

		this.logger.info(`Found ${dependencies.length} dependencies:`, dependencies.map(d => d.name));

		// 过滤已加载和正在加载的依赖
		const newDependencies = dependencies.filter(dep => {
			const key = `${dep.name}@${dep.version || 'latest'}`;
			return !this.cache.has(key) && !this.cache.isLoading(key);
		});

		if (newDependencies.length === 0) {
			this.logger.info('All dependency type definitions are already loaded');
			return [];
		}

		// 限制并发数量
		const chunks: Array<IDependency[]> = chunk(newDependencies, this.options.maxConcurrency);

		const types: string[] = [];
		for (const chunk of chunks) {
			const result = await Promise.all(
				chunk.map(dependency => this.loadSingleDependencyTypes(dependency))
			);
			types.push(...result.flat());
		}
		return types;
	}

	/**
	 * 加载单个依赖的类型定义
	 */
	private async loadSingleDependencyTypes(dependency: IDependency): Promise<string[]> {
		const key = `${dependency.name}@${dependency.version || 'latest'}`;

		if (this.cache.has(key) || this.cache.isLoading(key)) {
			return [];
		}

		this.cache.setLoading(key);
		this.cache.add(key);

		try {
			this.logger.info(`Loading type definitions for ${dependency.name}`);
			const types = await this.fetchDependencyTypes(dependency);

			if (types && types.length > 0) {
				this.logger.info(`Successfully loaded type definitions for ${dependency.name}`);
			} else {
				this.logger.warn(`No type definitions found for ${dependency.name}`);
			}
			return types;
		} catch (error) {
			this.logger.error(`Failed to load type definitions for ${dependency.name}:`, error);
			return [];
		} finally {
			this.cache.removeLoading(key);
		}
	}

	/**
	 * 获取依赖的类型定义内容
	 */
	public async fetchDependencyTypes(dependency: IDependency): Promise<string[]> {
		try {
			const { registry, name, version } = dependency;

			if (!name) {
				throw new Error('Dependency name cannot be empty');
			}

			let types = "";
			let files: ITypesResult['files'] = [];

			// 根据不同的注册表获取类型定义文件
			if (registry === "jsr") {
				const jsrRegistry = RegistryFactory.getJSRRegistry();
				const result = await jsrRegistry.getDependencyTypes({ name, version });
				files = result.files;
			} else {
				const npmRegistry = RegistryFactory.getNPMRegistry(this.options.registry);

				// 优先从模块自带类型中查找
				let result = await npmRegistry.getDependencyTypes({ name, version });

				// 如果未找到类型定义，再从@types仓库查找
				if (result.files.length === 0 && !name.startsWith('@types/') && !name.startsWith('@')) {
					try {
						result = await npmRegistry.getDependencyTypes({
							name: `@types/${name.replace('@', '').replace('/', '__')}`,
							version
						});
					} catch (error) {
						this.logger.warn(`No type definitions found for @types/${name}:`, error);
					}
				}

				types = result.types;
				files = result.files;
			}

			if (files.length === 0) {
				this.logger.warn(`No type definition files found for ${name}`);
				return [];
			}

			if (types) {
				const possiblePaths = [types, `package/${types}`, `${name}/${types}`, types.startsWith('./') ? types.slice(2) : types ];
				let typesFile: TarLocalFile | undefined;
				for (const file of files) {
					const matched = possiblePaths.find(path =>  path === file.name);
					if (matched) {
						typesFile = file;
						break;
					}
				}
				if (typesFile) {
					const refs = DependencyParser.getReferencesFromTypes(new TextDecoder("utf-8").decode(typesFile.fileData))
					const refFiles = refs.map(ref => {
						const dir = path.join(path.dirname(typesFile.name), ref)
						return files.find(item => item.name === dir)!;
					});
					files = [{ name: typesFile.name, fileData: concat([typesFile.fileData, ...refFiles.map(file => file.fileData)]) }] as TarLocalFile[];
				}
			}
			// 生成模块名称
			const moduleKey = `${name}${version ? `@${version}` : ''}`;

			// 检查是否需要包装为declare module
			const declareModuleReg = new RegExp(
				`declare\\s+module\\s+['"\`]${escapeRegExp(moduleKey)}['"\`]`,
				'g'
			);

			// 处理类型定义文件内容
			return files.map((item) => {
				try {
					let content = new TextDecoder("utf-8").decode(item.fileData);

					if (!content.trim()) {
						this.logger.warn(`Type definition file ${item.name} is empty`);
						return '';
					}

					const newModuleKey = registry ? `${registry}:${moduleKey}` : moduleKey;

					// 如果类型定义中没有declare module声明，则添加一个
					if (!declareModuleReg.test(content)) {
						content = `declare module '${newModuleKey}' {\n${content}\n}`;
					} else {
						// 替换已有的declare module声明
						content = content.replace(
							declareModuleReg,
							`declare module '${newModuleKey}'`
						);
					}

					return content;
				} catch (error) {
					this.logger.error(`Failed to process type definition file ${item.name}:`, error);
					return '';
				}
			}).filter(content => content.trim().length > 0);
		} catch (error) {
			this.logger.error(`Failed to get type definitions for ${dependency.name}:`, error);
			return [];
		}
	}

	/**
	 * 加载内置类型定义
	 */
	public async createBuiltinTypes(): Promise<string[]> {
		try {
			this.logger.info('Starting to load built-in type definitions');

			const builtinEntries = Object.entries(this.options.builtins || {});
			const builtinPromises = builtinEntries
				.filter(([_, enabled]) => enabled)
				.map(async ([name]) => {
					try {
						this.logger.info(`Loading built-in types for ${name}`);
						const types = await this.fetchBuiltinTypes(name);

						if (types && types.length > 0) {
							this.logger.info(`Successfully loaded built-in types for ${name}`);
						} else {
							this.logger.warn(`No built-in types found for ${name}`);
						}
						return types;
					} catch (error) {
						this.logger.error(`Failed to load built-in types for ${name}:`, error);
						return [];
					}
				});

			this.logger.info('Built-in type definitions loading completed');
			const result = await Promise.all(builtinPromises);
			return result.flat();
		} catch (error) {
			this.logger.error('Error loading built-in type definitions:', error);
			return []
		}
	}

	/**
	 * 获取内置类型定义
	 */
	public async fetchBuiltinTypes(mod: string): Promise<string[]> {
		try {
			if (!mod) {
				throw new Error('Module name cannot be empty');
			}

			// 根据模块名称确定包名
			const name = mod === "typescript" ? mod : `@types/${mod}`;

			this.logger.info(`Getting built-in types: ${name}`);

			const npmRegistry = RegistryFactory.getNPMRegistry(this.options.registry);

			// 获取类型定义文件
			const { files } = await npmRegistry.getDependencyTypes({ name, version: "" });

			if (files.length === 0) {
				this.logger.warn(`No built-in type definitions found for ${name}`);
				return [];
			}

			// 解码文件内容并过滤空内容
			return files
				.map((item) => {
					try {
						const content = new TextDecoder("utf-8").decode(item.fileData);
						return content.trim();
					} catch (error) {
						this.logger.error(`Failed to decode file ${item.name}:`, error);
						return '';
					}
				})
				.filter(content => content.length > 0);
		} catch (error) {
			this.logger.error(`Failed to get built-in types for ${mod}:`, error);
			return [];
		}
	}
}