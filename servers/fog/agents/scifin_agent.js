// @ts-check
import http from 'node:http';
import net from 'node:net';
import { Duplex, Transform } from 'node:stream';
import tls from 'node:tls';
import { print } from '../../../logger.js'
/**
 * @param {import('../../../types.js').Proxy} proxy
 * @param {import('../../../types.js').Target} next
 * @param {Duplex} [socket]
 * @returns {Promise<Duplex>}
 * */
export async function createConnection(proxy, next, socket) {
    /** @type {Duplex}*/
    let _socket = await new Promise((resolve, reject) => {
        if (socket && !proxy.tls && !proxy.ssl) return resolve(socket);
        const _socket = proxy.tls || proxy.ssl ?
            tls.connect({ host: proxy.hostname, port: proxy.port, socket: socket }, onceSuccess) :
            net.connect({ host: proxy.hostname, port: proxy.port }, onceSuccess);
        function onceSuccess() {
            resolve(_socket);
            _socket.off('error', onceError);
        }
        function onceError(error) {
            reject(error);
            onceClose();
        }
        function onceClose() {
            _socket.off('error', onceError);
            _socket.off('close', onceClose);
            _socket.off('connect', onceSuccess);
            _socket.off('secureConnect', onceSuccess);
            _socket.destroy();
        }
        _socket.on('error', onceError);
        _socket.on('close', onceClose);
    });
    const request = http.request({
        hostname: proxy.hostname,
        port: proxy.port,
        method: 'POST',
        // @ts-ignore createConnection() can return any value as long as it is a Duplex.
        createConnection: () => _socket,
        headers: { target: next.hostname + ':' + next.port }
    });
    request.setHeader('User-Agent', 'fog/v2.0.1');
    if (proxy.authorization) request.setHeader('Proxy-Authorization', proxy.authorization);
    request.flushHeaders();
    return await (new Promise((resolve, reject) => {
        function onceErrorBeforeConnect(error) {
            request.off('connect', onResponse);
            request.destroy();
            _socket.destroy();
            reject(error);
        }
        request.once('error', onceErrorBeforeConnect);
        request.once('response', onResponse);
        function onResponse(/** @type {http.IncomingMessage} */ response) {
            request.off('error', onceErrorBeforeConnect);
            if(response.statusCode !== 200) return reject({req: request, res: response});
            print({level: -1}, ['scifin','conn'], '%s:%s via proxy %s:%s', next.hostname, next.port, proxy.hostname, proxy.port);
            _socket.off('error', onceErrorBeforeConnect); // _socket is now managed by req and res.
            const duplex = Duplex.from({
                readable: response,
                writable: request
            });
            duplex.once('error', onceError)
            response.once('error', onceError);
            request.once('error', onceError);
            function onceError(/** @type {Error} */ err) {
                response.socket.off('error', onceError);
                // destroy the streams
                response.destroy();
                request.destroy();
                duplex.destroy();
                print({level: 2}, ['http', 'err'], err.message);
            }
            resolve(duplex);
        }
    }));
}