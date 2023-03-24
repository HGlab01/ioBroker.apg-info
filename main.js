'use strict';

/*
 * Created with @iobroker/create-adapter v1.25.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios');
const JsonExplorer = require('iobroker-jsonexplorer');
const stateAttr = require(`${__dirname}/lib/stateAttr.js`); // Load attribute library
const isOnline = require('@esm2cjs/is-online').default;

//global variables


class ApgInfo extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'apg-info',
        });
        this.on('ready', this.onReady.bind(this));
        //this.on('objectChange', this.onObjectChange.bind(this));
        //this.on('stateChange', this.onStateChange.bind(this));
        //this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        JsonExplorer.init(this, stateAttr);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize adapter
        //get adapter configuration
        this.log.info('Started with JSON-Explorer version ' + JsonExplorer.version);

        //get Geodata from configuration
        let obj = await this.getForeignObjectAsync('system.config');
        if (!obj) {
            this.log.error('Adapter was not able to read iobroker configuration');
            this.terminate ? this.terminate(utils.EXIT_CODES.INVALID_CONFIG_OBJECT) : process.exit(0);
            return;
        }

        if (await isOnline() == false) {
            this.log.error('No internet connection detected');
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
            return;
        }
        else {
            this.log.debug('Internet connection detected. Everything fine!');
        }

        const delay = Math.floor(Math.random() * 30000);
        this.log.info(`Delay execution by ${delay}ms to better spread API calls`);
        await this.sleep(delay);

        await JsonExplorer.setLastStartTime();
        let resultPeakHours = await this.ExecuteRequestPeakHours();
        let resultDayAhead = await this.ExecuteRequestDayAhead();

        if (resultPeakHours == 'error' || resultDayAhead == 'error') {
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
        } else {
            this.terminate ? this.terminate(0) : process.exit(0);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            this.unloaded = true;
            callback();
        } catch (e) {
            callback();
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(() => !this.unloaded && resolve(), ms));
    }

    /*
    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    /*
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.debug(`state ${id} deleted`);
        }
    }*/

    /**
     * Retrieves peak hours from REST-API
     */
    async getDataPeakHours() {
        let uri = `https://awareness.cloud.apg.at/api/v1/PeakHourStatus`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);
        return new Promise((resolve, reject) => {
            // @ts-ignore
            axios.get(uri)
                .then((response) => {
                    if (!response || !response.data) {
                        throw new Error(`getDataPeakHours(): Respone empty for URL ${uri} with status code ${response.status}`);
                    } else {
                        this.log.debug(`Response in getDataPeakHours(): [${response.status}] ${JSON.stringify(response.data)}`);
                        console.log(`Response in getDataPeakHours(): [${response.status}] ${JSON.stringify(response.data)}`);
                        resolve(response.data);
                    }
                })
                .catch(error => {
                    console.error('Error in getDataPeakHours(): ' + error);
                    reject(error);
                })
        })
    }

    /**
     * Retrieves marketdata from REST-API
     */
    async getDataDayAhead() {
        let start = (await cleanDate(new Date())).getTime();
        let end = start + 1000 * 60 * 60 * 24 * 2;
        let uri = `https://api.awattar.at/v1/marketdata?start=${start}&end=${end}`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);
        return new Promise((resolve, reject) => {
            // @ts-ignore
            axios.get(uri)
                .then((response) => {
                    if (!response || !response.data) {
                        throw new Error(`getDataDayAhead(): Respone empty for URL ${uri} with status code ${response.status}`);
                    } else {
                        this.log.debug(`Response in getDataDayAhead(): [${response.status}] ${JSON.stringify(response.data)}`);
                        console.log(`Response in getDataDayAhead(): [${response.status}] ${JSON.stringify(response.data)}`);
                        resolve(response.data);
                    }
                })
                .catch(error => {
                    console.error('Error in getDataDayAhead(): ' + error);
                    reject(error);
                })
        })
    }


    async ExecuteRequestDayAhead() {
        try {
            let result = await this.getDataDayAhead();
            this.log.debug(`Day ahead result is: ${JSON.stringify(result.data)}`);

            await JsonExplorer.TraverseJson(result.data, 'marketprice.details', true, true);

            const oneDayTime = 1000 * 60 * 60 * 24;
            let day0 = await cleanDate(new Date());
            let day1 = new Date(day0.getTime() + oneDayTime);

            let jDay0 = {}, jDay1 = {};
            let iHour = 0;
            let sHour = '';

            if (!result.data) {
                this.log.error('No data found in marketprice-result!')
                return 'error';
            }

            for (const idS in result.data) {
                if (!result.data[idS].marketprice) {
                    this.log.error('No marketprice found in marketprice-result!')
                    return 'error';
                }
                this.log.debug(result.data[idS].marketprice);

                iHour = new Date(result.data[idS].start_timestamp).getHours();
                if (iHour < 9) sHour = '0' + String(iHour) + '_to_' + '0' + String(iHour + 1);
                else if (iHour == 9) sHour = '0' + String(iHour) + '_to_' + String(iHour + 1);
                else sHour = String(iHour) + '_to_' + String(iHour + 1);

                let dateToCheck = await cleanDate(new Date(result.data[idS].start_timestamp));
                let marketprice = result.data[idS].marketprice / 10;
                if (dateToCheck.getTime() == day0.getTime()) jDay0[sHour] = marketprice;
                else if (dateToCheck.getTime() == day1.getTime()) jDay1[sHour] = marketprice;
            }
            await JsonExplorer.TraverseJson(jDay0, 'marketprice.today', true, true);
            await JsonExplorer.TraverseJson(jDay1, 'marketprice.tomorrow', true, true);

            await JsonExplorer.checkExpire('marketprice.*');

            // check for outdated states to be deleted
            let statesToDelete = await this.getStatesAsync('marketprice.*');
            for (const idS in statesToDelete) {
                let state = await this.getStateAsync(idS);
                if (state != null && state.val == null) {
                    this.log.debug(`State "${idS}" will be deleted`);
                    await this.delObjectAsync(idS);
                }
            }
        } catch (error) {
            let eMsg = `Error in ExecuteRequestDayAhead(): ${error})`;
            this.log.error(eMsg);
            if (eMsg.includes('getaddrinfo EAI_AGAIN') == false) {
                console.error(eMsg);
                this.sendSentry(error);
            }
        }
    }


    /**
     * Handles json-object and creates states
     */
    async ExecuteRequestPeakHours() {
        try {
            let result = await this.getDataPeakHours();
            this.log.debug(`Peak hour result is: ${JSON.stringify(result)}`);

            const oneDayTime = 1000 * 60 * 60 * 24;
            let day0 = await cleanDate(new Date());
            let day1 = new Date(day0.getTime() + oneDayTime);
            let day2 = new Date(day0.getTime() + oneDayTime * 2);
            let day3 = new Date(day0.getTime() + oneDayTime * 3);
            let day4 = new Date(day0.getTime() + oneDayTime * 4);

            let jDay0 = {}, jDay1 = {}, jDay2 = {}, jDay3 = {}, jDay4 = {}, jDayAll = {};
            let iHour = 0;
            let sHour = '';
            let i = 1;

            if (!result.StatusInfos) {
                this.log.error('No StatusInfos found in peak-result!')
                return 'error';
            }

            for (const idS in result.StatusInfos) {
                if (!result.StatusInfos[idS].utc) {
                    this.log.error('No UTC found in peak-result!')
                    return 'error';
                }
                this.log.debug(result.StatusInfos[idS].utc);

                iHour = new Date(result.StatusInfos[idS].utc).getHours();
                if (iHour < 10) sHour = '0' + String(iHour);
                else sHour = String(iHour);

                let dateToCheck = await cleanDate(new Date(result.StatusInfos[idS].utc));
                if (dateToCheck.getTime() == day0.getTime()) jDay0[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                else if (dateToCheck.getTime() == day1.getTime()) jDay1[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                else if (dateToCheck.getTime() == day2.getTime()) jDay2[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                else if (dateToCheck.getTime() == day3.getTime()) jDay3[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                else if (dateToCheck.getTime() == day4.getTime()) jDay4[sHour] = new Date(result.StatusInfos[idS].utc).getTime();

                if (i < 10) jDayAll['item 0' + i] = new Date(result.StatusInfos[idS].utc).getTime();
                else jDayAll['item ' + i] = new Date(result.StatusInfos[idS].utc).getTime();
                i = i + 1;
            }
            await JsonExplorer.TraverseJson(jDay0, 'peakTime.today', true, true);
            await JsonExplorer.TraverseJson(jDay1, 'peakTime.today+1', true, true);
            await JsonExplorer.TraverseJson(jDay2, 'peakTime.today+2', true, true);
            await JsonExplorer.TraverseJson(jDay2, 'peakTime.today+3', true, true);
            await JsonExplorer.TraverseJson(jDayAll, 'peakTime.allDays', true, true);

            await JsonExplorer.checkExpire('peakTime.*');

            // check for outdated states to be deleted
            let statesToDelete = await this.getStatesAsync('peakTime.*');
            for (const idS in statesToDelete) {
                let state = await this.getStateAsync(idS);
                if (state != null && state.val == null) {
                    this.log.debug(`State "${idS}" will be deleted`);
                    await this.delObjectAsync(idS);
                }
            }

        } catch (error) {
            let eMsg = `Error in ExecuteRequestPeakHours(): ${error})`;
            this.log.error(eMsg);
            if (eMsg.includes('getaddrinfo EAI_AGAIN') == false) {
                console.error(eMsg);
                this.sendSentry(error);
            }
        }
    }


    /**
     * Handles sentry message
     * @param {any} errorObject Error message for sentry
     */
    sendSentry(errorObject) {
        if (errorObject.message && errorObject.message.includes('ETIMEDOUT')) return;
        try {
            if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                const sentryInstance = this.getPluginInstance('sentry');
                if (sentryInstance) {
                    sentryInstance.getSentryObject().captureException(errorObject);
                }
            }
        } catch (error) {
            this.log.error(`Error in function sendSentry(): ${error}`);
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new ApgInfo(options);
} else {
    // otherwise start the instance directly
    new ApgInfo();
}

/**
 * xxxx
 * @param {Date} date
 */
async function cleanDate(date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
}
