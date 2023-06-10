// @ts-check
import { ServerResponse, createServer } from 'node:http';
import { createServer as createHTTPSServer } from 'node:https';
import { inspect } from 'node:util';
import { connect } from 'node:net';
import { print } from '../../logger.js';

/** @type {import('../../types.js').ServerCreator} */
const create = process.env.SSL_KEY && process.env.SSL_CERT ?
    (options, requestListener) => createHTTPSServer(options, requestListener) :
    (options, requestListener) => createServer(requestListener);

/** @type {import('../../types.js').Config} */
const { sslConfig } = await new Promise(resolve => {
    process.on('message', ({ data, type }) => {
        if (type == 'CONFIG') resolve(data);
    });
    process.send?.({ type: 'REQUEST_CONFIG', data: null });
});

const server = create(sslConfig, async function onconnect(req, res) {
    // Code is mostly based on the `proxy` library.

    const url = req.headers.target;
    req.pause(); // prevent data loss
    if (req.method?.toUpperCase() !== 'POST') {
        print({level:1}, ['client', 'err'], 'Incorrect method %s, expected POST', req.method);
        return res.writeHead(405).end();
    }
    if (!url) {
        print({level: 1}, ['client', 'err'], 'No `Target` header given', req.method);
        return res.writeHead(400).end('No `Target` header given');
    }

    if (!authenticate(req)) {
        res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="proxy"' });
        res.end();
        return;
    }

    req.resume();

    req.once('error', (/** @type {NodeJS.ErrnoException} */e) =>
        print({level: 2}, ['client', 'err'], e.code)
    );

    try {
        const { hostname, port: _port } = new URL('http://' + url);
        const port = _port || '80';
        const target =
            await new Promise((resolve, reject) => {
                const socket = connect(
                    { host: hostname, port: +port },
                    () => { socket.off('error', reject); resolve(socket) }
                );
                socket.once('error', reject)
            });
        res.writeHead(200, 'Connection established');
        res.flushHeaders();
        req.pipe(target);
        target.pipe(res);
        target.once('error', (/** @type {NodeJS.ErrnoException} */e) =>
            print({level: 2}, ['foreign', 'err'], e.code)
        )
        function cleanup() {
            target.off('close', cleanup);
            target.end(() => target.destroy());
            res.off('close', cleanup);
            res.end(() => res.destroy());
            print({level: -1}, ['conn', 'cleanup'], '%s:%s', hostname, port);
        }
        target.once('close', cleanup)
        res.once('close', cleanup)
    } catch (e) {
        const debug = inspect(e);
        if (e?.code == 'ENOTFOUND') res?.writeHead(404).end('Host not found');
        if (e?.code == 'ERR_INVALID_URL') res?.writeHead(400).end('Invalid URL');
        else if (res)
            res
                .writeHead(500, { 'Content-Type': 'text/plain', 'Content-Length': debug.length })
                .end(debug);
        print({level: 2}, ['connect', 'err'], debug);
    }
})
    .on('connect', (req, /** @type {import('net').Socket} */socket) => {
        socket.once('error', (/** @type {NodeJS.ErrnoException} */e) =>
            print({level: 2}, ['client', 'err'], e.code)
        );
        const res = new ServerResponse(req);
        res.assignSocket(socket);
        print({level: 1}, ['client', 'err'], 'Incorrect method %s, expected POST', req.method);
        return res.writeHead(405).end();
    })
    .listen(process.env.PORT);

function authenticate(/** @type {import('http').IncomingMessage} */ req) {
    return (req.headers['proxy-authorization'] ?? '') == (process.env.AUTH ?? '')
}