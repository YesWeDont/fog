// @ts-check

// import os from 'node:os';
import chalk from 'chalk';
import { loggerConfig, format, print } from './logger.js';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

/** @typedef {Awaited<ReturnType<typeof parseConfig>>} Config */
export async function parseConfig() {
    loggerConfig.defaultWid = 'thrdMgr';
    const defaultThreads = 2;
    const
        parsed = parseArgs({
            options: {
                'help':         { type: 'boolean', short: 'h' },
                'verbose':      { type: 'boolean', short: 'v', multiple: true },
                'port':         { type: 'string', default: process.env.PORT, short: 'p' },
                'config':       { type: 'string', default: process.env.CONFIG, short: 'c' },
                'threads':      { type: 'string', default: defaultThreads+'', short: 't' },
                'auth':         {type: 'string', short: 'a', default: process.env.AUTH ?? ''},
            }, allowPositionals: true, strict: true
        }),
        {values: options, positionals: args} = parsed,
        errPrefix = format({level: 2, lenient: true}, ['config', 'err']),
        port = parseInt(options.port??''),
        threads = parseInt(options.threads??'2');
    loggerConfig.minLevel = (options.verbose?.length||0) * -1;
    print({level: -1}, ['cliCfg'], parsed);
    if(options.help) {
        const help = (await readFile('man.md')).toString()
            .replace(/\*\*(.+?)\*\*/g, chalk.bold('$1'))
            .replace(/$#+ (.+?)/g, chalk.bold('$1'));
        print(['help'], {wid: false}, help);
        process.exit(0);
    }

    if(options.port && (isNaN(port) || port < 0 || !Number.isInteger(port)))
        throw new Error(`${errPrefix} Invalid port (\`${options.port}\`), expected a positive integer`);

    if(isNaN(threads) || threads < 0 || !Number.isInteger(threads))
        throw new Error(`${errPrefix} Invalid number of workers (\`${options.threads}\`), expected a positive integer`);

    print(['cliCfg'], '%d threads on port %s', threads, isNaN(port) ? '<random port>' : port);
    let src = '';
    if(args[0] == 'fog') src = './servers/fog/fog_server.js';
    else if(args[0] == 'scifin') src = './servers/scifin/scifin_server.js';
    else if(args[0] == 'millimol') src = './servers/millimol/millimol_server.js';
    else if(args[0] == 'ws') src = './servers/ws/ws_server.js';
    else if(!args[0]){
        print({level: 1}, 'No server type given, defaulting to fog client');
        src = './servers/fog/fog_server.js';
    }
    if(!src) throw new Error(`${errPrefix} Unrecognised server type ${args[0]}, expected either \`fog\`, \`scifin\`, \`millimol\` or \`ws\`.
${format({level: 1}, ['hint'], 'Try using --verbose to get the list of parsed CLI args')}
`);

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
            if (a.type !== 'scifin' && a.type !== 'http' && a.type !== 'millimol' && a.type !== 'ws')
                throw new Error(`${errPrefix} Invalid config file item #${id}, expected \`type\` to be either \`http\`, \`scifin\`, \`millimol\` or \`ws\``);
            if (a.authorization !== undefined && typeof a.authorization !== 'string')
                throw new Error(`${errPrefix} Invalid config file item #${id}, expected \`authorization\` to be a string if it is provided`);
        });
    }

    return {
        proxies, 
        port: port?port:undefined, threads, src,
        auth: options['auth']??'',
        minLevel: loggerConfig.minLevel
    };
}

/** @returns {Promise<Config>} */
export function awaitConfig(){
    return new Promise(resolve => {
        process.once('message', function onMessage(/** @param {{type: string, data: Config}} arg0 */ { data, type }){
            if (type === 'CONFIG'){
                resolve(data);
                loggerConfig.minLevel = data.minLevel;
            }
        });
        process.send?.({ type: 'REQUEST_CONFIG', data: null });
    });
}