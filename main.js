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
const { version } = require('./package.json');
//const jToday = require('./z_TimeChange.json');
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
        let country = '';
        // Initialize adapter
        jsonExplorer.sendVersionInfo(version);
        this.log.info('Started with JSON-Explorer version ' + jsonExplorer.version);

        if (this.config.threshold) threshold = this.config.threshold;
        else this.log.info('Market price threshold not found and set to 10');

        if (this.config.country) country = this.config.country;
        else {
            this.log.error('Country for market not found. Please confifure in Config');
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
        }

        if (await isOnline() == false) {
            this.log.error('No internet connection detected');
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
            return;
        }
        else {
            this.log.debug('Internet connection detected. Everything fine!');
        }

        const delay = Math.floor(Math.random() * 1); //25000
        this.log.info(`Delay execution by ${delay}ms to better spread API calls`);
        await jsonExplorer.sleep(delay);

        await jsonExplorer.setLastStartTime();
        let resultPeakHours = await this.ExecuteRequestPeakHours();
        let resultDayAhead = await this.ExecuteRequestDayAhead(country);

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
     * Retrieves marketdata from REST-API from Exaa
     * @param {boolean} tomorrow
     * @param {string} country country of the market
     */
    async getDataDayAheadExaa(tomorrow, country) {
        const day0 = cleanDate(new Date());
        const day1 = addDays(day0, 1);
        let day = new Date();
        if (tomorrow) day = day1;
        else day = day0;
        const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
        const uri = `https://www.exaa.at/data/trading-results?delivery_day=${dateStringToday}&market=${country}&auction=market_coupling`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);

        return new Promise((resolve, reject) => {
            // @ts-ignore
            axios.get(uri)
                .then((response) => {
                    if (!response || !response.data) {
                        throw new Error(`getDataDayAheadExaa(): Respone empty for URL ${uri} with status code ${response.status}`);
                    } else {
                        this.log.debug(`Response in getDataDayAheadExaa(): [${response.status}] ${JSON.stringify(response.data)}`);
                        console.log(`Response in getDataDayAheadExaa(): [${response.status}] ${JSON.stringify(response.data)}`);
                        if (response.data.data) resolve(response.data.data.h);
                        else resolve(null);
                    }
                })
                .catch(error => {
                    console.error('Error in getDataDayAheadExaa(): ' + error);
                    reject(error);
                })
        })
    }

    /**
     * Retrieves marketdata from REST-API from Exaa
     * @param {string} country country of the market
     */
    async getDataDayAheadExaa1015(country) {
        country = country.toUpperCase();
        const day0 = cleanDate(new Date());
        const day = addDays(day0, 1);

        const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
        const uri = `https://www.exaa.at/data/market-results?delivery_day=${dateStringToday}&market=${country}&auction=1015`;
        this.log.info(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);

        return new Promise((resolve, reject) => {
            // @ts-ignore
            axios.get(uri)
                .then((response) => {
                    if (!response || !response.data) {
                        throw new Error(`getDataDayAheadExaa1015(): Respone empty for URL ${uri} with status code ${response.status}`);
                    } else {
                        this.log.info(`Response in getDataDayAheadExaa1015(): [${response.status}] ${JSON.stringify(response.data)}`);
                        console.log(`Response in getDataDayAheadExaa1015(): [${response.status}] ${JSON.stringify(response.data)}`);
                        if (response.data) {
                            if (country == 'AT') resolve(response.data.AT.price);
                            else resolve(response.data.DE.price);
                        }
                        else resolve(null);
                    }
                })
                .catch(error => {
                    console.error('Error in getDataDayAheadExaa1015(): ' + error);
                    reject(error);
                })
        })
    }

    /**
     * Retrieves marketdata from REST-API from Awattar
     * @param {boolean} tomorrow
     * @param {string} country country of the market
     */
    async getDataDayAheadAwattar(tomorrow, country) {
        const day0 = cleanDate(new Date());
        let start = 0;
        let end = 0;
        if (tomorrow) {
            let day1 = addDays(day0, 1);
            start = day1.getTime();
            day1.setHours(23, 59, 59);
            end = day1.getTime() + 2000;
        } else {
            start = day0.getTime();
            day0.setHours(23, 59, 59);
            end = day0.getTime() + 2000;
        }
        let uri = '';
        if (country == 'at') uri = `https://api.awattar.at/v1/marketdata?start=${start}&end=${end}`;
        else uri = `https://api.awattar.de/v1/marketdata?start=${start}&end=${end}`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);
        return new Promise((resolve, reject) => {
            // @ts-ignore
            axios.get(uri)
                .then((response) => {
                    if (!response || !response.data) {
                        throw new Error(`getDataDayAheadAwattar(): Respone empty for URL ${uri} with status code ${response.status}`);
                    } else {
                        this.log.debug(`Response in getDataDayAheadAwattar(): [${response.status}] ${JSON.stringify(response.data)}`);
                        console.log(`Response in getDataDayAheadAwattar(): [${response.status}] ${JSON.stringify(response.data)}`);
                        resolve(response.data);
                    }
                })
                .catch(error => {
                    console.error('Error in getDataDayAheadAwattar(): ' + error);
                    reject(error);
                })
        })
    }


    /**
     * Handles json-object and creates states for market prices
     * @param {string} country
     */
    async ExecuteRequestDayAhead(country) {
        const now = new Date();
        let ten30 = new Date();
        ten30.setHours(10, 30);

        try {
            let prices0Awattar, prices1Awattar, prices0Exaa, prices1Exaa, prices1Exaa1015;

            prices0Awattar = await this.getDataDayAheadAwattar(false, country);
            this.log.debug(`Day ahead result for Awattar today is: ${JSON.stringify(prices0Awattar.data)}`);
            if (!prices0Awattar || !prices0Awattar.data || !prices0Awattar.data[0]) {
                this.log.info(`No prices from Awattar for today, let's try Exaa`);
                prices0Exaa = await this.getDataDayAheadExaa(false, country);
                this.log.debug(`Day ahead result for Exaa today is: ${JSON.stringify(prices0Exaa)}`);
                if (!prices0Exaa) this.log.warn('No market data for today');
            }

            //Check tomorrow only after 12.30
            if (now.getTime() > ten30.getTime()) {
                prices1Awattar = await this.getDataDayAheadAwattar(true, country);
                this.log.info(`Day ahead result for Awattar tomorrow is: ${JSON.stringify(prices1Awattar.data)}`);
                if (!prices1Awattar || !prices1Awattar.data || !prices1Awattar.data[0] && now.getTime() > ten30.getTime()) {
                    this.log.info(`No prices from Awattar for tomorrow, let's try Exaa`);
                    prices1Exaa = await this.getDataDayAheadExaa(true, country);
                    this.log.debug(`Day ahead result for Exaa tomorrow is: ${JSON.stringify(prices1Exaa)}`);
                    if (!prices1Exaa) {
                        prices1Exaa1015 = await this.getDataDayAheadExaa1015(country);
                        this.log.info(`Day ahead result for Exaa1015 tomorrow is: ${JSON.stringify(prices1Exaa1015)}`);
                    }
                }
            }

            //Convert Awattar-structure to Exaa-structure for today
            let prices0 = [];
            if (prices0Exaa) {
                prices0 = prices0Exaa;
            } else {
                if (prices0Awattar && prices0Awattar.data && prices0Awattar.data[0]) {
                    for (const idS in prices0Awattar.data) {
                        prices0[idS] = {};
                        prices0[idS].Price = prices0Awattar.data[idS].marketprice;
                        let start = new Date(prices0Awattar.data[idS].start_timestamp);
                        let iHour = start.getHours() + 1;
                        let sHour = String(iHour);
                        const pad = '00';
                        sHour = pad.substring(0, pad.length - sHour.length) + sHour;
                        prices0[idS].Product = 'H' + sHour;
                    }
                }
            }

            //Convert structures to Exaa-structure for tomorrow
            let prices1 = [];
            if (prices1Exaa) {
                prices1 = prices1Exaa;
            }
            else {
                if (prices1Exaa1015) {
                    for (const idS in prices1Exaa1015) {
                        prices1[idS] = {};
                        prices1[idS].Price = prices1Exaa1015[idS].y;
                        let iHour = prices1Exaa1015[idS].x;
                        let sHour = String(iHour);
                        const pad = '00';
                        sHour = pad.substring(0, pad.length - sHour.length) + sHour;
                        prices1[idS].Product = 'H' + sHour;
                    }
                    this.log.info(JSON.stringify(prices1));
                }
                else if (prices1Awattar && prices1Awattar.data && prices1Awattar.data[0]) {
                    for (const idS in prices1Awattar.data) {
                        prices1[idS] = {};
                        prices1[idS].Price = prices1Awattar.data[idS].marketprice;
                        let start = new Date(prices1Awattar.data[idS].start_timestamp);
                        let iHour = start.getHours() + 1;
                        let sHour = String(iHour);
                        const pad = '00';
                        sHour = pad.substring(0, pad.length - sHour.length) + sHour;
                        prices1[idS].Product = 'H' + sHour;
                    }
                }
            }

            if (prices0) await jsonExplorer.TraverseJson(prices0, 'marketprice.details.today', true, true);
            else await jsonExplorer.TraverseJson(null, 'marketprice.details.today', true, true);
            if (prices1) await jsonExplorer.TraverseJson(prices1, 'marketprice.details.tomorrow', true, true);
            else await jsonExplorer.TraverseJson(null, 'marketprice.details.tomorrow', true, true);

            let jDay0 = {}, jDay1 = {}, jDay0BelowThreshold = {}, jDay1BelowThreshold = {}, jDay0AboveThreshold = {}, jDay1AboveThreshold = {};
            let days0Above = 0, days0Below = 0, days1Above = 0, days1Below = 0;

            //manage today (day0)
            for (const idS in prices0) {
                if (!prices0[idS].Price) {
                    this.log.error('No marketprice found in marketprice-result for today!')
                    return 'error';
                }

                let product = prices0[idS].Product;
                let marketprice = Math.round(Number(prices0[idS].Price) / 10 * 1000) / 1000;
                this.log.debug('Marketprice for product ' + product + ' is ' + marketprice);

                let sEndHour = product.substring(1, 3);
                let iEndHour = Number(sEndHour);
                let iBeginHour = iEndHour - 1;
                let sBeginHour = String(iBeginHour);
                const pad = '00';
                sBeginHour = pad.substring(0, pad.length - sBeginHour.length) + sBeginHour;

                let range = sBeginHour + '_to_' + sEndHour;

                jDay0[range] = marketprice;
                if (marketprice < threshold) {
                    jDay0BelowThreshold[range] = marketprice;
                    days0Below++;
                }
                else {
                    jDay0AboveThreshold[range] = marketprice;
                    days0Above++;
                }
            }
            this.log.debug('Day0 looks like ' + JSON.stringify(jDay0));

            //manage tomorrow (day1)
            for (const idS in prices1) {
                if (!prices1[idS].Price) {
                    this.log.error('No marketprice found in marketprice-result for tomorrow!')
                    return 'error';
                }

                let product = prices1[idS].Product;
                let marketprice = Math.round(Number(prices1[idS].Price) / 10 * 1000) / 1000;
                this.log.debug('Marketprice for product ' + product + ' is ' + marketprice);

                let sEndHour = product.substring(1, 3);
                let iEndHour = Number(sEndHour);
                let iBeginHour = iEndHour - 1;
                let sBeginHour = String(iBeginHour);
                const pad = '00';
                sBeginHour = pad.substring(0, pad.length - sBeginHour.length) + sBeginHour;

                let range = sBeginHour + '_to_' + sEndHour;

                jDay1[range] = marketprice;
                if (marketprice < threshold) {
                    jDay1BelowThreshold[range] = marketprice;
                    days1Below++;
                }
                else {
                    jDay1AboveThreshold[range] = marketprice;
                    days1Above++;
                }
            }
            this.log.debug('Day1 looks like ' + JSON.stringify(jDay1));

            //put data into an array to be sorted in a later step
            let arrBelow0 = Object.keys(jDay0BelowThreshold).map((key) => [key, jDay0BelowThreshold[key]]);
            let arrBelow1 = Object.keys(jDay1BelowThreshold).map((key) => [key, jDay1BelowThreshold[key]]);
            let arrAll0 = Object.keys(jDay0).map((key) => [key, jDay0[key]]);
            let arrAll1 = Object.keys(jDay1).map((key) => [key, jDay1[key]]);

            jDay0BelowThreshold.numberOfHours = days0Below;
            jDay0AboveThreshold.numberOfHours = days0Above;
            jDay1BelowThreshold.numberOfHours = days1Below;
            jDay1AboveThreshold.numberOfHours = days1Above;

            this.createChart(arrAll0, arrAll1);

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
            let sortedHours0Short = [], sortedHours1Short = [], sortedHours0ShortAll = [], sortedHours1ShortAll = [];
            let priceSum0 = 0, priceSum1 = 0;
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
                priceSum0 = priceSum0 + arrAll0[idS][1];
            }
            for (const idS in arrAll1) {
                sortedHoursAll1[idS] = [arrAll1[idS][0], arrAll1[idS][1]];
                sortedHours1ShortAll[idS] = Number(arrAll1[idS][0].substring(0, 2));
                priceSum1 = priceSum1 + arrAll1[idS][1];
            }
            let price0Avg, price1Avg;
            if (priceSum0 == 0) price0Avg = null;
            else price0Avg = Math.round(priceSum0 / 24 * 1000) / 1000;
            if (priceSum1 == 0) price1Avg = null;
            else price1Avg = Math.round(priceSum1 / 24 * 1000) / 1000;

            await jsonExplorer.traverseJson(sortedHours0, 'marketprice.belowThreshold.today_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHours1, 'marketprice.belowThreshold.tomorrow_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHoursAll0, 'marketprice.today_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHoursAll1, 'marketprice.tomorrow_sorted', true, true);
            await jsonExplorer.stateSetCreate('marketprice.belowThreshold.today_sorted.short', 'today sorted short', JSON.stringify(sortedHours0Short));
            await jsonExplorer.stateSetCreate('marketprice.belowThreshold.tomorrow_sorted.short', 'tomorrow sorted short', JSON.stringify(sortedHours1Short));
            await jsonExplorer.stateSetCreate('marketprice.today_sorted.short', 'today sorted short', JSON.stringify(sortedHours0ShortAll));
            await jsonExplorer.stateSetCreate('marketprice.tomorrow_sorted.short', 'tomorrow sorted short', JSON.stringify(sortedHours1ShortAll));
            await jsonExplorer.stateSetCreate('marketprice.today.average', 'average', price0Avg);
            await jsonExplorer.stateSetCreate('marketprice.tomorrow.average', 'average', price1Avg);

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

            let day0 = cleanDate(new Date());
            let day1 = addDays(day0, 1);
            let day2 = addDays(day0, 2);
            let day3 = addDays(day0, 3);
            let day4 = addDays(day0, 4);
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

                let dateToCheck = cleanDate(new Date(result.StatusInfos[idS].utc));
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

    calcDate(i, tomorrow = false) {
        let date = cleanDate(new Date());
        if (tomorrow) date = addDays(date, 1);
        date.setHours(i);
        return date.getTime();
    }

    async createChart(arrayToday, arrayTomorrow) {
        let todayData = [];
        let tomorrowData = [];
        let chart = {};

        let todayMin = 1000, tomorrowMin = 1000;
        let todayMax = 0, tomorrowMax = 0;

        for (const idS in arrayToday) {
            todayData[idS] = { "y": arrayToday[idS][1], "t": this.calcDate(idS) };
            todayMin = Math.min(todayMin, Number(arrayToday[idS][1]));
            todayMax = Math.max(todayMax, Number(arrayToday[idS][1]));
        }
        for (const idS in arrayTomorrow) {
            tomorrowData[idS] = { "y": arrayTomorrow[idS][1], "t": this.calcDate(idS, true) };
            tomorrowMin = Math.min(tomorrowMin, Number(arrayTomorrow[idS][1]));
            tomorrowMax = Math.max(tomorrowMax, Number(arrayTomorrow[idS][1]));
        }

        let allMin = Math.min(todayMin, tomorrowMin);
        let allMax = Math.max(todayMax, tomorrowMax);
        allMax = Math.ceil(allMax * 1.1 / 5) * 5;

        if (todayData[23] && todayData[23].y && todayData[23].t) todayData[24] = { "y": todayData[23].y, "t": todayData[23].t + 60 * 60 * 1000 };

        if (tomorrowData[23] && tomorrowData[23].y && tomorrowData[23].t) tomorrowData[24] = { "y": tomorrowData[23].y, "t": tomorrowData[23].t + 60 * 60 * 1000 };

        chart.graphs = [];
        chart.graphs[0] = {};
        chart.graphs[0].type = "line";
        chart.graphs[0].color = "lightgray";
        chart.graphs[0].line_steppedLine = true;
        chart.graphs[0].xAxis_timeFormats = { "hour": "HH" };
        chart.graphs[0].xAxis_time_unit = "hour";
        chart.graphs[0].yAxis_min = Math.min(0, allMin);
        chart.graphs[0].yAxis_max = allMax;
        chart.graphs[0].datalabel_show = 'auto';
        chart.graphs[0].datalabel_minDigits = 2;
        chart.graphs[0].datalabel_maxDigits = 2;
        chart.graphs[0].xAxis_bounds = 'data';
        chart.graphs[0].line_pointSize = 5;
        chart.graphs[0].line_PointColor = 'rgba(0, 0, 0, 0)';
        chart.graphs[0].datalabel_fontSize = 10;
        chart.graphs[0].datalabel_color = 'black';
        chart.graphs[0].line_UseFillColor = true;

        chart.graphs[0].data = todayData;
        await jsonExplorer.stateSetCreate('marketprice.today.jsonChart', 'jsonChart', JSON.stringify(chart));
        chart.graphs[0].data = tomorrowData;
        await jsonExplorer.stateSetCreate('marketprice.tomorrow.jsonChart', 'jsonChart', JSON.stringify(chart));
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
            this.log.error(`Error in function sendSentry() main.js: ${error}`);
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
function cleanDate(date) {
    date.setHours(0, 0, 0, 0);
    return date;
}

/**
 * adds days to a date
 * @param {Date} date origin date
 * @param {number} numberOfDays number of days which origin date shall be added (positive and negative allowes)
 */
function addDays(date, numberOfDays) {
    const oneDayTime = 1000 * 60 * 60 * 24;
    const oneHourAndOneMinute = 1000 * 60 * 61;
    let originDate = cleanDate(date);
    let targetDate = new Date(originDate.getTime() + oneDayTime * numberOfDays + oneHourAndOneMinute); //oneHourAndOneMinute to cover Zeitumstellung
    return (cleanDate(targetDate));
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