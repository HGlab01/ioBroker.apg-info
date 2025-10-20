'use strict';

const utils = require('@iobroker/adapter-core');
const axios = require('axios');
const convert = require('xml-js');
const jsonExplorer = require('iobroker-jsonexplorer');
const stateAttr = require(`${__dirname}/lib/stateAttr.js`); // Load attribute library
const isOnline = require('@esm2cjs/is-online').default;
const { version } = require('./package.json');

// Constants
const MAX_DELAY = 25000; //25000
const API_TIMEOUT = 20000; //20000

// @ts-expect-error axios.create is ok
const axiosInstance = axios.create({ timeout: API_TIMEOUT });

class ApgInfo extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options] Settings for the adapter instance
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
        this.calculate = false;
        this.feeAbsolute = 0;
        this.feeRelative = 0;
        this.vat = 0;
        this.charges = 0;
        this.gridCosts = 0;
        this.token = '';
        this.threshold = 10;
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        let country = '';
        let forecast = false;
        // Initialize adapter
        jsonExplorer.sendVersionInfo(version);
        this.log.info(`Started with JSON-Explorer version ${jsonExplorer.version}`);

        if (this.config.threshold != undefined) {
            this.threshold = this.config.threshold;
        } else {
            this.log.info('Market price threshold not found and set to 10');
        }

        if (this.config.forecast != undefined) {
            forecast = this.config.forecast;
        } else {
            this.log.info('Forecast config not found and set to disbaled');
        }

        this.calculate = this.config.calculate ?? false;
        this.peakHours = this.config.peakHours ?? false;
        this.marketPrices = this.config.marketPrices ?? false;

        if (this.calculate == true) {
            this.feeAbsolute = this.config.feeAbsolute ?? 0;
            this.feeRelative = (this.config.feeRelative ?? 0) / 100;
            this.vat = (this.config.vat ?? 0) / 100;
            this.charges = (this.config.charges ?? 0) / 100;
            this.gridCosts = this.config.gridCosts ?? 0;
        }

        if (this.config.country) {
            country = this.config.country;
        } else {
            this.log.error('Country for market not found. Please confifure in Config');
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
        }

        if (country != 'at' && country != 'de') {
            if (this.config.tokenEncrypted) {
                this.token = this.config.tokenEncrypted;
            } else {
                const instanceId = `system.adapter.${this.name}.${this.instance}`;
                const objInstance = await this.getForeignObjectAsync(instanceId);
                if (objInstance?.native) {
                    let tokenUnEncrypted = objInstance.native.token;
                    if (tokenUnEncrypted) {
                        this.log.info(`Let's onetime encrypt the token...`);
                        objInstance.native.tokenEncrypted = this.encrypt(tokenUnEncrypted);
                        delete objInstance.native.token;
                        await this.setForeignObjectAsync(instanceId, objInstance);
                        this.token = tokenUnEncrypted;
                        this.log.info(`Token encrypted and saved in instance ${instanceId}`);
                    }
                }
            }
            if (!this.token) {
                this.log.error('No token defined. Please check readme how to request!');
                this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
            }
        }

        if ((await isOnline()) == false) {
            this.log.error('No internet connection detected');
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
            return;
        }

        this.log.debug('Internet connection detected. Everything fine!');

        const callApiDelay = Math.floor(Math.random() * MAX_DELAY);
        this.log.info(`Delay execution by ${callApiDelay}ms to better spread API calls`);
        await jsonExplorer.sleep(callApiDelay);
        await jsonExplorer.setLastStartTime();

        const [resultPeakHours, resultMarketPrice] = await Promise.all([this.executeRequestPeakHours(), this.executeMarketPrice(country, forecast)]);

        if (resultPeakHours == 'error' || resultMarketPrice == 'error') {
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
        } else {
            this.terminate ? this.terminate(0) : process.exit(0);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback it is the callback that has to be called after all
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            this.unloaded = true;
            callback();
        } catch {
            callback();
        }
    }

    /**
     * Makes an API call with retry logic.
     *
     * @param {string} uri The URI to call.
     * @param {string} methodName The name of the calling method for logging.
     * @param {(response: any) => any} processResponse A function to process the successful response.
     * @returns {Promise<any>} The processed response or null on final server error.
     */
    async _apiCallWithRetry(uri, methodName, processResponse) {
        let attempts = 0;
        const maxAttempts = 3;
        let delay = 10 * 1000; // 10 seconds

        while (attempts < maxAttempts) {
            try {
                const response = await axiosInstance.get(uri);
                if (response?.data == null) {
                    throw new Error(`Respone empty for URL ${uri} with status code ${response.status}`);
                }
                this.log.debug(`Response in ${methodName}(): [${response.status}] ${JSON.stringify(response.data)}`);
                console.log(`Response in ${methodName}(): [${response.status}] ${JSON.stringify(response.data)}`);
                return processResponse(response);
            } catch (error) {
                attempts++;
                if (attempts >= maxAttempts) {
                    // @ts-expect-error response may exist
                    const errorMessage = error.response?.data ? `with response ${JSON.stringify(error.response.data)}` : '';
                    this.log.error(`Error in ${methodName}() attempt ${attempts}/${maxAttempts}: ${error} ${errorMessage}`);
                    console.error(`Error in ${methodName}() attempt ${attempts}/${maxAttempts}: ${error} ${errorMessage}`);
                    // @ts-expect-error response may exist
                    if (error.response?.status >= 500) {
                        return null; // On final attempt for server errors, resolve with null
                    }
                    throw error; // Otherwise rethrow
                }
                this.log.info(`Retrying in ${delay / 1000}s for ${methodName}...`);
                await jsonExplorer.sleep(delay);
                delay *= 2; // Exponential backoff (10s, 20s)
            }
        }
    }

    /**
     * Retrieves peak hours from REST-API
     */
    async getDataPeakHours() {
        let uri = `https://awareness.cloud.apg.at/api/v1/PeakHourStatus`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);
        return this._apiCallWithRetry(uri, 'getDataPeakHours', response => response?.data ?? null);
    }

    /**
     * Retrieves marketdata from REST-API from Exaa
     *
     * @param {boolean} tomorrow true means it is the next day, false means today
     * @param {string} country country of the market
     */
    async getDataDayAheadExaa(tomorrow, country) {
        let day = cleanDate(new Date());
        if (tomorrow) {
            day = addDays(day, 1);
        }

        const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
        const uri = `https://www.exaa.at/data/trading-results?delivery_day=${dateStringToday}&market=${country}&auction=market_coupling`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);

        return this._apiCallWithRetry(uri, 'getDataDayAheadExaa', response => response?.data?.data ?? null);
    }

    /**
     * Retrieves marketdata from REST-API from Exaa
     *
     * @param {string} country country of the market
     */
    async getDataDayAheadExaa1015(country) {
        country = country.toUpperCase();
        const day = addDays(cleanDate(new Date()), 1);

        const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
        const uri = `https://www.exaa.at/data/market-results?delivery_day=${dateStringToday}&market=${country}&auction=1015`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);

        return this._apiCallWithRetry(uri, 'getDataDayAheadExaa1015', response => {
            if (country === 'AT') {
                return response?.data?.AT?.price ?? null;
            }
            return response?.data?.DE?.price ?? null;
        });
    }

    /**
     * Retrieves marketdata from REST-API from Awattar
     *
     * @param {boolean} tomorrow true means it is the next day, false means today
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
        if (country == 'at') {
            uri = `https://api.awattar.at/v1/marketdata?start=${start}&end=${end}`;
        } else {
            uri = `https://api.awattar.de/v1/marketdata?start=${start}&end=${end}`;
        }
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);
        return this._apiCallWithRetry(uri, 'getDataDayAheadAwattar', response => response.data);
    }

    /**
     * Retrieves marketdata from REST-API from entsoe
     *
     * @param {boolean} tomorrow means it is the next day, false means today
     * @param {string} country country of the market
     */
    async getDataDayAheadEntsoe(tomorrow, country) {
        const url = 'https://web-api.tp.entsoe.eu/api?documentType=A44';
        const securityToken = this.token;

        let day = cleanDate(new Date());
        if (tomorrow) {
            day = addDays(day, 1);
        }
        const dayPlus = addDays(day, 1);

        const datebegin = day.getFullYear() + pad(day.getMonth() + 1, 2) + pad(day.getDate(), 2);
        const dateend = dayPlus.getFullYear() + pad(dayPlus.getMonth() + 1, 2) + pad(dayPlus.getDate(), 2);

        let domain = '';

        switch (country) {
            case 'ch':
                domain = '10YCH-SWISSGRIDZ';
                break;
            case 'at':
                domain = '10YAT-APG------L';
                break;
            case 'de':
                domain = '10Y1001A1001A82H';
                break;
            default:
                this.log.error('Country not found in definitions');
        }

        const uri = `${url}&securityToken=${securityToken}&periodStart=${datebegin}0000&periodEnd=${dateend}0000&in_Domain=${domain}&Out_Domain=${domain}`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);

        return this._apiCallWithRetry(uri, 'getDataDayAheadEntsoe', response => {
            const result = response?.data == null ? null : xml2js(response.data);
            return result?.Publication_MarketDocument ?? null;
        });
    }

    /**
     * Handles json-object and creates states for market prices
     *
     * @param {string} country country of the market
     * @param {boolean} forecast also checks 10.15 auction for next day
     */
    async executeMarketPrice(country, forecast) {
        if (this.marketPrices == false) {
            const statesToDelete = await this.getStatesAsync(`marketprice*`);
            for (const idS in statesToDelete) {
                await this.delObjectAsync(idS);
            }
            return null;
        }
        this.log.debug('Execute market price retrieval');
        let source1 = null;
        const configTraversJsonFalse = { replaceName: true, replaceID: true, level: 3, validateAttribute: false };

        try {
            const day0 = cleanDate(new Date());
            const day1 = addDays(day0, 1);
            jsonExplorer.stateSetCreate('marketprice.today.date', 'date', day0.getTime());
            jsonExplorer.stateSetCreate('marketprice.tomorrow.date', 'date', day1.getTime());
            let prices0 = [],
                prices0q = [],
                prices1 = [],
                prices1q = [];
            if (country == 'ch') {
                const entsoePrices = await this._getAndProcessEntsoeData(country);
                prices0 = entsoePrices.prices0 ?? [];
                prices1 = entsoePrices.prices1 ?? [];
            } else {
                ({ prices0, prices1, source1, prices0q, prices1q } = await this._getAndProcessMarketData(country, forecast));
            }

            await jsonExplorer.traverseJson(prices0, 'marketprice.details.today', configTraversJsonFalse);
            await jsonExplorer.traverseJson(prices1, 'marketprice.details.tomorrow', configTraversJsonFalse);
            await jsonExplorer.traverseJson(prices0q, 'marketprice_quarter_hourly.details.today', configTraversJsonFalse);
            await jsonExplorer.traverseJson(prices1q, 'marketprice_quarter_hourly.details.tomorrow', configTraversJsonFalse);

            const todayProcessed = this._processAndCategorizePrices(prices0, 'today', false);
            const tomorrowProcessed = this._processAndCategorizePrices(prices1, 'tomorrow', false);
            const todayProcessedq = this._processAndCategorizePrices(prices0q, 'today', true);
            const tomorrowProcessedq = this._processAndCategorizePrices(prices1q, 'tomorrow', true);

            if (!todayProcessed) {
                return 'error';
            }
            const {
                jDay: jDay0,
                jDayBelowThreshold: jDay0BelowThreshold,
                jDayAboveThreshold: jDay0AboveThreshold,
                daysBelow: days0Below,
                daysAbove: days0Above,
            } = todayProcessed;

            if (!tomorrowProcessed) {
                return 'error';
            }
            const {
                jDay: jDay1,
                jDayBelowThreshold: jDay1BelowThreshold,
                jDayAboveThreshold: jDay1AboveThreshold,
                daysBelow: days1Below,
                daysAbove: days1Above,
            } = tomorrowProcessed;

            if (!todayProcessedq) {
                return 'error';
            }
            const {
                jDay: jDay0q,
                jDayBelowThreshold: jDay0BelowThresholdq,
                jDayAboveThreshold: jDay0AboveThresholdq,
                daysBelow: days0Belowq,
                daysAbove: days0Aboveq,
            } = todayProcessedq;

            if (!tomorrowProcessedq) {
                return 'error';
            }
            const {
                jDay: jDay1q,
                jDayBelowThreshold: jDay1BelowThresholdq,
                jDayAboveThreshold: jDay1AboveThresholdq,
                daysBelow: days1Belowq,
                daysAbove: days1Aboveq,
            } = tomorrowProcessedq;

            //put data into an array
            let arrBelow0 = Object.keys(jDay0BelowThreshold).map(key => [key, jDay0BelowThreshold[key]]);
            let arrBelow1 = Object.keys(jDay1BelowThreshold).map(key => [key, jDay1BelowThreshold[key]]);
            let arrAll0 = Object.keys(jDay0).map(key => [key, jDay0[key]]);
            let arrAll1 = Object.keys(jDay1).map(key => [key, jDay1[key]]);

            let arrBelow0q = Object.keys(jDay0BelowThresholdq).map(key => [key, jDay0BelowThresholdq[key]]);
            let arrBelow1q = Object.keys(jDay1BelowThresholdq).map(key => [key, jDay1BelowThresholdq[key]]);
            let arrAll0q = Object.keys(jDay0q).map(key => [key, jDay0q[key]]);
            let arrAll1q = Object.keys(jDay1q).map(key => [key, jDay1q[key]]);

            jDay0BelowThreshold.numberOfHours = days0Below;
            jDay0AboveThreshold.numberOfHours = days0Above;
            jDay1BelowThreshold.numberOfHours = days1Below;
            jDay1AboveThreshold.numberOfHours = days1Above;

            jDay0BelowThresholdq.numberOfSlots = days0Belowq;
            jDay0AboveThresholdq.numberOfSlots = days0Aboveq;
            jDay1BelowThresholdq.numberOfSlots = days1Belowq;
            jDay1AboveThresholdq.numberOfSlots = days1Aboveq;

            await jsonExplorer.traverseJson(jDay0, 'marketprice.today', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay0BelowThreshold, 'marketprice.belowThreshold.today', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay0AboveThreshold, 'marketprice.aboveThreshold.today', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay1, 'marketprice.tomorrow', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay1BelowThreshold, 'marketprice.belowThreshold.tomorrow', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay1AboveThreshold, 'marketprice.aboveThreshold.tomorrow', configTraversJsonFalse);

            await jsonExplorer.traverseJson(jDay0q, 'marketprice_quarter_hourly.today', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay1q, 'marketprice_quarter_hourly.tomorrow', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay0BelowThresholdq, 'marketprice_quarter_hourly.belowThreshold.today', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay0AboveThresholdq, 'marketprice_quarter_hourly.aboveThreshold.today', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay1BelowThresholdq, 'marketprice_quarter_hourly.belowThreshold.tomorrow', configTraversJsonFalse);
            await jsonExplorer.traverseJson(jDay1AboveThresholdq, 'marketprice_quarter_hourly.aboveThreshold.tomorrow', configTraversJsonFalse);

            //copy objets to use this for charts later
            const arrAll0Copy = structuredClone(arrAll0);
            const arrAll1Copy = structuredClone(arrAll1);
            const arrAll0qCopy = structuredClone(arrAll0q);
            const arrAll1qCopy = structuredClone(arrAll1q);

            //now it is time to sort by prcie
            arrBelow0.sort(compareSecondColumn);
            arrBelow1.sort(compareSecondColumn);
            arrAll0.sort(compareSecondColumn);
            arrAll1.sort(compareSecondColumn);
            arrBelow0q.sort(compareSecondColumn);
            arrBelow1q.sort(compareSecondColumn);
            arrAll0q.sort(compareSecondColumn);
            arrAll1q.sort(compareSecondColumn);

            //prepare sorted arrays to create states
            let sortedHours0 = [],
                sortedHours1 = [],
                sortedHoursAll0 = [],
                sortedHoursAll0q = [],
                sortedHoursAll1 = [],
                sortedHoursAll1q = [],
                sortedHours0q = [],
                sortedHours1q = [];
            let sortedHours0Short = [],
                sortedHours0Shortq = [],
                sortedHours1Short = [],
                sortedHours1Shortq = [],
                sortedHours0ShortAll = [],
                sortedHours0ShortAllq = [],
                sortedHours1ShortAll = [],
                sortedHours1ShortAllq = [];
            let priceSum0 = 0,
                priceSum0q = 0,
                priceSum1 = 0,
                priceSum1q = 0;

            for (const idS in arrBelow0) {
                sortedHours0[idS] = [arrBelow0[idS][0], arrBelow0[idS][1]];
                sortedHours0Short[idS] = Number(arrBelow0[idS][0].substring(0, 2));
            }
            for (const idS in arrBelow0q) {
                sortedHours0q[idS] = [arrBelow0q[idS][0], arrBelow0q[idS][1]];
                sortedHours0Shortq[idS] = arrBelow0q[idS][0].substring(0, 5);
            }
            for (const idS in arrBelow1) {
                sortedHours1[idS] = [arrBelow1[idS][0], arrBelow1[idS][1]];
                sortedHours1Short[idS] = Number(arrBelow1[idS][0].substring(0, 2));
            }
            for (const idS in arrBelow1q) {
                sortedHours1q[idS] = [arrBelow1q[idS][0], arrBelow1q[idS][1]];
                sortedHours1Shortq[idS] = arrBelow1q[idS][0].substring(0, 5);
            }
            for (const idS in arrAll0) {
                sortedHoursAll0[idS] = [arrAll0[idS][0], arrAll0[idS][1]];
                sortedHours0ShortAll[idS] = Number(arrAll0[idS][0].substring(0, 2));
                priceSum0 = priceSum0 + arrAll0[idS][1];
            }
            for (const idS in arrAll0q) {
                sortedHoursAll0q[idS] = [arrAll0q[idS][0], arrAll0q[idS][1]];
                sortedHours0ShortAllq[idS] = arrAll0q[idS][0].substring(0, 5);
                priceSum0q = priceSum0q + arrAll0q[idS][1];
            }
            for (const idS in arrAll1) {
                sortedHoursAll1[idS] = [arrAll1[idS][0], arrAll1[idS][1]];
                sortedHours1ShortAll[idS] = Number(arrAll1[idS][0].substring(0, 2));
                priceSum1 = priceSum1 + arrAll1[idS][1];
            }
            for (const idS in arrAll1q) {
                sortedHoursAll1q[idS] = [arrAll1q[idS][0], arrAll1q[idS][1]];
                sortedHours1ShortAllq[idS] = arrAll1q[idS][0].substring(0, 5);
                priceSum1q = priceSum1q + arrAll1q[idS][1];
            }
            let price0Avg, price1Avg, price0Avgq, price1Avgq;
            if (priceSum0 == 0) {
                price0Avg = null;
            } else {
                price0Avg = Math.round((priceSum0 / 24) * 1000) / 1000;
            }
            if (priceSum1 == 0) {
                price1Avg = null;
            } else {
                price1Avg = Math.round((priceSum1 / 24) * 1000) / 1000;
            }
            if (priceSum0q == 0) {
                price0Avgq = null;
            } else {
                price0Avgq = Math.round((priceSum0q / (24 * 4)) * 1000) / 1000;
            }
            if (priceSum1q == 0) {
                price1Avgq = null;
            } else {
                price1Avgq = Math.round((priceSum1q / (24 * 4)) * 1000) / 1000;
            }

            await jsonExplorer.traverseJson(sortedHours0, 'marketprice.belowThreshold.today_sorted', configTraversJsonFalse);
            await jsonExplorer.traverseJson(sortedHours1, 'marketprice.belowThreshold.tomorrow_sorted', configTraversJsonFalse);
            await jsonExplorer.traverseJson(sortedHoursAll0, 'marketprice.today_sorted', configTraversJsonFalse);
            await jsonExplorer.traverseJson(sortedHoursAll1, 'marketprice.tomorrow_sorted', configTraversJsonFalse);
            await jsonExplorer.stateSetCreate(
                'marketprice.belowThreshold.today_sorted.short',
                'today sorted short',
                JSON.stringify(sortedHours0Short),
                false,
            );
            await jsonExplorer.stateSetCreate(
                'marketprice.belowThreshold.tomorrow_sorted.short',
                'tomorrow sorted short',
                JSON.stringify(sortedHours1Short),
                false,
            );
            await jsonExplorer.stateSetCreate('marketprice.today_sorted.short', 'today sorted short', JSON.stringify(sortedHours0ShortAll), false);
            await jsonExplorer.stateSetCreate(
                'marketprice.tomorrow_sorted.short',
                'tomorrow sorted short',
                JSON.stringify(sortedHours1ShortAll),
                false,
            );
            await jsonExplorer.stateSetCreate('marketprice.today.average', 'average', price0Avg, false);
            await jsonExplorer.stateSetCreate('marketprice.tomorrow.average', 'average', price1Avg, false);

            await jsonExplorer.traverseJson(sortedHours0q, 'marketprice_quarter_hourly.belowThreshold.today_sorted', configTraversJsonFalse, false);
            await jsonExplorer.traverseJson(
                sortedHours1q,
                'marketprice_quarter_hourly.belowThreshold.tomorrow_sorted',
                configTraversJsonFalse,
                false,
            );
            await jsonExplorer.traverseJson(sortedHoursAll0q, 'marketprice_quarter_hourly.today_sorted', configTraversJsonFalse, false);
            await jsonExplorer.traverseJson(sortedHoursAll1q, 'marketprice_quarter_hourly.tomorrow_sorted', configTraversJsonFalse, false);
            await jsonExplorer.stateSetCreate(
                'marketprice_quarter_hourly.today_sorted.short',
                'today sorted short',
                JSON.stringify(sortedHours0ShortAllq),
                false,
            );
            await jsonExplorer.stateSetCreate(
                'marketprice_quarter_hourly.tomorrow_sorted.short',
                'tomoorrow sorted short',
                JSON.stringify(sortedHours1ShortAllq),
                false,
            );
            await jsonExplorer.stateSetCreate(
                'marketprice_quarter_hourly.belowThreshold.today_sorted.short',
                'today sorted short',
                JSON.stringify(sortedHours0Shortq),
                false,
            );
            await jsonExplorer.stateSetCreate(
                'marketprice_quarter_hourly.belowThreshold.tomorrow_sorted.short',
                'tomorrow sorted short',
                JSON.stringify(sortedHours1Shortq),
                false,
            );
            await jsonExplorer.stateSetCreate('marketprice_quarter_hourly.today.average', 'average', price0Avgq, false);
            await jsonExplorer.stateSetCreate('marketprice_quarter_hourly.tomorrow.average', 'average', price1Avgq, false);

            await this.createCharts(arrAll0Copy, arrAll1Copy, source1, false);
            await this.createCharts(arrAll0qCopy, arrAll1qCopy, null, true);

            await jsonExplorer.checkExpire('marketprice.*');
            await jsonExplorer.checkExpire('marketprice_quarter_hourly.*');
            await jsonExplorer.deleteObjectsWithNull('marketprice.*Threshold.*');
            await jsonExplorer.deleteObjectsWithNull('marketprice_quarter_hourly.*Threshold.*');
            await jsonExplorer.deleteObjectsWithNull('marketprice.details.*');
            await jsonExplorer.deleteObjectsWithNull('marketprice_quarter_hourly.details.*');
        } catch (error) {
            let eMsg = `Error in executeMarketPrice(): ${error}`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.sendSentry(error);
        }
    }

    /**
     * Processes and categorizes market prices for a given day.
     *
     * @param {any[]} prices - The array of price objects.
     * @param {string} dayString - A string identifier for the day (e.g., 'today', 'tomorrow').
     * @param {boolean} quaterly - Indicates if the prices are in quarterly format.
     * @returns {{jDay: object, jDayBelowThreshold: object, jDayAboveThreshold: object, daysBelow: number, daysAbove: number} | null} return
     */
    _processAndCategorizePrices(prices, dayString, quaterly = false) {
        const jDay = {};
        const jDayBelowThreshold = {};
        const jDayAboveThreshold = {};
        let daysBelow = 0;
        let daysAbove = 0;

        for (const idS in prices) {
            if (prices[idS].Price == undefined) {
                this.log.error(`No marketprice found in marketprice-result for ${dayString}!`);
                return null;
            }

            const product = prices[idS].Product;
            const marketprice = this.calcPrice(prices[idS].Price / 10);
            this.log.debug(`Marketprice for product ${product} is ${marketprice}`);

            let range;
            if (quaterly) {
                const productText = prices[idS].ProductText;
                const regexZeit = /(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})/;
                const matchZeit = productText.match(regexZeit);
                if (matchZeit && matchZeit.length > 1) {
                    range = matchZeit[1].replace(/ /g, '');
                }
            } else {
                const sEndHour = product.substring(1, 3);
                const iEndHour = Number(sEndHour);
                const iBeginHour = iEndHour - 1;
                const sBeginHour = pad(iBeginHour, 2);
                range = `${sBeginHour}_to_${sEndHour}`;
            }
            jDay[range] = marketprice;
            if (marketprice < this.threshold) {
                jDayBelowThreshold[range] = marketprice;
                daysBelow++;
            } else {
                jDayAboveThreshold[range] = marketprice;
                daysAbove++;
            }
        }

        this.log.debug(`Day prices for ${dayString} look like ${JSON.stringify(jDay)}`);

        return { jDay, jDayBelowThreshold, jDayAboveThreshold, daysBelow, daysAbove };
    }

    /**
     * Fetches and processes market data from Awattar/Exaa for today and tomorrow.
     *
     * @param {string} country The country code for the API request.
     * @param {boolean} forecast also checks 10.15 auction for next day
     * @returns {Promise<{prices0: any[], prices1: any[], source1: string |null, prices0q: any,  prices1q: any}>} An object containing the processed prices for today and tomorrow and the source for tomorrow.
     */
    async _getAndProcessMarketData(country, forecast) {
        let prices0Awattar, prices1Awattar, prices0Exaa, prices1Exaa, prices1Exaa1015;

        const [eXaaToday, eXaaTomorrow] = await Promise.all([this.getDataDayAheadExaa(false, country), this.getDataDayAheadExaa(true, country)]);

        //check for provider for today
        prices0Exaa = eXaaToday?.h ?? null;
        if (prices0Exaa == null) {
            this.log.info(`No market data from Exaa for today, let's try Awattar`);
            prices0Awattar = await this.getDataDayAheadAwattar(false, country);
            if (prices0Awattar?.data?.[0]) {
                this.log.info('Todays market data from Awattar available');
                this.log.debug(`Todays market data result from Awattar is: ${JSON.stringify(prices0Awattar)}`);
            } else {
                this.log.warn('No market data for today!');
            }
        } else {
            this.log.debug(`Todays market data result from Exaa is: ${JSON.stringify(prices0Exaa)}`);
        }

        //check for provider for tomorrow
        prices1Exaa = eXaaTomorrow?.h ?? null;
        if (prices1Exaa == null) {
            this.log.info(`No market data from Exaa for tomorrow, let's try Awattar`);
            prices1Awattar = await this.getDataDayAheadAwattar(true, country);
            if (prices1Awattar?.data?.[0]) {
                this.log.info('Tomorrows market data from Awattar available');
                this.log.debug(`Tomorrow market data result from Awattar is: ${JSON.stringify(prices1Awattar)}`);
            } else {
                if (forecast) {
                    this.log.info('No market data from Awattar for tomorrow , last chance Exaa 10.15 auction!');
                    const eXaa1015 = await this.getDataDayAheadExaa1015(country);
                    prices1Exaa1015 = eXaa1015;
                    if (prices1Exaa1015) {
                        this.log.info('Market data from Exaa 10.15 auction available');
                    } else {
                        this.log.info('Bad luck for Exaa 10.15 auction');
                    }
                    this.log.debug(`Tomorrows market data result from Exaa 10.15 auction is: ${JSON.stringify(prices1Exaa1015)}`);
                } else {
                    this.log.info('No market data from Awattar for tomorrow');
                }
            }
        } else {
            this.log.debug(`Tomorrows market data result from Exaa is: ${JSON.stringify(prices1Exaa)}`);
        }

        const todayResult = this._processMarketPrices('today', prices0Awattar, prices0Exaa);
        const tomorrowResult = this._processMarketPrices('tomorrow', prices1Awattar, prices1Exaa, prices1Exaa1015);

        let prices0q = eXaaToday?.q ?? null;
        let prices1q = eXaaTomorrow?.q ?? null;

        // Add id to each element in prices0q
        if (prices0q) {
            for (const item of prices0q) {
                const productText = item.ProductText;
                const regexZeit = /(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})/;
                const matchZeit = productText.match(regexZeit);
                if (matchZeit && matchZeit.length > 1) {
                    item.id = matchZeit[1].replace(/ /g, '');
                }
            }
        }
        // Add id to each element in prices1q
        if (prices1q) {
            for (const item of prices1q) {
                const productText = item.ProductText;
                const regexZeit = /(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})/;
                const matchZeit = productText.match(regexZeit);
                if (matchZeit && matchZeit.length > 1) {
                    item.id = matchZeit[1].replace(/ /g, '');
                }
            }
        }
        return {
            prices0: todayResult.prices ?? [],
            prices1: tomorrowResult.prices ?? [],
            source1: tomorrowResult.source ?? undefined,
            prices0q: prices0q ?? [],
            prices1q: prices1q ?? [],
        };
    }

    /**
     * Fetches and processes market data from Entsoe for today and tomorrow.
     * Includes a retry mechanism for network-related errors.
     *
     * @param {string} country The country code for the API request.
     * @returns {Promise<{prices0: any[], prices1: any[]}>} An object containing the processed prices for today and tomorrow.
     */
    async _getAndProcessEntsoeData(country) {
        let prices0Entsoe, prices1Entsoe;

        try {
            [prices0Entsoe, prices1Entsoe] = await Promise.all([
                this.getDataDayAheadEntsoe(false, country),
                this.getDataDayAheadEntsoe(true, country),
            ]);
        } catch (error) {
            if (String(error).includes('read ECONNRESET') || String(error).includes('timeout') || String(error).includes('socket hang up')) {
                this.log.info(`Entsoe request failed. Let's wait 3 minutes and try again...`);
                await jsonExplorer.sleep(3 * 60 * 1000);
                this.log.info(`OK! Let's try again now!`);
                [prices0Entsoe, prices1Entsoe] = await Promise.all([
                    this.getDataDayAheadEntsoe(false, country),
                    this.getDataDayAheadEntsoe(true, country),
                ]);
            } else {
                throw error;
            }
        }

        this.log.debug(`Entsoe Today: ${JSON.stringify(prices0Entsoe)}`);
        this.log.debug(`Entsoe Tomorrow: ${JSON.stringify(prices1Entsoe)}`);

        const pricesToday = this._processEntsoeData(prices0Entsoe, 'today') || [];
        if (pricesToday.length > 0) {
            jsonExplorer.stateSetCreate('marketprice.today.source', 'Source', 'entsoe');
        }

        const pricesTomorrow = this._processEntsoeData(prices1Entsoe, 'tomorrow') || [];
        if (pricesTomorrow.length > 0) {
            jsonExplorer.stateSetCreate('marketprice.tomorrow.source', 'Source', 'entsoe');
        }

        return { prices0: pricesToday, prices1: pricesTomorrow };
    }

    /**
     * Processes market prices from different sources for a given day.
     * It selects the best available data source and converts it to a unified format.
     *
     * @param {'today' | 'tomorrow'} day - The day to process ('today' or 'tomorrow').
     * @param {any} awattarData - Data from Awattar API.
     * @param {any} exaaData - Data from EXAA Market Coupling API.
     * @param {any} [exaa1015Data] - Optional data from EXAA 10:15 auction API (for tomorrow).
     * @returns {{prices: any[], source: string}} The processed prices and the source name.
     */
    _processMarketPrices(day, awattarData, exaaData, exaa1015Data) {
        let prices = [];
        let source = '';

        if (exaaData) {
            prices = exaaData;
            source = 'exaaMC';
        } else if (day === 'tomorrow' && exaa1015Data) {
            prices = this._convertExaa1015Data(exaa1015Data);
            source = 'exaa1015';
        } else if (awattarData?.data?.[0]) {
            prices = this._convertAwattarData(awattarData);
            source = 'awattar';
        }

        if (source) {
            jsonExplorer.stateSetCreate(`marketprice.${day}.source`, 'Source', source);
        }

        return { prices, source };
    }

    /**
     * Converts data from the Awattar API to the internal price format.
     *
     * @param {any} awattarData - The raw data from Awattar.
     * @returns {any[]} The converted price data.
     */
    _convertAwattarData(awattarData) {
        const prices = [];
        for (const idS in awattarData.data) {
            prices[idS] = {};
            prices[idS].Price = awattarData.data[idS].marketprice;
            const start = new Date(awattarData.data[idS].start_timestamp);
            const iHour = start.getHours() + 1;
            const sHour = pad(iHour, 2);
            prices[idS].Product = `H${sHour}`;
        }
        return prices;
    }

    /**
     * Converts data from the EXAA 10:15 auction API to the internal price format.
     *
     * @param {any} exaa1015Data - The raw data from EXAA 10:15 auction.
     * @returns {any[]} The converted price data.
     */
    _convertExaa1015Data(exaa1015Data) {
        const prices = [];
        for (const idS in exaa1015Data) {
            prices[idS] = {};
            prices[idS].Price = exaa1015Data[idS].y;
            const iHour = exaa1015Data[idS].x;
            const sHour = pad(iHour, 2);
            prices[idS].Product = `H${sHour}`;
        }
        this.log.debug(`prices1Exaa1015 converted to: ${JSON.stringify(prices)}`);
        return prices;
    }

    /**
     * Processes the raw data from the Entsoe API.
     *
     * @param {any} entsoeData The raw data object from the Entsoe API.
     * @param {string} dayString A string like 'today' or 'tomorrow' for logging purposes.
     * @returns {Array<any> | null} An array with the processed price data or null if processing fails.
     */
    _processEntsoeData(entsoeData, dayString) {
        if (!entsoeData) {
            this.log.debug(`No Entsoe data provided for ${dayString}.`);
            return null;
        }

        this.log.debug(`Entsoe data for ${dayString}: ${JSON.stringify(entsoeData)}`);
        console.log(`Entsoe data for ${dayString}: ${JSON.stringify(entsoeData)}`);

        if (entsoeData.TimeSeries[0] == null && entsoeData.TimeSeries == null) {
            this.log.error(`No data available for ${dayString}!`);
            return null;
        }

        let point = [];
        if (entsoeData.TimeSeries[0]?.Period[0]?.Point) {
            point = entsoeData.TimeSeries[0].Period[0].Point;
        } else if (entsoeData.TimeSeries[0]?.Period?.Point) {
            point = entsoeData.TimeSeries[0].Period.Point;
        } else if (entsoeData.TimeSeries?.Period[0]?.Point) {
            point = entsoeData.TimeSeries.Period[0].Point;
        } else if (entsoeData.TimeSeries?.Period?.Point) {
            point = entsoeData.TimeSeries.Period.Point;
        } else {
            const errorMessage = `Received data for ${dayString} did not fit to supported patterns! Received data: ${JSON.stringify(entsoeData)}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }

        const prices = [];
        const length = point.length;
        for (let i = 0; i < length; i++) {
            const ii = String(i);
            prices[ii] = {};
            const price = parseFloat(point[i].price_amount._text);
            const sHour = pad(point[i].position._text, 2);
            prices[ii].Price = price;
            prices[ii].Product = `H${sHour}`;
        }
        return prices;
    }

    /**
     * Handles json-object and creates states for peak hours
     */
    async executeRequestPeakHours() {
        if (this.peakHours == false) {
            const statesToDelete = await this.getStatesAsync(`peakTime.*`);
            for (const idS in statesToDelete) {
                await this.delObjectAsync(idS);
            }
            return null;
        }
        try {
            let result = await this.getDataPeakHours();
            this.log.debug(`Peak hour result is: ${JSON.stringify(result)}`);

            if (!result || !result.StatusInfos) {
                this.log.error('No data available for peak-result!');
                return;
            }

            let day0 = cleanDate(new Date());
            let day1 = addDays(day0, 1);
            let day2 = addDays(day0, 2);
            let day3 = addDays(day0, 3);
            let day4 = addDays(day0, 4);
            let jDay0 = {},
                jDay1 = {},
                jDay2 = {},
                jDay3 = {},
                jDay4 = {},
                jDayAll = {};
            let iHour = 0;
            let sHour = '';
            let i = 1;

            for (const idS in result.StatusInfos) {
                if (!result.StatusInfos[idS].utc) {
                    this.log.error('No UTC found in peak-result!');
                    return 'error';
                }
                this.log.debug(result.StatusInfos[idS].utc);

                iHour = new Date(result.StatusInfos[idS].utc).getHours();

                if (iHour < 9) {
                    sHour = `from_0${String(iHour)}_to_` + `0${String(iHour + 1)}`;
                } else if (iHour == 9) {
                    sHour = `from_0${String(iHour)}_to_${String(iHour + 1)}`;
                } else {
                    sHour = `from_${String(iHour)}_to_${String(iHour + 1)}`;
                }

                let dateToCheck = cleanDate(new Date(result.StatusInfos[idS].utc));
                if (dateToCheck.getTime() == day0.getTime()) {
                    jDay0[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                } else if (dateToCheck.getTime() == day1.getTime()) {
                    jDay1[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                } else if (dateToCheck.getTime() == day2.getTime()) {
                    jDay2[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                } else if (dateToCheck.getTime() == day3.getTime()) {
                    jDay3[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                } else if (dateToCheck.getTime() == day4.getTime()) {
                    jDay4[sHour] = new Date(result.StatusInfos[idS].utc).getTime();
                }

                if (i < 10) {
                    jDayAll[`item 0${i}`] = new Date(result.StatusInfos[idS].utc).getTime();
                } else {
                    jDayAll[`item ${i}`] = new Date(result.StatusInfos[idS].utc).getTime();
                }
                i = i + 1;
            }

            this.log.debug(`Peak jDay0: ${JSON.stringify(jDay0)}`);
            this.log.debug(`Peak jDay1: ${JSON.stringify(jDay1)}`);
            this.log.debug(`Peak jDay2: ${JSON.stringify(jDay2)}`);
            this.log.debug(`Peak jDay3: ${JSON.stringify(jDay3)}`);
            this.log.debug(`Peak jDay4: ${JSON.stringify(jDay4)}`);
            this.log.debug(`Peak jDayAll: ${JSON.stringify(jDayAll)}`);

            await jsonExplorer.traverseJson(jDay0, 'peakTime.today', true, true, 3, false);
            await jsonExplorer.traverseJson(jDay1, 'peakTime.today+1', true, true, 3, false);
            await jsonExplorer.traverseJson(jDay2, 'peakTime.today+2', true, true, 3, false);
            await jsonExplorer.traverseJson(jDay3, 'peakTime.today+3', true, true, 3, false);
            await jsonExplorer.traverseJson(jDay4, 'peakTime.today+4', true, true, 3, false);
            await jsonExplorer.traverseJson(jDayAll, 'peakTime.allDays', true, true, 3, false);

            await jsonExplorer.checkExpire('peakTime.*');
            jsonExplorer.deleteObjectsWithNull('peakTime.*');

            /*
            // check for outdated states to be deleted
            let statesToDelete = await this.getStatesAsync('peakTime.*');
            for (const idS in statesToDelete) {
                let state = await this.getStateAsync(idS);
                if (state && state.val == null) {
                    this.log.debug(`State "${idS}" will be deleted`);
                    await this.delObjectAsync(idS);
                }
            }*/
        } catch (error) {
            let eMsg = `Error in ExecuteRequestPeakHours(): ${error}`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.sendSentry(error);
        }
    }

    /**
     * Creates JSON-data for a single chart.
     *
     * @param {any[]} dataArray array with market prices
     * @param {boolean} isTomorrow true if data is for tomorrow
     * @param {string | null} source source to be used
     * @param {number} allMin minimum value for y-axis
     * @param {number} allMax maximum value for y-axis
     * @param {string} statePath path to the chart state
     * @param {boolean} quarter_hourly true if data is quarter-hourly
     */
    async createSingleChart(dataArray, isTomorrow, source, allMin, allMax, statePath, quarter_hourly) {
        this.log.debug(`Creating chart in state ${statePath}`);
        const chartData = [];
        if (quarter_hourly == false) {
            for (const idS in dataArray) {
                const iHour = parseInt(dataArray[idS][0]); //analysing "00_to_01" with parseInt ignores everything starting with "_"
                chartData[idS] = { y: dataArray[idS][1], t: calcDate(iHour, isTomorrow) };

                //add the final point for the last hour
                const maxIndex = chartData.length - 1;
                if (chartData[maxIndex] && chartData[maxIndex].y && chartData[maxIndex].t) {
                    chartData[maxIndex + 1] = {
                        y: chartData[maxIndex].y,
                        t: chartData[maxIndex].t + 60 * 60 * 1000,
                    };
                }
            }
        } else {
            for (const idS in dataArray) {
                const hours = dataArray[idS][0].substring(0, 2); //analysing "00:00-00:15"
                const minutes = dataArray[idS][0].substring(3, 5);
                let date = cleanDate(new Date());
                if (isTomorrow) {
                    date = addDays(date, 1);
                }
                date.setHours(parseInt(hours));
                date.setMinutes(parseInt(minutes));
                chartData[idS] = { y: dataArray[idS][1], t: date.getTime() };

                //add the final point for the last quarter-hour
                const maxIndex = chartData.length - 1;
                if (chartData[maxIndex] && chartData[maxIndex].y && chartData[maxIndex].t) {
                    chartData[maxIndex + 1] = {
                        y: chartData[maxIndex].y,
                        t: chartData[maxIndex].t + 15 * 60 * 1000,
                    };
                }
            }
        }

        const chart = {
            graphs: [
                {
                    type: 'line',
                    color: 'gray',
                    line_steppedLine: true,
                    xAxis_timeFormats: { hour: 'HH' },
                    xAxis_time_unit: 'hour',
                    yAxis_min: Math.min(0, allMin),
                    yAxis_max: allMax,
                    datalabel_show: 'auto',
                    datalabel_minDigits: 2,
                    datalabel_maxDigits: 2,
                    xAxis_bounds: 'data',
                    line_pointSize: 5,
                    line_PointColor: 'rgba(0, 0, 0, 0)',
                    datalabel_fontSize: 10,
                    datalabel_color: 'black',
                    line_UseFillColor: true,
                    data: chartData,
                },
            ],
        };

        if (isTomorrow && source === 'exaa1015') {
            chart.graphs[0].color = 'lightgray';
        }

        await jsonExplorer.stateSetCreate(statePath, 'jsonChart', JSON.stringify(chart));
    }

    /**
     * Creates JSON-date for charts for today and tomorrow
     *
     * @param {any[]} arrayToday aray with market prices for today
     * @param {any[]} arrayTomorrow array with market prices for tomorrow
     * @param {string | null} sourceTomorrow source to be used
     * @param {boolean} quarter_hourly true if data is quarter-hourly
     */
    async createCharts(arrayToday, arrayTomorrow, sourceTomorrow, quarter_hourly) {
        let todayMin = 1000,
            tomorrowMin = 1000;
        let todayMax = 0,
            tomorrowMax = 0;

        for (const idS in arrayToday) {
            todayMin = Math.min(todayMin, Number(arrayToday[idS][1]));
            todayMax = Math.max(todayMax, Number(arrayToday[idS][1]));
        }
        for (const idS in arrayTomorrow) {
            tomorrowMin = Math.min(tomorrowMin, Number(arrayTomorrow[idS][1]));
            tomorrowMax = Math.max(tomorrowMax, Number(arrayTomorrow[idS][1]));
        }

        const allMin = Math.min(todayMin, tomorrowMin);
        const allMax = Math.max(todayMax, tomorrowMax);
        const roundedMax = Math.ceil((allMax * 1.1) / 5) * 5;

        if (quarter_hourly) {
            await this.createSingleChart(arrayToday, false, null, allMin, roundedMax, 'marketprice_quarter_hourly.today.jsonChart', quarter_hourly);
            await this.createSingleChart(
                arrayTomorrow,
                true,
                sourceTomorrow,
                allMin,
                roundedMax,
                'marketprice_quarter_hourly.tomorrow.jsonChart',
                quarter_hourly,
            );
        } else {
            await this.createSingleChart(arrayToday, false, null, allMin, roundedMax, 'marketprice.today.jsonChart', quarter_hourly);
            await this.createSingleChart(arrayTomorrow, true, sourceTomorrow, allMin, roundedMax, 'marketprice.tomorrow.jsonChart', quarter_hourly);
        }
    }

    /**
     * Handles sentry message
     *
     * @param {any} errorObject Error message for sentry
     */
    sendSentry(errorObject) {
        if (errorObject?.message?.includes('ETIMEDOUT')) {
            return;
        }
        try {
            if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
                const sentryInstance = this.getPluginInstance('sentry');
                if (sentryInstance?.getSentryObject()) {
                    sentryInstance.getSentryObject().captureException(errorObject);
                }
            }
        } catch (error) {
            this.log.error(`Error in function sendSentry() main.js: ${error}`);
        }
    }
    /**
     * @param {number} tradePrice price for trading
     * @returns {number} calculated price based on tradePrice, fees, charges and VAT
     */
    calcPrice(tradePrice) {
        tradePrice = Math.round(tradePrice * 1000) / 1000;
        let price = 0;
        if (this.calculate == true) {
            let provider = Math.abs(tradePrice * this.feeRelative) + this.feeAbsolute;
            let charges = (tradePrice + provider) * this.charges;
            let vat = (tradePrice + provider + charges + this.gridCosts) * this.vat;
            price = tradePrice + provider + charges + this.gridCosts + vat;
        } else {
            price = tradePrice;
        }
        price = Math.round(price * 1000) / 1000;
        this.log.debug(`tradePrice is ${tradePrice} and  finalPrice is ${price}`);
        return price;
    }
}

// @ts-expect-error parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options] options to override in constructor
     */
    module.exports = options => new ApgInfo(options);
} else {
    // otherwise start the instance directly
    new ApgInfo();
}

/**************************************************** */
/*         H E L P E R S                              */
/**************************************************** */

/**
 * sets time to 00:00:00.00000
 *
 * @param {Date} date date to be changed
 */
function cleanDate(date) {
    date.setHours(0, 0, 0, 0);
    return date;
}

/**
 * @param {number} hour hour of the day (0-23)
 * @param {boolean} tomorrow if true, calculates for tomorrow, otherwise for today
 * @returns {number} returns timestamp for given hour of the day
 */
function calcDate(hour, tomorrow = false) {
    let date = cleanDate(new Date());
    if (tomorrow) {
        date = addDays(date, 1);
    }
    date.setHours(hour);
    return date.getTime();
}

/**
 * adds days to a date
 *
 * @param {Date} date origin date
 * @param {number} numberOfDays number of days which origin date shall be added (positive and negative allowes)
 */
function addDays(date, numberOfDays) {
    let newDate = new Date(date.getTime());
    newDate.setDate(newDate.getDate() + numberOfDays);
    return cleanDate(newDate);
}

function compareSecondColumn(a, b) {
    if (a[1] === b[1]) {
        return 0;
    }

    return a[1] < b[1] ? -1 : 1;
}

/**
 * @param {number} num number
 * @param {number} length length
 * @returns {string} returns a string with leading zeros based on given number
 */
function pad(num, length) {
    if (num == null) {
        num = 0;
    }
    let l = Math.floor(length);
    let sn = String(num);
    let snl = sn.length;
    if (snl >= l) {
        return sn;
    }
    return '0'.repeat(l - snl) + sn;
}

/**
 * @param {string} xmlString XML string to be converted
 * @returns {object} returns JSON object converted from XML string
 */
function xml2js(xmlString) {
    // @ts-expect-error replaceAll is a valid method
    xmlString = xmlString.replaceAll(`price.amount`, `price_amount`);
    const jsonResult = JSON.parse(
        convert.xml2json(xmlString, {
            compact: true,
        }),
    );
    return jsonResult;
}
