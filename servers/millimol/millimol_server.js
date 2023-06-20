// @ts-check
import { createServer } from 'node:http';
import { inspect } from 'node:util';
import { print } from '../../logger.js';
import { awaitConfig } from '../../config.js';
import { logOnErr, connect } from '../../util.js';

const { ...config } = await awaitConfig();
createServer((req, res)=>res.writeHead(426).end('Upgrade required') )
    .on('upgrade', async function onupgrade(req, socket){
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
            req.socket.off('close', abort);
            print({level: -1}, ['conn'], '%s:%s', hostname, port);
            socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: millimol\r\nConnection: Upgrade\r\n\r\n');
            socket.pipe(target);
            target.pipe(socket);
            logOnErr(target, 'foreign');
            function cleanup(wasError) { if(!wasError){ socket.destroy(); target.destroy(); } }
            target.once('close', cleanup);
            req.socket.once('close', cleanup);
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