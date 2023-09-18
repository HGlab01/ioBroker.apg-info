'use strict';

/*
 * Created with @iobroker/create-adapter v1.25.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios');

const jsonExplorer = require('iobroker-jsonexplorer');
const stateAttr = require(`${__dirname}/lib/stateAttr.js`); // Load attribute library
const isOnline = require('@esm2cjs/is-online').default;

//global variables
let threshold = 10;

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
        jsonExplorer.init(this, stateAttr);
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize adapter
        this.log.info('Started with JSON-Explorer version ' + jsonExplorer.version);

        if (this.config.threshold) threshold = this.config.threshold;
        else this.log.info('Market price threshold not found and set to 10');

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
        await jsonExplorer.sleep(delay);

        await jsonExplorer.setLastStartTime();
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
        let end = start + 1000 * 60 * 60 * 24 * 3;
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

    /**
     * Handles json-object and creates states for market prices
     */
    async ExecuteRequestDayAhead() {
        try {
            let result = await this.getDataDayAhead();
            this.log.debug(`Day ahead result is: ${JSON.stringify(result.data)}`);

            if (!result.data) {
                this.log.error('No data found in marketprice-result!')
                return 'error';
            }
            await jsonExplorer.TraverseJson(result.data, 'marketprice.details', true, true);

            let day0 = await cleanDate(new Date());
            let day1 = await addDays(day0, 1);
            let jDay0 = {}, jDay1 = {}, jDay0BelowThreshold = {}, jDay1BelowThreshold = {}, jDay0AboveThreshold = {}, jDay1AboveThreshold = {};
            let iHour = 0;
            let sHour = '';
            let days0Above = 0, days0Below = 0, days1Above = 0, days1Below = 0;

            for (const idS in result.data) {
                if (!result.data[idS].marketprice && result.data[idS].marketprice != 0) {
                    this.log.error('No marketprice found in marketprice-result!')
                    return 'error';
                }
                this.log.debug(result.data[idS].marketprice);

                iHour = new Date(result.data[idS].start_timestamp).getHours();
                let endHour = new Date(result.data[idS].end_timestamp).getHours();
                do { //if range is more than one hour
                    if (iHour < 9) sHour = '0' + String(iHour) + '_to_' + '0' + String(iHour + 1);
                    else if (iHour == 9) sHour = '0' + String(iHour) + '_to_' + String(iHour + 1);
                    else sHour = String(iHour) + '_to_' + String(iHour + 1);

                    let dateToCheck = await cleanDate(new Date(result.data[idS].start_timestamp));
                    let marketprice = Math.round(result.data[idS].marketprice / 10 * 1000) / 1000;
                    if (dateToCheck.getTime() == day0.getTime()) {
                        jDay0[sHour] = marketprice;
                        if (marketprice < threshold) {
                            jDay0BelowThreshold[sHour] = marketprice;
                            days0Below++;
                        }
                        else {
                            jDay0AboveThreshold[sHour] = marketprice;
                            days0Above++;
                        }
                    }
                    else if (dateToCheck.getTime() == day1.getTime()) {
                        jDay1[sHour] = marketprice;
                        if (marketprice < threshold) {
                            jDay1BelowThreshold[sHour] = marketprice;
                            days1Below++;
                        }
                        else {
                            jDay1AboveThreshold[sHour] = marketprice;
                            days1Above++;
                        }
                    }
                    iHour++;
                } while (iHour <= (endHour - 1))
            }

            //put data into an array to be sorted in a later step
            let arrBelow0 = Object.keys(jDay0BelowThreshold).map((key) => [key, jDay0BelowThreshold[key]]);
            let arrBelow1 = Object.keys(jDay1BelowThreshold).map((key) => [key, jDay1BelowThreshold[key]]);
            let arrAll0 = Object.keys(jDay0).map((key) => [key, jDay0[key]]);
            let arrAll1 = Object.keys(jDay1).map((key) => [key, jDay1[key]]);

            jDay0BelowThreshold.numberOfHours = days0Below;
            jDay0AboveThreshold.numberOfHours = days0Above;
            jDay1BelowThreshold.numberOfHours = days1Below;
            jDay1AboveThreshold.numberOfHours = days1Above;

            this.log.debug('Marketprice jDay0: ' + JSON.stringify(jDay0));
            this.log.debug('Marketprice jDay0BelowThreshold: ' + JSON.stringify(jDay0BelowThreshold));
            this.log.debug('Marketprice jDay0AboveThreshold: ' + JSON.stringify(jDay0AboveThreshold));
            this.log.debug('Marketprice jDay1: ' + JSON.stringify(jDay1));
            this.log.debug('Marketprice jDay1AboveThreshold: ' + JSON.stringify(jDay1AboveThreshold));
            this.log.debug('Marketprice jDay1BelowThreshold: ' + JSON.stringify(jDay1BelowThreshold));

            await jsonExplorer.traverseJson(jDay0, 'marketprice.today', true, true);
            await jsonExplorer.traverseJson(jDay0BelowThreshold, 'marketprice.belowThreshold.today', true, true);
            await jsonExplorer.traverseJson(jDay0AboveThreshold, 'marketprice.aboveThreshold.today', true, true);
            await jsonExplorer.traverseJson(jDay1, 'marketprice.tomorrow', true, true);
            await jsonExplorer.traverseJson(jDay1BelowThreshold, 'marketprice.belowThreshold.tomorrow', true, true);
            await jsonExplorer.traverseJson(jDay1AboveThreshold, 'marketprice.aboveThreshold.tomorrow', true, true);

            //now it is time to sort by prcie
            arrBelow0.sort(compareSecondColumn);
            arrBelow1.sort(compareSecondColumn);
            arrAll0.sort(compareSecondColumn);
            arrAll1.sort(compareSecondColumn);

            //prepare sorted arrays to create states
            let sortedHours0 = [], sortedHours1 = [], sortedHoursAll0 = [], sortedHoursAll1 = [];
            let sortedHours0Short = [], sortedHours1Short = [], sortedHours0ShortAll = [],sortedHours1ShortAll = [];
            for (const idS in arrBelow0) {
                sortedHours0[idS] = [arrBelow0[idS][0], arrBelow0[idS][1]];
                sortedHours0Short[idS] = Number(arrBelow0[idS][0].substring(0, 2));
            }
            for (const idS in arrBelow1) {
                sortedHours1[idS] = [arrBelow1[idS][0], arrBelow1[idS][1]];
                sortedHours1Short[idS] = Number(arrBelow1[idS][0].substring(0, 2));
            }
            for (const idS in arrAll0) {
                sortedHoursAll0[idS] = [arrAll0[idS][0], arrAll0[idS][1]];
                sortedHours0ShortAll[idS] = Number(arrAll0[idS][0].substring(0, 2));
            }
            for (const idS in arrAll1) {
                sortedHoursAll1[idS] = [arrAll1[idS][0], arrAll1[idS][1]];
                sortedHours1ShortAll[idS] = Number(arrAll1[idS][0].substring(0, 2));
            }
            await jsonExplorer.traverseJson(sortedHours0, 'marketprice.belowThreshold.today_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHours1, 'marketprice.belowThreshold.tomorrow_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHoursAll0, 'marketprice.today_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHoursAll1, 'marketprice.tomorrow_sorted', true, true);
            await jsonExplorer.stateSetCreate('marketprice.belowThreshold.today_sorted.short', 'today sorted short', JSON.stringify(sortedHours0Short));
            await jsonExplorer.stateSetCreate('marketprice.belowThreshold.tomorrow_sorted.short', 'tomorrow sorted short', JSON.stringify(sortedHours1Short));
            await jsonExplorer.stateSetCreate('marketprice.today_sorted.short', 'today sorted short', JSON.stringify(sortedHours0ShortAll));
            await jsonExplorer.stateSetCreate('marketprice.tomorrow_sorted.short', 'tomorrow sorted short', JSON.stringify(sortedHours1ShortAll));

            await jsonExplorer.checkExpire('marketprice.*');

            // check for outdated states to be deleted
            let statesToDelete = await this.getStatesAsync('marketprice.*Threshold.*');
            for (const idS in statesToDelete) {
                let state = await this.getStateAsync(idS);
                if (state != null && state.val == null) {
                    this.log.debug(`State "${idS}" will be deleted`);
                    await this.delObjectAsync(idS);
                }
            }
            statesToDelete = await this.getStatesAsync('marketprice.details.*');
            for (const idS in statesToDelete) {
                let state = await this.getStateAsync(idS);
                if (state && state.val == null) {
                    this.log.debug(`State "${idS}" will be deleted`);
                    await this.delObjectAsync(idS);
                }
            }

        } catch (error) {
            let eMsg = `Error in ExecuteRequestDayAhead(): ${error})`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.sendSentry(error);
        }
    }


    /**
     * Handles json-object and creates states for peak hours
     */
    async ExecuteRequestPeakHours() {
        try {
            let result = await this.getDataPeakHours();
            this.log.debug(`Peak hour result is: ${JSON.stringify(result)}`);

            if (!result.StatusInfos) {
                this.log.error('No StatusInfos found in peak-result!')
                return 'error';
            }

            let day0 = await cleanDate(new Date());
            let day1 = await addDays(day0, 1);
            let day2 = await addDays(day0, 2);
            let day3 = await addDays(day0, 3);
            let day4 = await addDays(day0, 4);
            let jDay0 = {}, jDay1 = {}, jDay2 = {}, jDay3 = {}, jDay4 = {}, jDayAll = {};
            let iHour = 0;
            let sHour = '';
            let i = 1;

            for (const idS in result.StatusInfos) {
                if (!result.StatusInfos[idS].utc) {
                    this.log.error('No UTC found in peak-result!')
                    return 'error';
                }
                this.log.debug(result.StatusInfos[idS].utc);

                iHour = new Date(result.StatusInfos[idS].utc).getHours();

                if (iHour < 9) sHour = 'from_0' + String(iHour) + '_to_' + '0' + String(iHour + 1);
                else if (iHour == 9) sHour = 'from_0' + String(iHour) + '_to_' + String(iHour + 1);
                else sHour = 'from_' + String(iHour) + '_to_' + String(iHour + 1);

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

            this.log.debug('Peak jDay0: ' + JSON.stringify(jDay0));
            this.log.debug('Peak jDay1: ' + JSON.stringify(jDay1));
            this.log.debug('Peak jDay2: ' + JSON.stringify(jDay2));
            this.log.debug('Peak jDay3: ' + JSON.stringify(jDay3));
            this.log.debug('Peak jDay4: ' + JSON.stringify(jDay4));
            this.log.debug('Peak jDayAll: ' + JSON.stringify(jDayAll));

            await jsonExplorer.traverseJson(jDay0, 'peakTime.today', true, true);
            await jsonExplorer.traverseJson(jDay1, 'peakTime.today+1', true, true);
            await jsonExplorer.traverseJson(jDay2, 'peakTime.today+2', true, true);
            await jsonExplorer.traverseJson(jDay3, 'peakTime.today+3', true, true);
            await jsonExplorer.traverseJson(jDay4, 'peakTime.today+4', true, true);
            await jsonExplorer.traverseJson(jDayAll, 'peakTime.allDays', true, true);

            await jsonExplorer.checkExpire('peakTime.*');

            // check for outdated states to be deleted
            let statesToDelete = await this.getStatesAsync('peakTime.*');
            for (const idS in statesToDelete) {
                let state = await this.getStateAsync(idS);
                if (state && state.val == null) {
                    this.log.debug(`State "${idS}" will be deleted`);
                    await this.delObjectAsync(idS);
                }
            }

        } catch (error) {
            let eMsg = `Error in ExecuteRequestPeakHours(): ${error})`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.sendSentry(error);
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
 * sets time to 00:00:00.00000
 * @param {Date} date date to be changed
 */
async function cleanDate(date) {
    date.setHours(0);
    date.setMinutes(0);
    date.setSeconds(0);
    date.setMilliseconds(0);
    return date;
}

/**
 * adds days to a date
 * @param {Date} date origin date
 * @param {number} numberOfDays number of days which origin date shall be added (positive and negative allowes)
 */
async function addDays(date, numberOfDays) {
    const oneDayTime = 1000 * 60 * 60 * 24;
    const oneHourAndOneMinute = 1000 * 60 * 61;
    let originDate = await cleanDate(date);
    let targetDate = new Date(originDate.getTime() + oneDayTime * numberOfDays + oneHourAndOneMinute); //oneHourAndOneMinute to cover Zeitumstellung
    return (await cleanDate(targetDate));
}

function compareSecondColumn(a, b) {
    if (a[1] === b[1]) {
        return 0;
    }
    else {
        return (a[1] < b[1]) ? -1 : 1;
    }
}

const constructObject = arr => {
    return arr.reduce((acc, val) => {
        const [key, value] = val;
        acc[key] = value;
        return acc;
    }, {});
};