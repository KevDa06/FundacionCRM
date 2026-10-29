/**
 * Script de Análisis Estático y Validación de Sintaxis para FundaciónCRM
 * Valida sintaxis ESM, detecta dependencias circulares y verifica resolución de imports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, 'src');

const jsFiles = [];
function findJsFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
            findJsFiles(full);
        } else if (full.endsWith('.js')) {
            jsFiles.push(full);
        }
    }
}

findJsFiles(SRC_DIR);

let hasErrors = false;

console.log(`[LINTER] 1. Verificando sintaxis de ${jsFiles.length} archivos JavaScript en src/...`);
for (const file of jsFiles) {
    const rel = path.relative(ROOT_DIR, file);
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf-8' });
    if (res.status !== 0) {
        console.error(`❌ Error de sintaxis en: ${rel}`);
        console.error(res.stderr);
        hasErrors = true;
    }
}

console.log('[LINTER] 2. Verificando dependencias circulares (Ciclos ESM)...');
const graph = {};
for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const imports = [];
    const regex = /(?:import|export)\s+[\s\S]*?from\s+["\x27]([^"\x27]+)["\x27]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const target = match[1];
        if (target.startsWith('.')) {
            let resolved = path.normalize(path.join(path.dirname(file), target));
            if (!resolved.endsWith('.js')) resolved += '.js';
            imports.push(resolved);
        }
    }
    graph[file] = imports;
}

const visited = {};
const recStack = {};
const cycles = [];

function dfs(node, pathArr) {
    visited[node] = true;
    recStack[node] = true;
    pathArr.push(node);

    for (const neighbor of (graph[node] || [])) {
        if (!visited[neighbor]) {
            dfs(neighbor, pathArr);
        } else if (recStack[neighbor]) {
            const cycleStart = pathArr.indexOf(neighbor);
            cycles.push(pathArr.slice(cycleStart).concat(neighbor));
        }
    }

    pathArr.pop();
    recStack[node] = false;
}

for (const f of jsFiles) {
    if (!visited[f]) dfs(f, []);
}

if (cycles.length > 0) {
    console.error(`❌ Se detectaron ${cycles.length} dependencias circulares:`);
    for (const c of cycles) {
        console.error('   ' + c.map(p => path.relative(ROOT_DIR, p)).join(' -> '));
    }
    hasErrors = true;
} else {
    console.log('✅ Cero dependencias circulares detectadas.');
}

console.log('[LINTER] 3. Verificando existencia de imports locales...');
for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const regex = /(?:import|export)\s+[\s\S]*?from\s+["\x27]([^"\x27]+)["\x27]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        const target = match[1];
        if (target.startsWith('.')) {
            let resolved = path.normalize(path.join(path.dirname(file), target));
            if (!resolved.endsWith('.js')) resolved += '.js';
            if (!fs.existsSync(resolved)) {
                console.error(`❌ Archivo importado no existe: ${path.relative(ROOT_DIR, resolved)} (en ${path.relative(ROOT_DIR, file)})`);
                hasErrors = true;
            }
        }
    }
}

if (hasErrors) {
    console.error('\n💥 El análisis estático encontró problemas.');
    process.exit(1);
} else {
    console.log('\n✨ Todos los chequeos estáticos pasaron exitosamente.');
    process.exit(0);
}
