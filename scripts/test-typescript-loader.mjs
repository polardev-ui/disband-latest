import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, nextResolve) {
    // `server-only` is a build-time marker Next strips; emulate that with an
    // empty module so server libs stay importable in tests.
    if (specifier === 'server-only') {
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    }
    let target;
    if (specifier.startsWith('@/')) target = path.resolve('src', specifier.slice(2));
    else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (target) {
      for (const suffix of ['', '.ts', '.tsx']) if (existsSync(target + suffix) && /\.tsx?$/.test(target + suffix)) return { url: pathToFileURL(target + suffix).href, shortCircuit: true };
      // Directory barrels: "@/components/icons" -> src/components/icons/index.tsx.
      for (const suffix of ['/index.ts', '/index.tsx']) if (existsSync(target + suffix)) return { url: pathToFileURL(target + suffix).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText };
    return nextLoad(url, context);
  },
});
