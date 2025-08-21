import ts from "typescript";
import path from "path-browserify";
import {
  IDependency,
  IDependencyTypes,
  ITsExtraLib,
} from "../types/index";

/**
 * 类型生成器
 * 负责将依赖的类型定义文件转换为Monaco编辑器可用的格式
 */
export class TypesGenerator {
  private readonly dependency: IDependency;
  private readonly dependencyTypes: IDependencyTypes;
  private readonly dependencyModuleKey: string;
  private readonly dependencyExportKey: string;

  constructor(dependency: IDependency, dependencyTypes: IDependencyTypes) {
    this.dependency = dependency;
    this.dependencyTypes = dependencyTypes;
    this.dependencyModuleKey = this.getDependencyModuleKey();
    this.dependencyExportKey = this.getDependencyExportKey();
  }

  /**
   * 生成类型定义库
   * @returns 生成的类型定义库数组
   */
  public generate(): Array<ITsExtraLib> {
    const { name, registry } = this.dependency;
    const { entry = "index.d.ts", files } = this.dependencyTypes;

    // JSR 类型文件
    if (registry === 'jsr') {
      return this.generateJsrTypes(files);
    }

    // NPM 类型文件
    return this.generateNpmTypes(name, entry, files);
  }

  /**
   * 生成 JSR 的类型定义
   */
  private generateJsrTypes(files: Array<{ name: string; fileData: Uint8Array }>): Array<ITsExtraLib> {
    return files.map(file => {
      const code = new TextDecoder("utf-8").decode(file.fileData);
      return {
        filepath: file.name,
        content: this.createModuleDeclarationWrap(code)
      }
    });
  }

  /**
   * 生成 NPM 的类型定义
   */
  private generateNpmTypes(
    name: string,
    entry: string,
    files: Array<{ name: string; filename: string; fileData: Uint8Array }>
  ): Array<ITsExtraLib> {
    // 查找入口文件
    const entryFile = this.findEntryFile(name, entry, files);
    if (!entryFile) {
      return [];
    }

    const code = new TextDecoder("utf-8").decode(entryFile.fileData);

    // 处理引用文件
    const referenceTypes = this.getReferencesTypes(code, entryFile, files);
    // 处理模块声明
    const entryTypes = this.getEntryTypes(code, entryFile);

    return [...entryTypes, ...referenceTypes];
  }

  /**
   * 查找入口文件
   */
  private findEntryFile(
    name: string,
    entry: string,
    files: Array<{ name: string; filename: string; fileData: Uint8Array }>
  ) {
    const entryFilename = entry.replace(/^\.\//, "");
    const possibleFilenames = [
      entryFilename,
      `package/${entryFilename}`,
      `${name}/${entryFilename}`,
    ];

    return files.find((file) =>
      possibleFilenames.some((filename) => filename === file.filename)
    );
  }

  /**
   * 获取类型文件中的引用
   */
  private getReferencesTypes(
    code: string,
    entryFile: { name: string; filename: string; fileData: Uint8Array },
    files: Array<{ name: string; filename: string; fileData: Uint8Array }>,
  ): Array<ITsExtraLib> {
    const types: Array<ITsExtraLib> = [];
    const refs = this.getReferencesFromTypesFile(code);
    for (const ref of refs) {
      const filename = path.join(path.dirname(entryFile.name), ref);
      const current = files.find(item => item.name === filename);
      if (current) {
        types.push({
          filepath: current.name,
          content: new TextDecoder("utf-8").decode(current.fileData)
        })
      }
    }
    return types;
  }

  /**
   * 处理模块声明
   */
  private getEntryTypes(
    code: string,
    entryFile: { name: string; filename: string; fileData: Uint8Array },
  ): Array<ITsExtraLib> {
    const types: Array<ITsExtraLib> = [];

    const transformedCode = this.replaceModuleDeclarationWrap(code);

    types.push({
      filepath: entryFile.name,
      content: transformedCode
    });

    // 转换前后代码一致说明entry文件没有模块声明，需要自行创建
    if (code === transformedCode) {
      const entryName = entryFile.name.replace(/\.d\.ts$/, '');
      const entryCode = `import ${this.dependencyExportKey} from "${entryName}";\n  export = ${this.dependencyExportKey};\n`;

      types.push({
        filepath: `${this.dependency.name}/__types__.d.ts`,
        content: this.createModuleDeclarationWrap(entryCode),
      });
    }

    return types;
  }

  /**
   * 从.d.ts文件内容中查找引用
   */
  private getReferencesFromTypesFile(code: string): string[] {
    const refs: string[] = [];
    const sourceFile = ts.createSourceFile(
      `__${this.dependencyExportKey}_temp__.d.ts`,
      code,
      ts.ScriptTarget.Latest,
      true,
    );
    (sourceFile.referencedFiles || []).forEach((item) => {
      refs.push(item.fileName);
    });

    return refs;
  }

  /**
   * 从类型定义文件中提取模块声明信息
   */
  private getModuleDeclarationsFromTypesFile(code: string): string[] {
    const sourceFile = ts.createSourceFile(
      `__${this.dependencyExportKey}_temp__.d.ts`,
      code,
      ts.ScriptTarget.Latest,
      true,
    );

    const declarations: string[] = [];

    const visit = (node: ts.Node): void => {
      // 检查 declare module 和 declare namespace
      if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node?.name)) {
         declarations.push(node.name.getText())
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return declarations;
  }

  /**
   * 转换声明文件中的模块名称
   */
  private replaceModuleDeclarationWrap(code: string): string {
    const declarations = this.getModuleDeclarationsFromTypesFile(code);

    if (declarations.length > 0) {
      const reg = new RegExp(
        `declare\\s+module\\s+["']${this.dependency.name}["']\\s`,
        "g",
      );
      return code.replace(reg, `declare module "${this.dependencyModuleKey}" `);
    }

    return code;
  }

  /**
   * 创建模块声明包装
   */
  private createModuleDeclarationWrap(code: string): string {
    return `declare module '${this.dependencyModuleKey}' {\n${code}\n}`;
  }

  /**
   * 获取依赖模块的唯一键
   */
  private getDependencyModuleKey(): string {
    const { version, name, registry } = this.dependency;

    let key = name;
    if (version) {
      key = `${name}@${version}`;
    }
    if (registry) {
      key = `${registry}:${key}`;
    }
    return key;
  }

  /**
   * 获取依赖模块的导出键 
   */
  private getDependencyExportKey(): string {
    const { name } = this.dependency;
    return name.replace(/[\/\-@]/g, '_');
  }
}
