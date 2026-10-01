import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';

function denyNetwork() {
  throw new Error('Network access is disabled in the offline regression suite.');
}

// Fail a regression immediately if it accidentally reaches a live service.
// Native subprocesses are not sandboxed by this guard; these tests invoke only
// Node children, which inherit the same preload through NODE_OPTIONS.
globalThis.fetch = denyNetwork;
net.connect = net.createConnection = denyNetwork;
net.Socket.prototype.connect = denyNetwork;
tls.connect = denyNetwork;
http.request = http.get = https.request = https.get = denyNetwork;
dgram.createSocket = denyNetwork;
syncBuiltinESMExports();
const preload = `--import=${import.meta.url}`;
if (!(process.env.NODE_OPTIONS || '').includes(preload)) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} ${preload}`.trim();
}
