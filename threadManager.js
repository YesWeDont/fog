// @ts-check

import os from 'node:os';
import cluster from 'node:cluster';
import { format, print } from './logger.js'
import { readFile } from 'node:fs/promises';

/** Manage clusters: send config info to child threads & respawn threads if they crashed.
 * 
 * Clusters must send a payload of `{"type":"REQUEST_CONFIG"}` using `process.send()`
 * for the master to respond with a payload containing the config (`{"type":"CONFIG", data:<config>}`)
 * @param {string} src
 * @returns {Promise<void>}
*/
export async function manageThreads(src, configLocation = process.env.CONFIG) {
    let runningThreads = 0;
    const avaliableThreads = os.availableParallelism?os.availableParallelism():os.cpus().length;
    if (!cluster.isPrimary) throw new Error('Thread manager must run on main thread of cluster');
    print({level: -1 }, ['threadMgr', 'setSrc'], src);
    // @ts-ignore `serialization` is a valid property - it allows Buffers and many other good stuffs to be transferred across threads.
    cluster.setupPrimary({ exec: src, serialization: 'advanced' });

    const serverConfig = await parseConfig(configLocation).catch(e => {
        console.error(e);
        process.exit(1);
    });
    const sslConfig = {
        key: process.env.SSL_KEY && await readFile(process.env.SSL_KEY),
        cert: process.env.SSL_CERT && await readFile(process.env.SSL_CERT)
    };
    const config = { serverConfig, sslConfig };

    cluster.fork();

    cluster.on('listening', (worker, { addressType, address, port }) => {
        if (++runningThreads < avaliableThreads) cluster.fork();
        print({ wid: worker.process.pid }, ['start'], `Listening on ${addressType == 6 || addressType == 'udp6' ? `[${address || '::1'}]` : address || 'localhost'}:${port}`);
    });

    cluster.on('message', (worker, message) => {
        // when the threads are ready for the config to be recieved, send it.
        if (message.type == 'REQUEST_CONFIG') worker.send({ data: config, type: 'CONFIG' });
        else if (message.type == 'FORCE_EXIT') process.exit(1);
    });

    cluster.on('exit', (worker, code, _) => {
        if (runningThreads == avaliableThreads) {
            print({ wid: worker.process.pid, level: 1 }, ['died'], 'Respawning...');
            cluster.fork();
        }
        else {
            print({ level: 2 }, 'Error occured during startup');
            process.exit(1);
        }
    });
}

/** @param {string?} [file] */
async function parseConfig(file) {
    const fileContents = file ? (await readFile(file)).toString() : '[]'
    let config;
    const err = format({level: 2, lenient: true}, ['config', 'err']);
    try { config = JSON.parse(fileContents); }
    catch (e) { throw new Error(err+' Expected JSON format config file'); }
    if (!(config instanceof Array))
        throw new Error('[err: config] Expected config to be an array of proxies');
    config.forEach((a, id) => {
        if (typeof a.hostname !== 'string')
            throw new Error(`${err} Invalid config file item #${id}, expected \`hostname\` to be a string`);
        if (typeof a.port !== 'number')
            throw new Error(`${err} Invalid config file item #${id}, expected \`port\` to be a number`);
        if (a.type !== 'scifin' && a.type !== 'http')
            throw new Error(`${err} Invalid config file item #${id}, expected \`type\` to be either \`http\` or \`scifin\``);
        if (a.authorization !== undefined && typeof a.authorization !== 'string')
            throw new Error(`${err} Invalid config file item #${id}, expected \`authorization\` to be a string if it is provided`);
        if (a.tls !== undefined && typeof a.tls !== 'boolean')
            throw new Error(`${err} Invalid config file item #${id}, expected \`tls\` to be a boolean if it is provided`);
    });
    if (file) print(['config', 'load'], 'Loaded config %s', file);
    else print({level: 1}, 'No config given (use CONFIG env variable), using direct mode');
    return config
}