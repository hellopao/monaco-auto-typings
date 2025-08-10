import * as ts from 'typescript';

interface DeclarationInfo {
  type: 'declare' | 'export';
  kind: string;
  name: string;
  text: string;
  line: number;
}

/**
   * 从.d.ts文件内容中查找引用
   * @param code 
   * @returns 提取到的类型声明
   */
export function getReferencesFromTypes(code: string): string[] {
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

function parseDeclarations(code: string): DeclarationInfo[] {
  const sourceFile = ts.createSourceFile(
    '__temp__.d.ts',
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const declarations: DeclarationInfo[] = [];

  function visit(node: ts.Node) {
    const sourceFile = node.getSourceFile();
    const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    // 检查 declare const
    if (ts.isVariableStatement(node)) {
      const modifiers = (node as any).modifiers;
      if (modifiers && modifiers.some((m: any) => m.kind === ts.SyntaxKind.DeclareKeyword)) {
        node.declarationList.declarations.forEach(decl => {
          declarations.push({
            type: 'declare',
            kind: 'const',
            name: decl.name.getText(),
            text: node.getText(),
            line: lineNumber
          });
        });
      }
    }

    // 检查 declare module 和 declare namespace
    if (ts.isModuleDeclaration(node)) {
      const modifiers = (node as any).modifiers;
      if (modifiers && modifiers.some((m: any) => m.kind === ts.SyntaxKind.DeclareKeyword)) {
        const isStringLiteral = node.name && ts.isStringLiteral(node.name);
        const kind = isStringLiteral ? 'module' : 'namespace';

        declarations.push({
          type: 'declare',
          kind: kind,
          name: node.name?.getText() || 'unknown',
          text: node.getText(),
          line: lineNumber
        });
      }
    }

    // 检查 export = 
    if (ts.isExportAssignment(node)) {
      declarations.push({
        type: 'export',
        kind: 'assignment',
        name: node.expression.getText(),
        text: node.getText(),
        line: lineNumber
      });
    }

    // 检查 export as namespace
    if (node.kind === ts.SyntaxKind.NamespaceExportDeclaration) {
      declarations.push({
        type: 'export',
        kind: 'namespace',
        name: (node as any).name?.getText() || 'unknown',
        text: node.getText(),
        line: lineNumber
      });
    }

    // 检查带有 export 修饰符的声明
    const modifiers = (node as any).modifiers;
    if (modifiers && modifiers.some((m: any) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      let kind = 'unknown';
      let name = 'unknown';

      if (ts.isFunctionDeclaration(node)) {
        kind = 'function';
        name = node.name?.getText() || 'anonymous';
      } else if (ts.isClassDeclaration(node)) {
        kind = 'class';
        name = node.name?.getText() || 'anonymous';
      } else if (ts.isInterfaceDeclaration(node)) {
        kind = 'interface';
        name = node.name.getText();
      } else if (ts.isTypeAliasDeclaration(node)) {
        kind = 'type';
        name = node.name.getText();
      } else if (ts.isVariableStatement(node)) {
        kind = 'const';
        name = node.declarationList.declarations.map(d => d.name.getText()).join(', ');
      } else if (ts.isModuleDeclaration(node)) {
        kind = 'module';
        name = node.name?.getText() || 'unknown';
      }

      declarations.push({
        type: 'export',
        kind,
        name,
        text: node.getText(),
        line: lineNumber
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return declarations;
}

export function transformDeclarations(code: string, moduleName: string): string {
  const declarations = parseDeclarations(code);

  // 检查是否已经有 declare module
  const hasModule = declarations.some(d => d.type === 'declare' && d.kind === 'module');

  if (hasModule) {
    return code;
  }

  // 获取所有 export 声明
  const exportDeclarations = declarations.filter(d => d.type === 'export');
  const declareDeclarations = declarations.filter(d => d.type === 'declare');

  if (exportDeclarations.length === 0) {
    console.log(`没有 export 声明，无需转换`);
    return code;
  }

  // 生成新的文件内容
  let newContent = '';

  // 分离 namespace 和 const 声明
  const namespaceDeclarations = declareDeclarations.filter(d => d.kind === 'namespace');
  const constDeclarations = declareDeclarations.filter(d => d.kind === 'const');
  const otherDeclarations = declareDeclarations.filter(d => d.kind !== 'namespace' && d.kind !== 'const');

  // 保留非冲突的 declare 声明（在 module 外部）
  if (otherDeclarations.length > 0) {
    otherDeclarations.forEach(decl => {
      newContent += decl.text + '\n\n';
    });
  }

  // 过滤掉 export as namespace，因为在 declare module 中不需要
  const validExports = exportDeclarations.filter(d => d.kind !== 'namespace');

  // 创建 declare module 包装
  newContent += `declare module '${moduleName}' {\n`;

  // 将 namespace 声明放入 module 中（去掉 declare 关键字）
  namespaceDeclarations.forEach(decl => {
    const namespaceText = decl.text.replace(/^declare\s+/, '');
    const indentedText = namespaceText.split('\n').map(line => '  ' + line).join('\n');
    newContent += indentedText + '\n\n';
  });

  // 将 const 声明放入 module 中（去掉 declare 关键字）
  constDeclarations.forEach(decl => {
    const constText = decl.text.replace(/^declare\s+/, '');
    const indentedText = constText.split('\n').map(line => '  ' + line).join('\n');
    newContent += indentedText + '\n';
  });

  // 将 export 声明放入 module 中
  validExports.forEach(decl => {
    const indentedText = decl.text.split('\n').map(line => '  ' + line).join('\n');
    newContent += indentedText + '\n';
  });

  newContent += '}\n';
  // 写入新文件
  return newContent;
}


