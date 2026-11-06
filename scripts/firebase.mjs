import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env };
// A project-local Java runtime is optional. Otherwise use the system Java 21+.
const localJava = join(root, '.local', 'java');
if (existsSync(localJava)) {
  const runtime = readdirSync(localJava).map(name => join(localJava, name))
    .find(path => existsSync(join(path, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')));
  if (runtime) {
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
    env.JAVA_HOME = runtime;
    env[pathKey] = `${join(runtime, 'bin')}${delimiter}${env[pathKey] || ''}`;
  }
}
const child = spawn(process.execPath, [join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'), ...process.argv.slice(2)], {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
