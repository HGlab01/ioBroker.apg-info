'use strict';

const utils = require('@iobroker/adapter-core');
const axios = require('axios');
const jsonExplorer = require('iobroker-jsonexplorer');
const stateAttr = require(`./lib/stateAttr.js`); // Load attribute library
const isOnline = require('@esm2cjs/is-online').default;
const { version } = require('./package.json');
const { getDataExaa1015, getDataExaa, getDataAwattar, getDataPeakHours, getDataEntsoe, getDataEpex } = require('./lib/getData.js');
const { addDays, cleanDate, calcDate, pad, compareSecondColumn } = require('./lib/helpers.js');

// Constants
const MAX_DELAY = 25000; //25000
const API_TIMEOUT = 20000; //20000

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
        // @ts-expect-error axiosInstance type
        this.axiosInstance = axios.create({ timeout: API_TIMEOUT });
        this.jsonExplorer = jsonExplorer;
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
        // Initialize adapter
        jsonExplorer.sendVersionInfo(version);
        this.log.info(`Started with JSON-Explorer version ${jsonExplorer.version}`);

        if (this.config.threshold != undefined) {
            this.threshold = this.config.threshold;
        } else {
            this.log.info('Market price threshold not found and set to 10');
        }

        const forecast = this.config.forecast ?? false;
        this.calculate = this.config.calculate ?? false;
        this.peakHours = this.config.peakHours ?? false;
        this.marketPrices = this.config.marketPrices ?? false;
        this.quarterHourly = this.config.quarterHourly ?? false;
        this.hourly = this.config.hourly ?? false;

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
        if (!this.token && country != 'at' && country != 'de') {
            this.log.error('No token defined. Please check readme how to request!');
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
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
            let prices0, prices0q, prices1, prices1q;
            if (country == 'ch') {
                [prices0, prices1] = await Promise.all([
                    (await this._getAndProcessEntsoeData(false, country, false))?.prices,
                    (await this._getAndProcessEntsoeData(true, country, false))?.prices,
                ]);
                prices0 = prices0 == null ? [] : prices0;
                prices1 = prices1 == null ? [] : prices1;
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
     * @param {any[] | null} prices - The array of price objects.
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
        const todayDate = cleanDate(new Date());
        const tomorrowDate = addDays(todayDate, 1);
        let prices0Entsoe = null,
            prices1Entsoe = null;
        let prices0Awattar, prices1Awattar, prices0Exaa, prices1Exaa, prices1Exaa1015, prices0Epex, prices1Epex;
        let todayResult, tomorrowResult, todayResultq, tomorrowResultq;
        const useEntsoe = this.token == null || this.token.length < 10 ? false : true;

        const [eXaaToday, eXaaTomorrow] = await Promise.all([getDataExaa(this, false, country), getDataExaa(this, true, country)]);

        //check for provider for today for quarter-hourly
        if (this.quarterHourly) {
            this.log.info(`Let's check for quarter-hourly market data`);
            prices0Exaa = eXaaToday?.q ?? null;
            if (prices0Exaa == null) {
                this.log.info(`No quarter-hourly market data from Exaa for today, let's try Entsoe`);
                if (useEntsoe) {
                    prices0Entsoe = await this._getAndProcessEntsoeData(false, country, false);
                } else {
                    this.log.info(`No token defined for Entsoe, skipped! Let's continue with Epex`);
                }
                if (useEntsoe && prices0Entsoe?.prices == null) {
                    this.log.info(`No quarter-hourly market data from Entsoe for today, let's try Epex`);
                    prices0Epex = await getDataEpex(this, false, country);
                    if (prices0Epex?.data?.[0] && new Date(prices0Epex.meta.deliveryDate).getTime() === todayDate.getTime()) {
                        this.log.info('Todays quarter-hourly market data from Epex available');
                        this.log.debug(`Todays quarter-hourly market data result from Epex is: ${JSON.stringify(prices0Epex)}`);
                        prices0Epex = prices0Epex.data;
                    } else {
                        prices0Epex = null;
                        this.log.warn('No quarter-hourly market data for today!');
                    }
                }
            }

            //Tomorrow
            prices1Exaa = eXaaTomorrow?.q ?? null;
            if (prices1Exaa == null) {
                this.log.info(`No quarter-hourly market data from Exaa for tomorrow, let's try Entsoe`);
                if (useEntsoe) {
                    prices1Entsoe = await this._getAndProcessEntsoeData(true, country, forecast);
                } else {
                    this.log.info(`No token defined for Entsoe, skipped! Let's continue with Epex`);
                }
                if (useEntsoe && prices1Entsoe?.prices == null) {
                    this.log.info(`No quarter-hourly market data from Entsoe for tomorrow, let's try Epex`);
                    prices1Epex = await getDataEpex(this, true, country);
                    if (prices1Epex?.data?.[0] && new Date(prices1Epex.meta.deliveryDate).getTime() === tomorrowDate.getTime()) {
                        this.log.info('Tomorrows quarter-hourly market data from Epex available');
                        this.log.debug(`Tomorrows quarter-hourly market data result from Epex is: ${JSON.stringify(prices0Epex)}`);
                        prices1Epex = prices1Epex.data;
                    } else {
                        prices1Epex = null;
                        this.log.info('No quarter-hourly market data for tomorrow!');
                    }
                }
            }

            todayResultq =
                prices0Entsoe != null ? prices0Entsoe : this._processMarketPrices('today', prices0Awattar, prices0Exaa, null, prices0Epex, true);
            tomorrowResultq =
                prices1Entsoe != null
                    ? prices1Entsoe
                    : this._processMarketPrices('tomorrow', prices1Awattar, prices1Exaa, prices1Exaa1015, prices1Epex, true);
        } else {
            //delte all states for quarter-hourly
            const statesToDelete = await this.getStatesAsync(`marketprice_quarter_hourly.*`);
            for (const idS in statesToDelete) {
                await this.delObjectAsync(idS);
            }
        }

        if (this.hourly) {
            this.log.info(`Let's check for hourly market data`);
            //check for provider for today for hourly
            prices0Exaa = eXaaToday?.h ?? null;
            if (prices0Exaa == null) {
                this.log.info(`No hourly market data from Exaa for today, let's try Awattar`);
                prices0Awattar = await getDataAwattar(this, false, country);
                if (prices0Awattar?.data?.[0]) {
                    this.log.info('Todays hourly market data from Awattar available');
                    this.log.debug(`Todays hourly market data result from Awattar is: ${JSON.stringify(prices0Awattar)}`);
                } else {
                    this.log.warn('No hourly market data for today!');
                }
            } else {
                this.log.debug(`Todays hourly market data result from Exaa is: ${JSON.stringify(prices0Exaa)}`);
            }

            //check for provider for tomorrow
            prices1Exaa = eXaaTomorrow?.h ?? null;
            if (prices1Exaa == null) {
                this.log.info(`No hourly market data from Exaa for tomorrow, let's try Awattar`);
                prices1Awattar = await getDataAwattar(this, true, country);
                if (prices1Awattar?.data?.[0]) {
                    this.log.info('Tomorrows hourly market data from Awattar available');
                    this.log.debug(`Tomorrow hourly market data result from Awattar is: ${JSON.stringify(prices1Awattar)}`);
                } else {
                    if (forecast) {
                        this.log.info('No hourly market data from Awattar for tomorrow , last chance Exaa 10.15 auction!');
                        const eXaa1015 = await getDataExaa1015(this, country);
                        prices1Exaa1015 = eXaa1015;
                        if (prices1Exaa1015) {
                            this.log.info('Market hourly data from Exaa 10.15 auction available');
                        } else {
                            this.log.info('Bad luck for Exaa 10.15 auction');
                        }
                        this.log.debug(`Tomorrows hourly market data result from Exaa 10.15 auction is: ${JSON.stringify(prices1Exaa1015)}`);
                    } else {
                        this.log.info('No hourly market data from Awattar for tomorrow');
                    }
                }
            } else {
                this.log.debug(`Tomorrows hourly market data result from Exaa is: ${JSON.stringify(prices1Exaa)}`);
            }
            todayResult = this._processMarketPrices('today', prices0Awattar, prices0Exaa, null, prices0Epex, false);
            tomorrowResult = this._processMarketPrices('tomorrow', prices1Awattar, prices1Exaa, prices1Exaa1015, prices1Epex, false);
        } else {
            //delete all stats for hourly
            const statesToDelete = await this.getStatesAsync(`marketprice.*`);
            for (const idS in statesToDelete) {
                await this.delObjectAsync(idS);
            }
        }

        return {
            prices0: todayResult?.prices ?? [],
            prices1: tomorrowResult?.prices ?? [],
            source1: tomorrowResult?.source ?? null,
            prices0q: todayResultq?.prices ?? [],
            prices1q: tomorrowResultq?.prices ?? [],
        };
    }

    /**
     * Fetches and processes market data from Entsoe for today and tomorrow.
     * Includes a retry mechanism for network-related errors.
     *
     * @param {boolean} tomorrow if true, calculation is for tomorrow
     * @param {string} country The country code for the API request.
     * @param {boolean} forecast if true 1015 forecast is checked
     * @returns {Promise<{prices: any[] | null, source: string}>} prices An object containing the processed prices and the source.
     */
    async _getAndProcessEntsoeData(tomorrow, country, forecast) {
        let pricesEntsoe, prices;
        let source = '';
        if (!tomorrow) {
            pricesEntsoe = await getDataEntsoe(this, false, country);
            this.log.debug(`Entsoe Today: ${JSON.stringify(pricesEntsoe)}`);
            prices = this._processEntsoeData(pricesEntsoe, 'today', false) || [];
            source = 'entsoe';
            if (prices.length > 50) {
                jsonExplorer.stateSetCreate('marketprice_quarter_hourly.today.source', 'Source', source);
            } else if (prices.length > 0) {
                jsonExplorer.stateSetCreate('marketprice.today.source', 'Source', source);
            } else {
                source = '';
            }
        } else {
            pricesEntsoe = await getDataEntsoe(this, true, country);
            prices = this._processEntsoeData(pricesEntsoe, 'tomorrow', false) || [];
            source = 'entsoe';
            if (prices.length == 0 && forecast) {
                prices = this._processEntsoeData(pricesEntsoe, 'tomorrow', true) || [];
                source = 'entsoe1015';
            }
            if (prices.length > 50) {
                jsonExplorer.stateSetCreate('marketprice_quarter_hourly.tomorrow.source', 'Source', source);
            } else if (prices.length > 0) {
                jsonExplorer.stateSetCreate('marketprice.tomorrow.source', 'Source', source);
            } else {
                source = '';
            }
        }
        prices = prices.length == 0 ? null : prices;
        return { prices, source };
    }

    /**
     * Processes market prices from different sources for a given day.
     * It selects the best available data source and converts it to a unified format.
     *
     * @param {'today' | 'tomorrow'} day - The day to process ('today' or 'tomorrow').
     * @param {any} awattarData - Data from Awattar API.
     * @param {any} exaaData - Data from EXAA Market Coupling API.
     * @param {any} exaa1015Data - Optional data from EXAA 10:15 auction API (for tomorrow).
     * @param {any} epexData - Data from Epex Market
     * @param {boolean} quarter - quater hourly data yes/no
     * @returns {{prices: any[], source: string}} The processed prices and the source name.
     */
    _processMarketPrices(day, awattarData, exaaData, exaa1015Data, epexData, quarter) {
        let prices = [];
        let source = '';

        if (exaaData) {
            prices = this._convertExaaData(exaaData);
            source = 'exaaMC';
        } else if (day === 'tomorrow' && exaa1015Data) {
            prices = this._convertExaa1015Data(exaa1015Data);
            source = 'exaa1015';
        } else if (awattarData?.data?.[0]) {
            prices = this._convertAwattarData(awattarData);
            source = 'awattar';
        } else if (epexData) {
            prices = this._convertEpexData(epexData);
            source = 'epex';
        }

        if (source) {
            if (quarter) {
                jsonExplorer.stateSetCreate(`marketprice_quarter_hourly.${day}.source`, 'Source', source);
            } else {
                jsonExplorer.stateSetCreate(`marketprice.${day}.source`, 'Source', source);
            }
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
     * Converts data from the EXAA 10:15 auction API to the internal price format.
     *
     * @param {any} epexData - The raw data from EXAA 10:15 auction.
     * @returns {any[]} The converted price data.
     */
    _convertEpexData(epexData) {
        let data = epexData ?? null;
        const prices = [];
        for (const idS in data) {
            prices[idS] = {};
            const index = data[idS]['index'];
            const ersteStelle = Math.ceil(index / 4);
            const zweiteStelle = index % 4 === 0 ? 4 : index % 4;
            const prod = `Q${pad(ersteStelle, 2)}_${zweiteStelle}`;
            prices[idS].Price = data[idS]['Price(€/MWh)'];
            prices[idS].Product = prod;
            prices[idS].ProductText = `${prod} (${data[idS].start}-${data[idS].end})`;
            //prices[idS].SellVolume = data[idS]['Sell Volume(MWh)'];
            //prices[idS].TotalVol = data[idS]['Volume(MWh)'];
            prices[idS].id = `${data[idS].start}-${data[idS].end}`;
        }
        this.log.debug(`pricesEpex converted to: ${JSON.stringify(prices)}`);
        return prices;
    }

    /**
     * Converts data from the EXAA API to the internal price format.
     *
     * @param {any} exaaData - The raw data from EXAA auction.
     * @returns {any[]} The converted price data.
     */
    _convertExaaData(exaaData) {
        //only for quarter-hourly data we have to extract the id from ProductText
        if (exaaData?.[0] != null && exaaData[0].ProductText?.substring(0, 1) == 'q') {
            for (const item of exaaData) {
                const productText = item.ProductText;
                const regexZeit = /(\d{2}:\d{2}\s*-\s*\d{2}:\d{2})/;
                const matchZeit = productText.match(regexZeit);
                if (matchZeit && matchZeit.length > 1) {
                    item.id = matchZeit[1].replace(/ /g, '');
                }
            }
        }
        if (exaaData?.[0] != null) {
            for (const item of exaaData) {
                delete item.SellVolume;
                delete item.TotalVol;
                delete item.BuyVolume;
                delete item.AuctionDay;
            }
        }
        exaaData = exaaData.filter(item => item.id != null);
        return exaaData;
    }

    /**
     * Finds all TimeSeries objects where the
     * 'classificationSequence_AttributeInstanceComponent.position' is "1".
     *
     * @param {object} data - The fully parsed JSON data object containing the TimeSeries array.
     * @param {number} filter - 1 for MC and 2 for 10:15
     * @returns {Array<object>} An array of matching TimeSeries objects.
     */
    filterTimeSeriesByPosition(data, filter) {
        // 1. Get the TimeSeries array safely.
        const allTimeSeries = data?.TimeSeries;

        //if there is no array no need to filter
        if (!Array.isArray(allTimeSeries)) {
            let simpleResult = [];
            simpleResult[0] = allTimeSeries;
            return simpleResult;
        }

        // 2. Filter the array based on the position criteria.
        const matchingSeries = allTimeSeries.filter(ts => {
            try {
                // Access the nested property using bracket notation because of the dots in the key.
                const position = ts['classificationSequence_AttributeInstanceComponent.position']?._text;

                // Check if the extracted text value is exactly '1'.
                return position === String(filter);
            } catch (error) {
                // Log an error if a specific TimeSeries entry is malformed and skip it.
                // @ts-expect-error error ok
                console.warn(`Skipping TimeSeries entry due to error: ${error.message}`);
                return false;
            }
        });

        return matchingSeries;
    }

    /**
     * Processes the raw data from the Entsoe API.
     *
     * @param {any} entsoeData The raw data object from the Entsoe API.
     * @param {string} dayString A string like 'today' or 'tomorrow' for logging purposes.
     * @param {boolean}  earlyAuction if true, 10:15 auction will be used
     * @returns {Array<any> | null} An array with the processed price data or null if processing fails.
     */
    _processEntsoeData(entsoeData, dayString, earlyAuction = false) {
        const filter = earlyAuction ? 2 : 1;
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

        let timeSeries = this.filterTimeSeriesByPosition(entsoeData, filter)[0];
        let point = timeSeries?.Period[0]?.Point ?? null;
        if (point == null) {
            point = timeSeries?.Period?.Point;
        }
        point = point == null ? null : this.fillMissingPositions(point);
        let prices = [];
        const length = point ? point.length : 0;
        for (let i = 0; i < length; i++) {
            const ii = String(i);
            prices[ii] = {};
            const price = parseFloat(point[i].price_amount._text);
            const sPosition = pad(point[i].position._text, 2);

            //quater-hourly
            if (length > 50) {
                const slot = parseInt(point[i].position._text) - 1;
                const nextSlot = slot + 1;
                const hour = pad(Math.floor(slot / 4), 2);
                const minute = pad((slot % 4) * 15, 2);
                const nextHour = pad(Math.floor(nextSlot / 4), 2);
                const nextMinute = pad((nextSlot % 4) * 15, 2);

                prices[ii].Product = `Q${sPosition}`;
                prices[ii].ProductText = `Q${sPosition} (${hour}:${minute}-${nextHour}:${nextMinute})`;
                prices[ii].id = `${hour}:${minute}-${nextHour}:${nextMinute}`;
            } else {
                prices[ii].Product = `H${sPosition}`;
            }
            prices[ii].Price = price;
        }
        return prices;
    }

    /**
     * Fills in missing entries in an array of position/price objects.
     * Missing entries copy the price_amount from the previous existing entry.
     *
     * @param {Array<object>} dataArray - The input array with potentially missing positions.
     * @returns {Array<object>} - The new array with all positions filled sequentially.
     */
    fillMissingPositions(dataArray) {
        // 1. Convert price_amount and position to numbers for easier processing and sorting.
        // This step also prepares the data structure for the final result.
        const processedData = dataArray.map(item => ({
            position: parseInt(item.position._text),
            priceAmount: parseFloat(item.price_amount._text),
        }));

        // 2. Sort the array by position to ensure correct processing
        processedData.sort((a, b) => a.position - b.position);

        const filledArray = [];
        let lastPriceAmount = null;

        // Determine the start and end of the sequence
        const startPosition = processedData.length > 0 ? processedData[0].position : 1;
        const endPosition = processedData.length > 0 ? processedData[processedData.length - 1].position : 0;

        // Create a map for quick look-up of existing positions
        const dataMap = new Map(processedData.map(item => [item.position, item.priceAmount]));

        // 3. Iterate from the first found position to the last found position
        for (let currentPosition = startPosition; currentPosition <= endPosition; currentPosition++) {
            if (dataMap.has(currentPosition)) {
                // Found existing position
                const currentPrice = dataMap.get(currentPosition);

                filledArray.push({
                    position: { _text: String(currentPosition) },
                    price_amount: { _text: String(currentPrice) },
                });

                // Update the last known price for subsequent missing entries
                lastPriceAmount = currentPrice;
            } else if (lastPriceAmount !== null) {
                // Position is missing and we have a previous price, so we fill it in
                // The price is copied from 'lastPriceAmount'
                filledArray.push({
                    position: { _text: String(currentPosition) },
                    price_amount: { _text: String(lastPriceAmount) },
                });
            } else {
                // Case: Missing position at the very beginning of the data (unlikely but safe to handle)
                // You might want to handle this differently, but for now, we skip it.
                console.warn(`Missing position ${currentPosition} found before any price could be established.`);
            }
        }
        return filledArray;
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
            let result = await getDataPeakHours(this);
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

        if (isTomorrow && source?.includes('1015')) {
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

        if (quarter_hourly == true && this.quarterHourly == true) {
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
        }
        if (quarter_hourly == false && this.hourly == true) {
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

// @ts-expect-error parent is valid in compact mode
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
