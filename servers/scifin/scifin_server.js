// @ts-check
import { createServer } from 'node:http';
import { inspect } from 'node:util';
import { print } from '../../logger.js';
import { awaitConfig } from '../../config.js';
import { logOnErr, connect } from '../../util.js';

const { ...config } = await awaitConfig();
createServer(async function onconnect(req, res) {
    const unbindClientErrorLog = logOnErr(req, 'client');
    const url = req.headers.target;
    print({level: -1}, ['conn', 'prepare'], '%s', url);
    if (req.method?.toUpperCase() !== 'POST') {
        print({level:1}, ['client', 'err'], 'Incorrect method %s, expected POST', req.method);
        return res.writeHead(405).end('Method not allowed');
    }
    if (!url) {
        print({level: 1}, ['client', 'err'], 'No `Target` header given', req.method);
        return res.writeHead(400).end('No `Target` header given');
    }

    if (!authenticate(req)) return res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="proxy"' }).end();

    try {
        const { hostname, port: _port } = new URL('http://' + url);
        const port = _port || '80';
        const ac = new AbortController();
        req.socket.once('close', abort);
        function abort(){ ac.abort(); }
        let target = await connect({hostname, port: +port, type:'http'}, ac.signal);
        req.socket.off('close', abort);
        print({level: -1}, ['conn'], '%s:%s', hostname, port);
        res.writeHead(200, 'Connection established').flushHeaders();
        req.pipe(target);
        target.pipe(res);
        logOnErr(target, 'foreign');
        function cleanup(wasError) {
            if(!wasError){ req.destroy(); target.destroy(); }
        }
        target.once('close', cleanup);
        req.socket.once('close', cleanup);
    } catch (e) {
        const debug = inspect(e);
        if (e?.code == 'ENOTFOUND') res.writeHead(404).end('Host not found', unbindClientErrorLog);
        if (e?.code == 'ERR_INVALID_URL') res.writeHead(400).end('Invalid URL', unbindClientErrorLog);
        else res.writeHead(500).end(e.message || debug, unbindClientErrorLog);
        print({level: 2}, ['connect', 'err'], debug);
    }
}).listen(config.port);

function authenticate(/** @type {import('node:http').IncomingMessage} */ req) {
    return (req.headers['proxy-authorization'] ?? '') == (config.auth??'');
}