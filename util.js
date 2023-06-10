import pkg from './packageJson.cjs';
export const version = pkg.version;
import { print } from './logger.js';
/** @param {import('node:events').EventEmitter} ee */
export function logOnErr(ee, scope=''){
    /** @param {NodeJS.ErrnoException} err */
    function onError(err){ print({level:2}, scope?[scope, 'err']:['err'], err.code); }
    ee.once('error', onError);
    return ()=>ee.off('error', onError);
}
const hopByHopHeaders = [ 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization','te', 'trailers', 'transfer-encoding', 'upgrade' ];
export function removeHopByHop(headers){
    return Object.fromEntries(Object.entries(headers)
        .filter(([name])=>!hopByHopHeaders.includes(name.toLowerCase())) // Get rid of headers if they are deemed 'Hop By Hop'
    );
}