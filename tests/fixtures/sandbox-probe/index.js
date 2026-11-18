// Test fixture for sandbox integration tests. Not a Graveyard package.
// probe(cmd, arg): attempts one forbidden or noisy action. Errors are returned as
// { threw, name, code, message } so tests can assert on the error code, except for
// the `net:*` commands, which let the error propagate (the sandbox records name and message).
function caught(fn) {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { threw: true, name: e && e.name, code: e && e.code, message: String(e && e.message) };
  }
}
const net = {
  fetch: (u) => fetch(u),
  http: (u) => require('http').request(u),
  'node:http': (u) => require('node:http').request(u),
  https: (u) => require('https').request(u),
  'node:https': (u) => require('node:https').request(u),
  net: (u) => require('net').connect(Number(new URL(u).port), '127.0.0.1'),
  'node:net': (u) => require('node:net').connect(Number(new URL(u).port), '127.0.0.1'),
  dgram: () => require('dgram').createSocket('udp4'),
  'node:dgram': () => require('node:dgram').createSocket('udp4'),
  tls: (u) => require('tls').connect(Number(new URL(u).port), '127.0.0.1'),
  'node:tls': (u) => require('node:tls').connect(Number(new URL(u).port), '127.0.0.1'),
  dns: () => require('dns').lookup('localhost', () => {}),
  'node:dns': () => require('node:dns').lookup('localhost', () => {}),
  'dns/promises': () => require('dns/promises').lookup('localhost'),
  'node:dns/promises': () => require('node:dns/promises').lookup('localhost'),
};
module.exports = function probe(cmd, arg) {
  if (cmd.startsWith('net:')) return net[cmd.slice(4)](arg);
  switch (cmd) {
    case 'write':
      return caught(() => require('fs').writeFileSync(arg, 'x'));
    case 'spawn':
      return caught(() => require('child_process').spawn(process.execPath, ['-e', '0']));
    case 'worker':
      return caught(() => new (require('worker_threads').Worker)('0', { eval: true }));
    case 'dlopen':
      return caught(() => process.dlopen({ exports: {} }, arg));
    case 'read':
      return caught(() => require('fs').readFileSync(arg, 'utf8').length);
    case 'env':
      return { key: process.env.GROQ_API_KEY === undefined ? 'undefined' : 'set', count: Object.keys(process.env).length, keys: Object.keys(process.env) };
    case 'pollute':
      Object.prototype.revenantPolluted = 1;
      return 'polluted';
    case 'check':
      return ({}).revenantPolluted === undefined ? 'clean' : 'dirty';
    case 'pid':
      return process.pid;
    case 'big':
      return 'x'.repeat(arg);
    case 'slow':
      for (const end = Date.now() + arg; Date.now() < end; ) { /* busy wait */ }
      return 'slow';
    case 'alloc': {
      const keep = [];
      for (;;) keep.push(new Array(1e5).fill(keep.length));
    }
    case 'ok':
      return arg;
  }
  throw new Error('unknown cmd ' + cmd);
};
