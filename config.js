// @ts-check

// import os from 'node:os';
import chalk from 'chalk';
import { loggerConfig, format, print } from './logger.js'
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

/** @typedef {Awaited<ReturnType<typeof parseConfig>>} Config */
export async function parseConfig() {
    loggerConfig.defaultWid = 'threadMgr';
    const defaultThreads = 2;
    const parsed = parseArgs({
        options: {
            'help': { type: 'boolean', short: 'h' },
            'verbose': { type: 'boolean', short: 'v', multiple: true },
            'port': { type: 'string', default: process.env.PORT, short: 'p' },
            'config': { type: 'string', default: process.env.CONFIG, short: 'c' },
            'threads': { type: 'string', default: defaultThreads+'', short: 't' },
            'auth': {type: 'string', short: 'a', default: process.env.AUTH ?? ''},
            'looseTLS': { type: 'boolean', short: 'l', default: false },
            'https-cert': { type: 'string', short: 'C', default: process.env.HTTPS_CERT },
            'https-key': { type: 'string', short: 'k', default: process.env.HTTPS_KEY },
            'admin-secret': {type: 'string', short: 's', default: process.env.SECRET},
        }, allowPositionals: true, strict: true
    }),
    {values: options, positionals: args} = parsed,
    errPrefix = format({level: 2, lenient: true}, ['config', 'err']),
    port = parseInt(options.port??''),
    threads = parseInt(options.threads??'');
    loggerConfig.minLevel = (options.verbose?.length||0) * -1;
    if(options.help) {
        const b = chalk.bold;
        const help = `fog(1) man page
Name
    ${b('fog')} - Robust composition of proxies, much like function composition: f∘g(x)=f(g(x)).
Synopsis
    ${b('fog')} [${b('-h')} | ${b('--help')}]
    ${b('fog')} [${b('-v')} | ${b('--verbose')}] [${b('-p')} | ${b('--port')} port] [${b('-c')} | ${b('--config')} configFilePath] [${b('-t')} | ${b('--threads')} threadCount] [${b('-a')} | ${b('--auth')} authorizationHeader] [${b('l')} | ${b('--looseTLS')}] [${b('-k')} | ${b('--https-key')} keyFile] [${b('-k')} | ${b('--https-cert')} certFile] [${b('-s')} | ${b('--admin-secret')} secret] [server type]
Description
    ${b('fog')} chains multiple proxies together and hosts the result of "composing" these proxies together on a local machine. Alternatively it can also host \`scifin\` proxies.
    Options that ${b('fog')} understands:
    ${b('-h')} | ${b('--help')}
        Display this help page
    ${b('-v')} | ${b('--verbose')}
        Produce more detailed logs
    ${b('-p')} | ${b('--port')} port
        Selects which port the resultant server is hosted on
    ${b('-c')} | ${b('--config')}
        Select the proxy config file for fog server (only for fog servers)
Examples
    ${b('fog')} # Hosts a direct HTTP proxy server on a random port
    ${b('fog')} -vvc ./config.json -p1080 fog # Host a fog server with servers defined by \`config.json\`, very verbose, on port 1080
    ${b('fog')} scifin # Hosts a scifin server on a random port`;
        print(['help'], {wid: false}, help);
        process.exit(0);
    }

    if(options.port && (isNaN(port) || port < 0 || !Number.isInteger(port)))
        throw new Error(`${errPrefix} Invalid port, expected a positive integer`);

    if(options.threads && (isNaN(threads) || threads < 0 || !Number.isInteger(threads)))
        throw new Error(`${errPrefix} Invalid number of workers, expected a positive integer`);

    print({level: 1}, ['cli-config', 'load'], 'Using %d threads on port %s', threads, isNaN(port)?'<random port>':port);
    let src = '';
    if(args[0] == 'fog') src = './servers/fog/fog_server.js';
    else if(args[0] == 'scifin') src = './servers/scifin/scifin_server.js';
    else if(!args[0]){
        print({level: 1}, 'No server type given, defaulting to fog client');
        src = './servers/fog/fog_server.js';
    }
    if(!src) throw new Error(format({level: 2}, 'Unrecognised server type, expected either `fog` or `scifin`'))

    print({level: -1}, ['load'], src);
    
    /** @type {import('./types.js').Proxy[]} */
    let proxies = [];
    if(src == './servers/fog/fog_server.js'){
        let configContents = '[]';
        if (options.config){
            print(['config', 'load'], options.config);
            configContents = (await readFile(options.config)).toString();
        }
        if(configContents == '[]') print({level: 1}, 'No or empty config given (use -c), using direct mode');

        try { proxies = JSON.parse(configContents); }
        catch (e) { throw new Error(errPrefix+' Expected JSON format config file '); }
        if (!(proxies instanceof Array))
            throw new Error(errPrefix+' Expected config to be an array of proxies');
        proxies.forEach((a, id) => {
            if (typeof a.hostname !== 'string')
                throw new Error(`${errPrefix} Invalid config file item #${id}, expected \`hostname\` to be a string`);
            if (typeof a.port !== 'number')
                throw new Error(`${errPrefix} Invalid config file item #${id}, expected \`port\` to be a number`);
            if (a.type !== 'scifin' && a.type !== 'http')
                throw new Error(`${errPrefix} Invalid config file item #${id}, expected \`type\` to be either \`http\` or \`scifin\``);
            if (a.authorization !== undefined && typeof a.authorization !== 'string')
                throw new Error(`${errPrefix} Invalid config file item #${id}, expected \`authorization\` to be a string if it is provided`);
            if (a.tls !== undefined && typeof a.tls !== 'boolean')
                throw new Error(`${errPrefix} Invalid config file item #${id}, expected \`tls\` to be a boolean if it is provided`);
        });
    }
    
    const sslConfig = {};
    
    if(options['https-cert']) sslConfig.cert = await readFile(options['https-cert']);
    if(options['https-key']) sslConfig.key = await readFile(options['https-key']);

    return {
        ssl: sslConfig,
        proxies, 
        port: port?port:undefined, threads, src,
        looseTLS: options.looseTLS,
        secret: options['admin-secret'],
        auth: options['auth'],
        minLevel: loggerConfig.minLevel
    }
}

/** @returns {Promise<Config>} */
export function awaitConfig(){
    return new Promise(resolve => {
        /** @param {{type: string, data: Config}} arg0 */
        function onMessage({ data, type }){
            if (type === 'CONFIG'){
                resolve(data);
                loggerConfig.minLevel = data.minLevel;
                if(data.looseTLS)
                    process.env.NODE_TLS_REJECT_UNAUTHORISED = '0';
                process.off('message', onMessage);
            }
        }
        process.on('message', onMessage);
        process.send?.({ type: 'REQUEST_CONFIG', data: null });
    });
}