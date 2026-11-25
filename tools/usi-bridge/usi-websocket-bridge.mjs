#!/usr/bin/env node
/**
 * Zero-dependency WebSocket <-> USI Bridge for joseki-tree (#142).
 * Exposes any local USI-compliant Shogi engine executable over ws://127.0.0.1:<port>
 * so users can connect engines such as YaneuraOu, Suisho, or dlshogi directly from
 * the browser without redistributing third-party binaries or evaluation models.
 *
 * Usage:
 *   node tools/usi-bridge/usi-websocket-bridge.mjs "<path-to-usi-engine>" [--port 9000] [--host 127.0.0.1]
 *
 * Strictly English code and comments (Rule 1).
 */

import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

function parseArgs(argv) {
  let enginePath = '';
  let port = 9000;
  let host = '127.0.0.1';
  let cwd = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && i + 1 < argv.length) {
      port = parseInt(argv[++i], 10);
    } else if (arg === '--host' && i + 1 < argv.length) {
      host = argv[++i];
    } else if (arg === '--cwd' && i + 1 < argv.length) {
      cwd = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      return null;
    } else if (!arg.startsWith('-') && !enginePath) {
      enginePath = arg;
    }
  }

  return { enginePath, port, host, cwd };
}

function encodeWsFrame(opcode, payloadBuffer) {
  const len = payloadBuffer.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuffer]);
}

function encodeWsText(text) {
  return encodeWsFrame(0x1, Buffer.from(text, 'utf8'));
}

function decodeNextWsFrame(buffer) {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLen = secondByte & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < 4) return null;
    payloadLen = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buffer.length < 10) return null;
    payloadLen = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  let maskKey = null;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    maskKey = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLen) return null;

  const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
  if (maskKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return {
    opcode,
    payload,
    bytesConsumed: offset + payloadLen,
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args || !args.enginePath) {
  console.log(
    'Usage: node tools/usi-bridge/usi-websocket-bridge.mjs "<path-to-usi-engine>" [--port 9000] [--host 127.0.0.1] [--cwd "<engine-dir>"]'
  );
  process.exit(args ? 1 : 0);
}

const resolvedEnginePath = path.resolve(args.enginePath);
const engineCwd = args.cwd ? path.resolve(args.cwd) : path.dirname(resolvedEnginePath);

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('joseki-tree USI WebSocket bridge is running.\n');
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || typeof key !== 'string') {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n')
  );

  console.log(`[usi-bridge] Client connected -> spawning ${resolvedEnginePath}`);
  const engineProc = spawn(resolvedEnginePath, [], {
    cwd: engineCwd,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    try {
      if (engineProc.stdin.writable) {
        engineProc.stdin.write('quit\n');
      }
    } catch {
      // Ignore write error on teardown
    }
    setTimeout(() => {
      if (!engineProc.killed) {
        engineProc.kill();
      }
    }, 250);
  };

  const stdoutRl = readline.createInterface({ input: engineProc.stdout });
  stdoutRl.on('line', (line) => {
    if (!socket.destroyed && !closed) {
      socket.write(encodeWsText(line));
    }
  });

  const stderrRl = readline.createInterface({ input: engineProc.stderr });
  stderrRl.on('line', (line) => {
    console.warn(`[usi stderr] ${line}`);
  });

  engineProc.on('error', (err) => {
    console.error('[usi-bridge] Failed to start USI engine process:', err.message);
    if (!socket.destroyed) {
      socket.destroy();
    }
  });

  engineProc.on('exit', (code) => {
    console.log(`[usi-bridge] Engine process exited (code=${String(code)})`);
    if (!socket.destroyed) {
      try {
        socket.end(encodeWsFrame(0x8, Buffer.alloc(0)));
      } catch {
        socket.destroy();
      }
    }
  });

  let rxBuffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    rxBuffer = Buffer.concat([rxBuffer, chunk]);
    while (true) {
      const frame = decodeNextWsFrame(rxBuffer);
      if (!frame) break;
      rxBuffer = rxBuffer.subarray(frame.bytesConsumed);

      if (frame.opcode === 0x8) {
        cleanup();
        socket.end(encodeWsFrame(0x8, Buffer.alloc(0)));
        return;
      }
      if (frame.opcode === 0x9) {
        socket.write(encodeWsFrame(0xA, frame.payload));
        continue;
      }
      if (frame.opcode === 0x1 || frame.opcode === 0x0) {
        const msg = frame.payload.toString('utf8');
        const lines = msg.split(/\r?\n/);
        for (const l of lines) {
          const trimmed = l.trim();
          if (trimmed && engineProc.stdin.writable) {
            engineProc.stdin.write(`${trimmed}\n`);
          }
        }
      }
    }
  });

  socket.on('close', () => {
    console.log('[usi-bridge] Client disconnected');
    cleanup();
  });

  socket.on('error', () => {
    cleanup();
  });
});

server.listen(args.port, args.host, () => {
  console.log(`[usi-bridge] Listening on ws://${args.host}:${args.port}`);
  console.log(`[usi-bridge] Engine executable: ${resolvedEnginePath}`);
});
