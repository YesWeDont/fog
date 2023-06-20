// @ts-check

import { createConnection as createSciFinConnection } from './scifin_agent.js';
import { createConnection as createHTTPConnection } from './http_agent.js';
import { print } from '../../../logger.js';
import { connect } from '../../../util.js';

/** @typedef {import('node:stream').Duplex} Duplex */
/**
 * @param {import('../../../types.js').Proxy[]} proxies
 * @param {import('../../../types.js').Target} target
 * @param {AbortSignal} signal
 * @returns {Promise<Duplex>}
 */
export async function createConnection(proxies, signal, target){
    print({level: -1}, ['conn', 'init'], 'Final target: %s:%s', target.hostname, target.port);
    /** @type {Promise<Duplex|undefined>} */
    const init = Promise.resolve(undefined);

    // create socket from config...
    const socket = await proxies.reduce(async (prev, curr, index) => {
        let socket = await prev;
        let next = proxies[index + 1] || target;
        if (curr.type == 'scifin')
            return await createSciFinConnection(curr, next, signal, socket);
        else if (curr.type == 'http')
            return await createHTTPConnection(curr, next, signal, socket);
    }, init);
    if(socket) return socket;
    return connect({...target, type:'http'}, signal); // ...but direct mode if no config
}