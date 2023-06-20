// @ts-check
import { createServer } from 'node:http';
import { inspect } from 'node:util';
import { print } from '../../logger.js';
import { awaitConfig } from '../../config.js';
import { logOnErr, connect } from '../../util.js';
import { WebSocketServer, createWebSocketStream } from 'ws';

const { ...config } = await awaitConfig();
const wss = new WebSocketServer({ noServer: true });
createServer((req, res)=>res.writeHead(426).end('Upgrade required'))
    .on('upgrade', async function onupgrade(req, socket, head){
        const url = req.headers.target,
            unbindClientErrorLog = logOnErr(req, 'client');
        print({level: -1}, ['conn', 'prepare'], '%s', url);
        if (!url) {
            print({level: 1}, ['client', 'err'], 'No `Target` header given', req.method);
            return socket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 24\r\n\r\nNo `Target` header given');
        }
    
        if (!authenticate(req)) return socket.end('HTTP/1.1 407 Proxy Authorization Needed\r\nProxy-Authenticate: Basic realm="proxy"\r\n\r\n'); 

        try {
            const { hostname, port: _port } = new URL('http://' + url);
            const port = _port || '80';
            const ac = new AbortController();
            req.socket.once('close', abort); function abort(){ ac.abort(); }
            const target = await connect({hostname, port: +port, type:'http'}, ac.signal);
            print({level: -1}, ['conn'], '%s:%s', hostname, port);
            logOnErr(target, 'foreign');
            wss.handleUpgrade(req, socket, head, client=>{
                req.socket.off('close', abort); unbindClientErrorLog();
                const stream = createWebSocketStream(client);
                logOnErr(stream, 'client');
                stream.pipe(target); target.pipe(stream);
                target.once('close', destroy); stream.once('close', destroy);
                function destroy(){ stream.destroy(); target.destroy(); }
            });
        } catch (e) {
            const debug = inspect(e);
            if (e?.code == 'ENOTFOUND') socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 14\r\n\r\nHost not found', unbindClientErrorLog);
            if (e?.code == 'ERR_INVALID_URL') socket.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 11\r\n\r\nInvalid URL', unbindClientErrorLog);
            else socket.end(
                `HTTP/1.1 500 Internal Server Error\r\nContent-Length: ${(e.message || debug).length}\r\n\r\n${(e.message || debug).length}`,
                unbindClientErrorLog
            );
            print({level: 2}, ['connect', 'err'], debug);
        }
    })
    .listen(config.port);

function authenticate(/** @type {import('node:http').IncomingMessage} */ req) {
    return (req.headers['proxy-authorization'] ?? '') == (config.auth??'');
}