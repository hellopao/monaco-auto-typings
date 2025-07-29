# Monaco Auto Typings

Monaco Auto Typings is a plugin that provides automatic dependency type completion for Monaco Editor. It automatically analyzes JavaScript/TypeScript code entered by users, parses dependencies, and adds corresponding type definitions to Monaco Editor, providing better code completion and type checking experience.

## ✨ Features

- 🔍 **Smart Dependency Analysis** - Automatically analyzes import and require statements in code
- 📦 **Multiple Registry Support** - Supports NPM and JSR registries
- 🚀 **High-Performance Cache** - Type definition caching to avoid repeated loading
- ⚡ **Concurrency Control** - Configurable number of concurrent requests for optimized performance
- 🛠️ **Built-in Type Support** - Support for Node.js, Deno built-in types
- 🌐 **Mirror Support** - Support for custom NPM mirrors to improve download speed
- 📝 **Detailed Logging** - Optional detailed log output for debugging

  ![demo](https://github.com/hellopao/monaco-auto-typings/blob/main/test/fixture.gif)

## 📦 Installation

```bash
npm install monaco-auto-typings
```

## 🚀 Quick Start

### Basic Usage

```javascript
import * as monaco from 'monaco-editor';
import autoTypings from 'monaco-auto-typings';

// Create editor
const editor = monaco.editor.create(document.getElementById('editor'), {
  value: 'import React from "react";\n\nconst App = () => {\n  return <div>Hello World</div>;\n};\n',
  language: 'typescript',
  theme: 'vs-dark'
});

// Initialize auto typings plugin
autoTypings(monaco, editor);
```

### Advanced Configuration

```javascript
import * as monaco from 'monaco-editor';
import autoTypings from 'monaco-auto-typings';

const editor = monaco.editor.create(document.getElementById('editor'), {
  value: 'import express from "express";\n\nconst app = express();\n',
  language: 'typescript'
});

// Initialize plugin with custom configuration
autoTypings(monaco, editor, {
  // Use Taobao NPM mirror
  registry: 'https://registry.npmmirror.com',
  // Set debounce time to 500ms
  debounce: 500,
  // Configure built-in types
  builtins: {
    node: true,
    deno: false
  },
  // Enable verbose logging
  verbose: true,
  // Set maximum concurrency
  maxConcurrency: 3
});
```

### Using Class Approach

```javascript
import autoTypings from 'monaco-auto-typings';

const disposable = autoTypings(monaco, editor, {
  registry: 'https://registry.npmjs.org',
  verbose: true
});

// disposable.dispose();
```

## ⚙️ Configuration Options

| Option | Type | Default | Description |
|------|------|--------|------|
| `registry` | `string` | `"https://registry.npmjs.org"` | NPM mirror URL |
| `debounce` | `number` | `300` | Code analysis debounce time (ms) |
| `verbose` | `boolean` | `false` | Enable detailed logging |
| `maxConcurrency` | `number` | `5` | Maximum concurrent requests |
| `builtins` | `object` | See below | Built-in type support configuration |

### Built-in Type Configuration

| Option | Type | Default | Description |
|------|------|--------|------|
| `builtins.typescript` | `boolean` | `true` | Load TypeScript built-in types |
| `builtins.node` | `boolean` | `true` | Load Node.js types |
| `builtins.deno` | `boolean` | `false` | Load Deno types |

## 🌐 Common NPM Mirrors

```javascript
// Official mirror
registry: 'https://registry.npmjs.org'

// Taobao mirror
registry: 'https://registry.npmmirror.com'

// CNPM mirror
registry: 'https://r.cnpmjs.org'

```

## 🔧 Development

### Requirements

- Node.js >= 16.0.0
- TypeScript >= 5.0.0

### Local Development

```bash
# Clone project
git clone https://github.com/hellopao/monaco-auto-typings.git
cd monaco-auto-typings

# Install dependencies
npm install

# Development mode (watch file changes)
npm run dev

# Build project
npm run build

# Run tests
npm test

```

## 📝 How It Works

1. **Code Analysis**: The plugin monitors editor content changes and uses TypeScript compiler API to analyze import statements in the code
2. **Dependency Extraction**: Extracts dependency information (package name, version, etc.) from import statements
3. **Type Acquisition**: Retrieves type definition files from npm or JSR
4. **Type Injection**: Adds the retrieved type definitions to Monaco Editor, enabling code completion and type checking

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## 📞 Support

If you find this project useful, please give it a ⭐️!

For questions or suggestions, please contact:

- Submit an [Issue](https://github.com/hellopao/monaco-auto-typings/issues)
