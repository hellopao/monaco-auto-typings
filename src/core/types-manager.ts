import chunk from 'chunk';
import { IDependency, IBuiltinLib, IInternalOptions, ILogger, IDependencyTypes, ITsExtraLib } from '../types/index';
import { getDependencyTypesFromNpmRegistry, getDependencyTypesFromJsrRegistry } from './types-fetcher';
import { BUILTIN_PACKAGES as BUILTIN_LIBS } from '../config';
import { TypesGenerator } from './types-generator';

/**
 * 类型管理器
 * 负责协调类型的获取、生成和缓存
 */
export class TypesManager {
	private options: IInternalOptions;
	private logger: ILogger;

	// 缓存相关属性
	private typesCache = new Set<string>();
	private loadingDependencies = new Set<string>();

	/**
	 * 创建类型管理器实例
	 */
	constructor(options: IInternalOptions, logger: ILogger) {
		this.options = options;
		this.logger = logger;
	}

	/**
	 * 生成依赖的类型定义
	 */
	public async createDenpendenciesExtraLibs(dependencies: IDependency[]): Promise<Array<ITsExtraLib>> {
		if (dependencies.length === 0) {
			this.logger.info('No external dependencies found');
			return [];
		}

		this.logger.info(`Found ${dependencies.length} dependencies:`, dependencies.map(d => d.name));

		// 过滤已加载和正在加载的依赖
		const newDependencies = dependencies.filter(dep => {
			const key = this.getDependencyKey(dep);
			return !this.typesCache.has(key) && !this.loadingDependencies.has(key);
		});

		if (newDependencies.length === 0) {
			this.logger.info('All dependency type definitions are already loaded');
			return [];
		}

		// 限制并发数量
		const chunks: Array<IDependency[]> = chunk(newDependencies, this.options.maxConcurrency);

		const libs: Array<ITsExtraLib> = [];
		for (const chunk of chunks) {
			const result = await Promise.all(
				chunk.map(async dependency => {
					const types = await this.loadSingleDependencyTypes(dependency);
					if (!types) return [];
					const typesGenerator = new TypesGenerator(dependency, types);
					const result = typesGenerator.generate();
					return result;
				})
			);
			libs.push(...result.flat());
		}
		return libs;
	}

	/**
	 * 加载单个依赖的类型定义
	 */
	private async loadSingleDependencyTypes(dependency: IDependency): Promise<IDependencyTypes | null> {
		const key = this.getDependencyKey(dependency);

		if (this.typesCache.has(key) || this.loadingDependencies.has(key)) {
			return null;
		}

		this.loadingDependencies.add(key);
		this.typesCache.add(key);

		try {
			this.logger.info(`Loading type definitions for ${dependency.name}`);
			const types = await this.fetchDependencyTypes(dependency);

			return types;
		} catch (error) {
			this.logger.error(`Failed to load type definitions for ${dependency.name}:`, error);
			return null;
		} finally {
			this.loadingDependencies.delete(key);
		}
	}

	/**
	 * 获取依赖的类型
	 */
	public async fetchDependencyTypes(dependency: IDependency): Promise<IDependencyTypes | null> {
		try {
			const { registry, name, version } = dependency;

			if (!name) {
				throw new Error('Dependency name cannot be empty');
			}

			let dependencyTypes: IDependencyTypes;

			// 根据不同的源获取类型定义文件
			if (registry === "jsr") {
				dependencyTypes = await getDependencyTypesFromJsrRegistry(name, version);
			} else {
				// 优先从模块自带类型中查找
				dependencyTypes = await getDependencyTypesFromNpmRegistry(name, version, this.options.registry);

				// 如果未找到类型定义，再从@types仓库查找
				if (dependencyTypes.files.length === 0 && !name.startsWith('@types/') && !name.startsWith('@')) {
					try {
						dependencyTypes = await getDependencyTypesFromNpmRegistry(
							`@types/${name.replace('@', '').replace('/', '__')}`,
							version, this.options.registry
						);
					} catch (error) {
						this.logger.warn(`No type definitions found for @types/${name}:`, error);
					}
				}
			}

			return dependencyTypes;
		} catch (error) {
			this.logger.error(`Failed to get type definitions for ${dependency.name}:`, error);
		}
		return null;
	}

	/**
	 * 加载内置类型定义
	 */
	public async createBuiltinExtraLibs(libs: IBuiltinLib[]): Promise<Array<ITsExtraLib>> {
		try {
			this.logger.info('Starting to load built-in type definitions');

			const result = await Promise.all(libs.map(async name => {
				try {
					this.logger.info(`Loading built-in types for ${name}`);
					const types = await this.fetchBuiltinLibTypes(name as IBuiltinLib);

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
			}));
			return result.flat();
		} catch (error) {
			this.logger.error('Error loading built-in type definitions:', error);
			return []
		}
	}

	/**
	 * 获取内置类型定义
	 */
	public async fetchBuiltinLibTypes(lib: IBuiltinLib): Promise<Array<ITsExtraLib>> {
		const libs: Array<ITsExtraLib> = [];
		try {
			if (!lib) {
				throw new Error('Module name cannot be empty');
			}

			// 根据模块名称确定包名
			const builtinLibTypesName = BUILTIN_LIBS[lib];

			this.logger.info(`Getting built-in ${lib} types: ${builtinLibTypesName}`);

			// 获取类型定义文件
			const { files } = await getDependencyTypesFromNpmRegistry(builtinLibTypesName, "", this.options.registry);

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

	/**
	 * 从依赖生成缓存键
	 */
	private getDependencyKey(dependency: IDependency): string {
		return `${dependency.name}@${dependency.version || 'latest'}`;
	}

}
