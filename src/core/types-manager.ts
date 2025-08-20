import chunk from 'chunk';
import { IDependency, IBuiltinTypes, IInternalOptions, ILogger, IDependencyTypes, ITsExtraLib } from '../types/index';
import { TypesCache } from './types-cache';
import { RegistryFactory } from './registry-factory';
import { BUILTIN_PACKAGES as BUILTIN_LIBS } from '../config';
import { TypesGenerator } from './types-generator';

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
	public async createDenpendencyTypes(dependencies: IDependency[]): Promise<Array<ITsExtraLib>> {
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

		const types: Array<ITsExtraLib> = [];
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
	private async loadSingleDependencyTypes(dependency: IDependency): Promise<Array<ITsExtraLib>> {
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
	public async fetchDependencyTypes(dependency: IDependency): Promise<Array<ITsExtraLib>> {
		try {
			const { registry, name, version } = dependency;

			if (!name) {
				throw new Error('Dependency name cannot be empty');
			}

			let dependencyTypes: IDependencyTypes;

			// 根据不同的注册表获取类型定义文件
			if (registry === "jsr") {
				const jsrRegistry = RegistryFactory.getJSRRegistry();
				dependencyTypes = await jsrRegistry.getDependencyTypes({ name, version });
			} else {
				const npmRegistry = RegistryFactory.getNPMRegistry(this.options.registry);

				// 优先从模块自带类型中查找
				dependencyTypes = await npmRegistry.getDependencyTypes({ name, version });

				// 如果未找到类型定义，再从@types仓库查找
				if (dependencyTypes.files.length === 0 && !name.startsWith('@types/') && !name.startsWith('@')) {
					try {
						dependencyTypes = await npmRegistry.getDependencyTypes({
							name: `@types/${name.replace('@', '').replace('/', '__')}`,
							version
						});
					} catch (error) {
						this.logger.warn(`No type definitions found for @types/${name}:`, error);
					}
				}
			}

			if (dependencyTypes.files.length === 0) {
				this.logger.warn(`No type definition files found for ${name}`);
				return [];
			}

			const typesGenerator = new TypesGenerator(dependency, dependencyTypes);
			return typesGenerator.generate();
		} catch (error) {
			this.logger.error(`Failed to get type definitions for ${dependency.name}:`, error);
		}
		return [];
	}

	/**
	 * 加载内置类型定义
	 */
	public async createBuiltinTypes(): Promise<Array<ITsExtraLib>> {
		try {
			this.logger.info('Starting to load built-in type definitions');

			const builtinEntries = Object.entries(this.options.builtins || {});
			const builtinPromises = builtinEntries
				.filter(([_, enabled]) => enabled)
				.map(async ([name]) => {
					try {
						this.logger.info(`Loading built-in types for ${name}`);
						const types = await this.fetchBuiltinLibTypes(name as IBuiltinTypes);

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
	public async fetchBuiltinLibTypes(lib: IBuiltinTypes): Promise<Array<ITsExtraLib>> {
		const libs: Array<ITsExtraLib> = [];
		try {
			if (!lib) {
				throw new Error('Module name cannot be empty');
			}

			// 根据模块名称确定包名
			const builtinLibTypesName = BUILTIN_LIBS[lib];

			this.logger.info(`Getting built-in ${lib} types: ${builtinLibTypesName}`);

			const npmRegistry = RegistryFactory.getNPMRegistry(this.options.registry);

			// 获取类型定义文件
			const { files } = await npmRegistry.getDependencyTypes({ name: builtinLibTypesName, version: "" });

			if (files.length === 0) {
				this.logger.warn(`No built-in type definitions found for ${lib}`);
				return [];
			}

			// 解码文件内容并过滤空内容
			for (const file of files) {
				try {
					const content = new TextDecoder("utf-8").decode(file.fileData);
					libs.push({ filepath: file.name, content });
				} catch (error) {
					this.logger.error(`Failed to decode file ${file.name}:`, error);
				}
			}
		} catch (error) {
			this.logger.error(`Failed to get built-in types for ${lib}:`, error);
		}
		return libs;
	}
}
