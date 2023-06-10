// @ts-check

import { format as utilFormat } from 'node:util';
import cluster from 'node:cluster';
import chalk from 'chalk';

/** @typedef {import('./types').PrintOptions} PrintOptions */
/** @typedef {{opts: Required<PrintOptions>, ev: string[], args: any[]}} ParsedOptions */

export const loggerConfig = {
    lenient: false,
    minLevel: process.env.VERBOSE?-2: 0,
    defaultWid: process&&cluster.isPrimary? false : process.pid+'',
    defaultLevel: 0,
    delegateMaster: true,
    defaultEvNames: {
        '-2': 'debug', '-1': 'verbose', '0': 'log',
        '1': 'warn', '2': 'err'
    },
    levelFormatters: {
        '-2': chalk.dim, '-1': chalk.gray,
        '0': chalk.blue, '1': chalk.yellow,
        '2': chalk.red
    }
}

/**
 * @overload @param {PrintOptions} opts @param {string[]} ev @param {...any} args @returns {ParsedOptions}
 * @overload @param {string[]} ev @param {PrintOptions} opts @param {...any} args @returns {ParsedOptions}
 * @overload @param {PrintOptions} opts @param {...any} args @returns {ParsedOptions}
 * @overload @param {string[]} opts @param {...any} args @returns {ParsedOptions}
 * @overload @param {...any} args @returns {ParsedOptions}
 * @param {...any} params
*/
function parseArgs(...params) {
    let /** @type {PrintOptions} */opts = {}, /** @type {string[]}*/ev = [], ret = '',
        _opts = params[0], _ev = params[1], args = params.slice(2);

    if (!opts) args = params // undefined as first argument: this is neither opts nor ev, so taking it as a initial parameter.
    if (_opts instanceof Array) { // ev as first argument
        ev = _opts
        if (typeof _ev == 'object' && ev) opts = _ev // opts as the second argument
        else if (arguments.length >= 2) args.unshift(_ev);
    } else if (typeof _opts == 'object' && opts) { // opts as first argument
        opts = _opts;
        if (_ev instanceof Array) ev = _ev // ev as second argument: the classic, expected way of calling.
        else if (arguments.length >= 2) args.unshift(_ev); // ev was probably meant to be part of args...
    } else { // first argument was neither opts or ev
        if (arguments.length == 1) args.unshift(_opts);
        else if (arguments.length >= 2) args = params;
    }

    if (opts.wid === true || opts.wid === null || opts.wid === undefined) opts.wid = loggerConfig.defaultWid;
    if (opts.wid === '') opts.wid = false;
    opts.level ??= loggerConfig.defaultLevel;

    if (!(loggerConfig.lenient || opts.lenient)) {
        if (typeof opts.wid !== 'number' && typeof opts.wid !== 'boolean' && typeof opts.wid !== 'string')
            throw new Error(format({ level: 2 }, 'Invalid `opts.wid` passed to `format()`, expected boolean, string or number but instead got %o', opts.wid));
        if (typeof opts.level !== 'number' || opts.level < -2 || opts.level > 2 || !Number.isInteger(opts.level))
            throw new Error(format({ level: 2 }, 'Invalid `opts.level` passed to `format()`, expected integer from -2 to 2 but instead got %o', opts.level));

        ev.forEach(a => {
            if (typeof a !== 'string' || !a) throw new Error(format({ level: 2 }, 'Invalid `ev` passed to `format()`, expected it to be an array of non-empty strings but one of the values was %o', a));
        })
    }

    return { opts, ev, args }
}

/**
 * @overload @param {PrintOptions} opts @param {string[]} ev @param {...any} args @returns {string}
 * @overload @param {string[]} ev @param {PrintOptions} opts @param {...any} args @returns {string}
 * @overload @param {PrintOptions} opts @param {...any} args @returns {string}
 * @overload @param {string[]} opts @param {...any} args @returns {string}
 * @overload @param {...any} args @returns {string}
 * @param {...any} params @returns {string}
*/
export function format(...params) { return formatParsed(parseArgs(...params)); }

/** @param {ParsedOptions} parsed @return {string} */
function formatParsed(parsed) {
    const { opts, ev, args } = parsed;
    let ret = '';

    if (opts.wid) ret += opts.wid.toString();
    let omitWid = opts.wid === false || opts.wid === '';
    if (ev.length > 1) ret += ev.slice(0, -1).reduce((prev, curr) => prev + '-' + curr, '').slice(omitWid ? 1 : 0) + ':' + ev[ev.length - 1];
    else if (ev.length == 1) ret += (omitWid ? '' : '-') + ev[0];
    else ret += (omitWid ? '' : '-') + loggerConfig.defaultEvNames[opts.level];

    const next = utilFormat(...args);
    if (!next && !(loggerConfig.lenient || opts.lenient)) console.warn(format({ ...opts, level: 1 }, 'No arguments passed to log'))

    return loggerConfig.levelFormatters[opts.level]('[' + ret + ']') + (next === '' ? '' : ' ' + next);
}

/**
 * @overload @param {PrintOptions} opts @param {string[]} ev @param {...any} args @returns {void}
 * @overload @param {string[]} ev @param {PrintOptions} opts @param {...any} args @returns {void}
 * @overload @param {PrintOptions} opts @param {...any} args @returns {void}
 * @overload @param {string[]} opts @param {...any} args @returns {void}
 * @overload @param {...any} args @returns {void}
 * @param {...any} params @returns {void}
*/
export const print = loggerConfig.delegateMaster? cluster.isPrimary ?
(()=>{
    cluster.on('message', (_w, message)=>{ if(message.type === 'LOG') printFromParsed(message.data) });
    return doPrint;
})():
(...params)=>{process.send?.({type: 'LOG', data: parseArgs(...params)});}:
doPrint;

/**
 * @overload @param {PrintOptions} opts @param {string[]} ev @param {...any} args @returns {void}
 * @overload @param {string[]} ev @param {PrintOptions} opts @param {...any} args @returns {void}
 * @overload @param {PrintOptions} opts @param {...any} args @returns {void}
 * @overload @param {string[]} opts @param {...any} args @returns {void}
 * @overload @param {...any} args @returns {void}
 * @param {...any} params @returns {void}
*/
function doPrint(...params) { printFromParsed(parseArgs(...params)); }
/** @param {ParsedOptions} parsed */
function printFromParsed(parsed) {
    const str = formatParsed(parsed);
    if(loggerConfig.minLevel > parsed.opts.level) return;
    else if(parsed.opts.level <= 0) console['log'](str);
    else if(parsed.opts.level == 1) console['warn'](str);
    else if(parsed.opts.level == 2) console['error'](str);
}