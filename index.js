// @ts-check
import { print } from './logger.js';
import { parseConfig } from './config.js';
import cluster from 'node:cluster';


let config = await parseConfig(),
threadLimit = config.threads,
threads = 0;

// @ts-ignore `serialization` is a valid property - it allows Buffers and many other good stuffs to be transferred across threads.
cluster.setupPrimary({ exec: config.src, serialization: 'advanced' });
cluster.fork();

cluster.on('listening', (worker, { addressType, address, port }) => {
    if (threadLimit > ++threads) cluster.fork();
    print({ wid: worker.process.pid }, ['start'], `Listening on ${addressType == 6 || addressType == 'udp6' ? `[${address || '::1'}]` : address || 'localhost'}:${port}`);
});

cluster.on('message', (worker, message) => {
    // when the threads are ready for the config to be recieved, send it.
    if (message.type == 'REQUEST_CONFIG') worker.send({ data: config, type: 'CONFIG' });
    else if (message.type == 'FORCE_EXIT') process.exit(1);
});

cluster.on('exit', (worker, code, _) => {
    if (threadLimit == threads) {
        print({ wid: worker.process.pid, level: 1 }, ['died'], 'Respawning...');
        cluster.fork();
        threads--
    }
    else {
        print({ level: 2 }, 'Error occured during startup');
        process.exit(1);
    }
});