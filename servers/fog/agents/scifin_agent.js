// @ts-check
import http from 'node:http';
import net from 'node:net';
import { Duplex } from 'node:stream';
import tls from 'node:tls';
import { format, print } from '../../../logger.js';
import { version } from '../../../util.js';
/**
 * @param {import('../../../types.js').Proxy} proxy
 * @param {import('../../../types.js').Target} next
 * @param {AbortSignal} signal
 * @param {Duplex} [socket]
 * @returns {Promise<Duplex>}
 * */
export async function createConnection(proxy, next, signal, socket) {
    /** @type {Duplex}*/
    let _socket = await new Promise((resolve, reject)=>{
        if(socket && !proxy.tls && !proxy.ssl) return resolve(socket);
        const _socket = proxy.tls||proxy.ssl?
            tls.connect({host: proxy.hostname, port: proxy.port, socket: socket}, onceSuccess):
            net.connect({host: proxy.hostname, port: proxy.port, signal}, onceSuccess);
        function onceSuccess(){ resolve(_socket); _socket.off('error', reject); socket?.off('error', reject); }
        function onceClose(){
            print({level: -1}, ['conn', 'cleanup'], '%s:%s', proxy.hostname, proxy.port);
            _socket.destroy();
            if(socket) socket.destroy();
        }
        _socket.once('error', reject);
        socket?.once('error', reject);
        _socket.once('close', onceClose);
    });
    const request = http.request({
        hostname: proxy.hostname,
        port: proxy.port, signal,
        method: 'POST',
        // @ts-ignore createConnection() can return any value as long as it is a Duplex.
        createConnection: () => _socket,
        headers: { Target: next.hostname + ':' + next.port }
    });
    request.setHeader('User-Agent', 'fog/v' + version);
    if (proxy.authorization) request.setHeader('Proxy-Authorization', proxy.authorization);
    return await (new Promise((resolve, reject) => {
        function onErrorBeforeConnect(error) {
            request.off('connect', onResponse);
            request.destroy();
            _socket.destroy();
            reject(error);
        }
        request.once('error', onErrorBeforeConnect);
        _socket.once('error', onErrorBeforeConnect);
        request.once('response', onResponse);
        request.flushHeaders();
        function onResponse(/** @type {http.IncomingMessage} */ response) {
            request.off('error', onErrorBeforeConnect);
            _socket.off('error', onErrorBeforeConnect);
            response.once('error', onError);
            request.once('error', onError);
            if(response.statusCode !== 200){
                request.destroy();
                _socket.destroy();
                print(
                    {level: -1}, '%s:%s returned error %d with headers %o',
                    proxy.hostname, proxy.port,
                    response.statusCode, response.headers
                );
                return reject(new Error(format({level: 2}, ['handshake', 'err'], 'Status code during handshake: %d', response.statusCode)));
            }
            print({level: -1}, ['scifin','conn'], '%s:%s via proxy %s:%s', next.hostname, next.port, proxy.hostname, proxy.port);
            const duplex = Duplex.from({
                readable: response,
                writable: request
            });
            duplex.once('close', cleanup);
            function cleanup(){
                response.destroy(); request.end(()=>request.destroy());
                request.off('error', onError);
                response.off('error', onError);
                duplex.destroy();
                _socket.destroy(); // clean up other underlying sockets etc
            }
            function onError(/** @type {NodeJS.ErrnoException} */ err) {
                duplex.emit('error', err);
                print({level: 2}, ['scifin', 'err'], err.code || err.message);
                cleanup();
            }
            resolve(duplex);
        }
    }));
}