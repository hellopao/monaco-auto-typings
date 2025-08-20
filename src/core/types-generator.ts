import ts from "typescript";
import path from "path-browserify";
import {
  IDeclarationInfo,
  IDependency,
  IDependencyTypes,
  ITsExtraLib,
} from "../types/index";

export class TypesGenerator {
  public dependency: IDependency;
  public dependencyTypes: IDependencyTypes;

  public dependencyModuleKey: string;

  constructor(dependency: IDependency, dependencyTypes: IDependencyTypes) {
    this.dependency = dependency;
    this.dependencyTypes = dependencyTypes;
    this.dependencyModuleKey = this.getDependencyModuleKey();
  }

  public generate() {
    const { name, registry } = this.dependency;
    const { entry = "index.d.ts", files } = this.dependencyTypes;
    if (registry === 'jsr') {
      return files.map(file => {
        return {
          filepath: `file:///${file.name}`,
          content: this.createModuleDeclarationWrap(new TextDecoder("utf-8").decode(file.fileData))
        }
      })
    }
    const entryFile = files.find((file) => {
      const entryFilename = entry.replace(/^\.\//, "");
      const possibleFilenames = [
        entryFilename,
        `package/${entryFilename}`,
        `${name}/${entryFilename}`,
      ];
      return possibleFilenames.some((filename) => filename === file.filename);
    });
    const extraLibs: Array<ITsExtraLib> = [];
    if (!entryFile) {
      return [];
    }
    if (entryFile) {
      const code = new TextDecoder("utf-8").decode(entryFile.fileData);
      const refs = this.getReferencesFromTypesFile(code);
      if (refs.length > 0) {
        const refFiles = refs.map((ref) =>
          files.find((file) =>
            file.name === path.join(path.dirname(entryFile.name), ref)
          )!
        );
        extraLibs.push(...refFiles.map(file => {
          return {
            filepath: `file:///${file.name}`,
            content: new TextDecoder("utf-8").decode(file.fileData)
          }
        }));
      }
      const moduleDeclarations = this.getModuleDeclarationsFromTypesFile(code);
      if (moduleDeclarations.length === 0) {
          extraLibs.push({
            filepath: `file:///${entryFile.name}`,
            content: code,
          }, {
            filepath: `file:///${this.dependency.name}/__types__.d.ts`,
            content: this.createModuleDeclarations('', entryFile.name),
          });
      } else {
        extraLibs.push({
          filepath: `file:///${entryFile.name}`,
          content: this.transformDeclarations(code),
        });
      }
    }
    return extraLibs;
  }

  /**
   * 从.d.ts文件内容中查找引用
   * @param code
   * @returns 提取到的类型声明
   */
  private getReferencesFromTypesFile(code: string): string[] {
    const refs: string[] = [];
    try {
      const sourceFile = ts.createSourceFile(
        "__temp__.d.ts",
        code,
        ts.ScriptTarget.Latest,
        true,
      );
      (sourceFile.referencedFiles || []).forEach((item) => {
        refs.push(item.fileName);
      });
    } catch (error) {
    }

    return refs;
  }

  private getModuleDeclarationsFromTypesFile(code: string): IDeclarationInfo[] {
    const sourceFile = ts.createSourceFile(
      "__temp__.d.ts",
      code,
      ts.ScriptTarget.Latest,
      true,
    );

    const declarations: IDeclarationInfo[] = [];

    function visit(node: ts.Node) {
      // 检查 declare module 和 declare namespace
      if (ts.isModuleDeclaration(node)) {
        const modifiers = (node as any).modifiers;
        if (
          modifiers &&
          modifiers.some((m: any) => m.kind === ts.SyntaxKind.DeclareKeyword)
        ) {
          const isStringLiteral = node.name && ts.isStringLiteral(node.name);
          const kind = isStringLiteral ? "module" : "namespace";
          if (kind === "module") {
            declarations.push({
              type: "declare",
              kind: kind,
              name: node.name?.getText() || "unknown",
              text: node.getText(),
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return declarations;
  }

  private transformDeclarations(
    code: string,
  ): string {
    const declarations = this.getModuleDeclarationsFromTypesFile(code);

    // 检查是否已经有 declare module
    const hasModule = declarations.some((d) =>
      d.type === "declare" && d.kind === "module"
    );

    if (hasModule) {
      const reg = new RegExp(
        `declare\s+module\s+["']${this.dependency.name}["']\s`,
        "g",
      );
      return code.replace(reg, `declare module "${this.dependencyModuleKey}"`);
    }

    return code;
  }

  private createModuleDeclarations(
    code: string,
    ref: string
  ): string {
    const key = this.dependency.name.replace(/[\/\-@]/g, '_')
    let newContent = code + "\n";
    newContent += `declare module '${this.dependencyModuleKey}' {\n`;
    newContent += `import ${key} from "${ref.replace(/\.d\.ts$/, '')}";\n; export = ${key};\n`
    newContent += "}\n";
    return newContent;
  }

  private createModuleDeclarationWrap(code: string) {
    return `declare module '${this.dependencyModuleKey}' {\n${code}\n`
  }

  private getDependencyModuleKey() {
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
}
