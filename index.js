// @ts-check
import { print } from './logger.js';
import { parseConfig } from './config.js';
import cluster from 'node:cluster';


let config = await parseConfig(),
    threadLimit = config.threads,
    threads = 0, booted = false;

// @ts-ignore `serialization` is a valid property - it allows Buffers and many other good stuffs to be transferred across threads.
cluster.setupPrimary({ exec: config.src, serialization: 'advanced' });
cluster.fork();

cluster.on('listening', (worker, { addressType, address, port }) => {
    if (threadLimit > ++threads) cluster.fork();
    if(threads == threadLimit) booted = true;
    print({ wid: worker.process.pid }, ['start'], `Listening on ${addressType == 6 || addressType == 'udp6' ? `[${address || '::1'}]` : address || 'localhost'}:${port}`);
});

cluster.on('message', (worker, message) => {
    // when the threads are ready for the config to be recieved, send it.
    if (message.type == 'REQUEST_CONFIG') worker.send({ data: config, type: 'CONFIG' });
    else if (message.type == 'FORCE_EXIT') process.exit(1);
});

cluster.on('exit', worker => {
    if (booted) {
        print({ wid: worker.process.pid, level: 1 }, ['died'], 'Respawning...');
        cluster.fork();
        threads--;
    } else {
        print({ level: 2 }, 'Error occured during startup completed');
        process.exit(1);
    }
});