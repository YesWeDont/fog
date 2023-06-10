// @ts-check
import { print } from './logger.js';
/** @param {import('node:events').EventEmitter} ee */
export function logOnErr(ee, scope=''){
    /** @param {NodeJS.ErrnoException} err */
    function onError(err){ print({level:2}, scope?[scope, 'err']:['err'], err.code); }
    ee.once('error', onError);
    return onError;
}