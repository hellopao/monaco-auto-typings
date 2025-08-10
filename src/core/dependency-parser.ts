import isBuiltinModule from "is-builtin-module";
import ts from 'typescript';
import { IDependency } from '../types/index';

// 匹配本地导入路径的正则表达式（如./或/开头的路径）
const LOCAL_IMPORT_REG = /^[\\/|\\.]/;
// 匹配依赖项名称的正则表达式，解析格式如：registry:@scope/name@version
const DEPENDENCY_REG = /^(?:(\w+):)?(?:(@\w+\/)?)([\w\-\.\/]+)(?:@([\w\-\.]+))?$/;

/**
 * 依赖解析器类
 */
export class DependencyParser {
	/**
	 * 从导入语句中提取依赖项信息
	 * @param imports 导入语句数组
	 * @returns 提取的依赖项数组
	 */
	public static getDependenciesFromImports(imports: string[]): IDependency[] {
		const dependencies: IDependency[] = [];

		for (const imp of imports) {
			// 跳过内置模块和本地导入
			if (isBuiltinModule(imp) || LOCAL_IMPORT_REG.test(imp)) {
				continue;
			}

			// 解析导入语句，提取registry、scope、name和version
			const matches = imp.match(DEPENDENCY_REG);
			if (matches) {
				const [_, pkgRegistry, pkgScope, pkgFilePath, pkgVersion] = matches;
				const pkgName = pkgFilePath.split("/").shift();
				const name = pkgScope ? `${pkgScope}${pkgName}` : pkgName!;
				const version = pkgVersion || "";
				const registry = pkgRegistry?.split(':').shift() || "";

				let key = name;
				if (version) {
					key = `${name}@${version}`;
				}
				if (registry) {
					key = `${registry}:${key}`;
				}

				dependencies.push({ name, version, registry, key });
			}
		}

		return dependencies;
	}

	/**
	 * 从源代码中提取所有导入语句
	 * @param code 源代码字符串
	 * @returns 导入语句数组
	 */
	public static getImportsFromSourceCode(code: string): string[] {
		if (!code || !code.trim()) {
			return [];
		}

		const imports: string[] = [];

		try {
			const sourceFile = ts.createSourceFile(
				'__temp__.ts',
				code,
				ts.ScriptTarget.Latest,
				true
			);

			function visitNode(node: ts.Node, dependencies: string[]) {
				// 处理 import 语句
				if (ts.isImportDeclaration(node)) {
					const moduleSpecifier = node.moduleSpecifier;
					if (ts.isStringLiteral(moduleSpecifier)) {
						dependencies.push(moduleSpecifier.text)
					}
				}
				// 处理动态 import()
				else if (ts.isCallExpression(node)) {
					if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
						const arg = node.arguments[0];
						if (ts.isStringLiteral(arg)) {
							dependencies.push(arg.text)
						}
					}
					// 处理 require()
					else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
						const arg = node.arguments[0];
						if (ts.isStringLiteral(arg)) {
							dependencies.push(arg.text)
						}
					}
				}

				// 递归遍历子节点
				ts.forEachChild(node, child => visitNode(child, dependencies));
			}

			visitNode(sourceFile, imports);
		} catch (error) {
			console.error('Failed to parse source code:', error);
		}

		return Array.from(new Set(imports));
	}

	/**
	 * 从.d.ts文件内容中查找引用
	 * @param code 
	 * @returns 提取到的类型声明
	 */
	public static getReferencesFromTypes(code: string): string[] {
		const refs: string[] = [];
		try {
			const sourceFile = ts.createSourceFile(
				'__temp__.d.ts',
				code,
				ts.ScriptTarget.Latest,
				true
			);
			(sourceFile.referencedFiles || []).forEach(item => {
				refs.push(item.fileName)
			})
		} catch (error) {
		}

		return refs;
	}

	/**
	 * 分析代码并返回依赖项
	 * @param code 源代码
	 * @returns 依赖项数组
	 */
	public static analyzeDependencies(code: string): IDependency[] {
		const imports = this.getImportsFromSourceCode(code);
		return this.getDependenciesFromImports(imports);
	}

}
