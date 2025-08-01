'use strict';

/*
 * Created with @iobroker/create-adapter v1.25.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios');
const convert = require('xml-js');

const jsonExplorer = require('iobroker-jsonexplorer');
const stateAttr = require(`${__dirname}/lib/stateAttr.js`); // Load attribute library
const isOnline = require('@esm2cjs/is-online').default;
const { version } = require('./package.json');

//global variables
let threshold = 10;
const maxDelay = 25000; //25000
// @ts-expect-error axios.create is ok
const axiosInstance = axios.create({ timeout: 30000 }); //30000

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

        if (this.config.threshold) {
            threshold = this.config.threshold;
        } else {
            this.log.info('Market price threshold not found and set to 10');
        }

        if (this.config.forecast != undefined) {
            forecast = this.config.forecast;
        } else {
            this.log.info('Forecast config not found and set to disbaled');
        }

        if (this.config.calculate != undefined) {
            this.calculate = this.config.calculate;
        }
        if (this.calculate == true) {
            if (this.config.feeAbsolute != undefined) {
                this.feeAbsolute = this.config.feeAbsolute;
            }
            if (this.config.feeRelative != undefined) {
                this.feeRelative = this.config.feeRelative / 100;
            }
            if (this.config.vat != undefined) {
                this.vat = this.config.vat / 100;
            }
            if (this.config.charges != undefined) {
                this.charges = this.config.charges / 100;
            }
            if (this.config.gridCosts != undefined) {
                this.gridCosts = this.config.gridCosts;
            }
        }

        if (this.config?.country) {
            country = this.config.country;
        } else {
            this.log.error('Country for market not found. Please confifure in Config');
            this.terminate ? this.terminate(utils.EXIT_CODES.UNCAUGHT_EXCEPTION) : process.exit(0);
        }

        if (country != 'at' && country != 'de') {
            if (this.config?.tokenEncrypted) {
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

        const callApiDelay = Math.floor(Math.random() * maxDelay);
        this.log.info(`Delay execution by ${callApiDelay}ms to better spread API calls`);
        await jsonExplorer.sleep(callApiDelay);

        await jsonExplorer.setLastStartTime();
        let resultPeakHours = await this.ExecuteRequestPeakHours();
        let resultDayAhead = await this.ExecuteRequestDayAhead(country, forecast);

        if (resultPeakHours == 'error' || resultDayAhead == 'error') {
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
            axiosInstance
                .get(uri)
                .then(response => {
                    if (!response || !response.data) {
                        throw new Error(
                            `getDataPeakHours(): Respone empty for URL ${uri} with status code ${response.status}`,
                        );
                    } else {
                        this.log.debug(
                            `Response in getDataPeakHours(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        console.log(
                            `Response in getDataPeakHours(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        resolve(response.data);
                    }
                })
                .catch(error => {
                    if (error?.response?.data) {
                        console.error(
                            `Error in getDataPeakHours(): ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                        this.log.error(
                            `Error to get peak hours ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                    } else {
                        console.error(`Error in getDataPeakHours(): ${error}`);
                        this.log.error(`Error to get peak hours ${error}`);
                    }
                    if (error?.response?.status >= 500) {
                        resolve(null);
                    } else {
                        reject(error);
                    }
                });
        });
    }

    /**
     * Retrieves marketdata from REST-API from Exaa
     *
     * @param {boolean} tomorrow true means it is the next day, false means today
     * @param {string} country country of the market
     */
    async getDataDayAheadExaa(tomorrow, country) {
        const day0 = cleanDate(new Date());
        const day1 = addDays(day0, 1);
        let day = new Date();
        if (tomorrow) {
            day = day1;
        } else {
            day = day0;
        }
        const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
        const uri = `https://www.exaa.at/data/trading-results?delivery_day=${dateStringToday}&market=${country}&auction=market_coupling`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);

        return new Promise((resolve, reject) => {
            axiosInstance
                .get(uri)
                .then(response => {
                    if (!response || !response.data) {
                        throw new Error(
                            `getDataDayAheadExaa(): Respone empty for URL ${uri} with status code ${response.status}`,
                        );
                    } else {
                        this.log.debug(
                            `Response in getDataDayAheadExaa(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        console.log(
                            `Response in getDataDayAheadExaa(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        if (response.data.data) {
                            resolve(response.data.data.h);
                        } else {
                            resolve(null);
                        }
                    }
                })
                .catch(error => {
                    if (error?.response?.data) {
                        console.error(
                            `Error in getDataDayAheadExaa(): ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                        this.log.error(
                            `Error to get market price (Exaa) ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                    } else {
                        console.error(`Error in getDataDayAheadExaa(): ${error}`);
                        this.log.error(`Error to get market price (Exaa) ${error}`);
                    }
                    if (error?.response?.status >= 500) {
                        resolve(null);
                    } else {
                        reject(error);
                    }
                });
        });
    }

    /**
     * Retrieves marketdata from REST-API from Exaa
     *
     * @param {string} country country of the market
     */
    async getDataDayAheadExaa1015(country) {
        country = country.toUpperCase();
        const day0 = cleanDate(new Date());
        const day = addDays(day0, 1);

        const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
        const uri = `https://www.exaa.at/data/market-results?delivery_day=${dateStringToday}&market=${country}&auction=1015`;
        this.log.debug(`API-Call ${uri}`);
        console.log(`API-Call ${uri}`);

        return new Promise((resolve, reject) => {
            axiosInstance
                .get(uri)
                .then(response => {
                    if (!response || !response.data) {
                        throw new Error(
                            `getDataDayAheadExaa1015(): Respone empty for URL ${uri} with status code ${response.status}`,
                        );
                    } else {
                        this.log.debug(
                            `Response in getDataDayAheadExaa1015(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        console.log(
                            `Response in getDataDayAheadExaa1015(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        if (response.data && response.data.AT && response.data.AT.price) {
                            if (country == 'AT') {
                                resolve(response.data.AT.price);
                            } else {
                                resolve(response.data.DE.price);
                            }
                        } else {
                            resolve(null);
                        }
                    }
                })
                .catch(error => {
                    if (error?.response?.data) {
                        console.error(
                            `Error in getDataDayAheadExaa1015(): ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                        this.log.error(
                            `Error to get market price (Exaa1015) ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                    } else {
                        console.error(`Error in getDataDayAheadExaa1015(): ${error}`);
                        this.log.error(`Error to get market price (Exaa1015) ${error}`);
                    }
                    if (error?.response?.status >= 500) {
                        resolve(null);
                    } else {
                        reject(error);
                    }
                });
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
        return new Promise((resolve, reject) => {
            axiosInstance
                .get(uri)
                .then(response => {
                    if (!response || !response.data) {
                        throw new Error(
                            `getDataDayAheadAwattar(): Respone empty for URL ${uri} with status code ${response.status}`,
                        );
                    } else {
                        this.log.debug(
                            `Response in getDataDayAheadAwattar(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        console.log(
                            `Response in getDataDayAheadAwattar(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        resolve(response.data);
                    }
                })
                .catch(error => {
                    if (error?.response?.data) {
                        console.error(
                            `Error in getDataDayAheadAwattar(): ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                        this.log.error(
                            `Error to get market price (Awattar) ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                    } else {
                        console.error(`Error in getDataDayAheadAwattar(): ${error}`);
                        this.log.error(`Error to get market price (Awattar) ${error}`);
                    }
                    if (error?.response?.status >= 500) {
                        resolve(null);
                    } else {
                        reject(error);
                    }
                });
        });
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
        const day0 = cleanDate(new Date());
        const day1 = addDays(day0, 1);
        let day = new Date();
        if (tomorrow) {
            day = day1;
        } else {
            day = day0;
        }
        let dayPlus = addDays(day, 1);

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

        return new Promise((resolve, reject) => {
            axiosInstance
                .get(uri)
                .then(response => {
                    if (!response || !response.data) {
                        throw new Error(
                            `getDataDayAheadEntsoe(): Respone empty for URL ${uri} with status code ${response.status}`,
                        );
                    } else {
                        this.log.debug(
                            `Response in getDataDayAheadEntsoe(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        console.log(
                            `Response in getDataDayAheadEntsoe(): [${response.status}] ${JSON.stringify(response.data)}`,
                        );
                        let result = xml2js(response.data);
                        if (result.Publication_MarketDocument) {
                            resolve(result.Publication_MarketDocument);
                        } else {
                            resolve(null);
                        }
                    }
                })
                .catch(error => {
                    if (error?.response?.data) {
                        console.error(
                            `Error in getDataDayAheadEntsoe(): ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                        this.log.warn(
                            `Error to get market price (Entsoe) ${error} with response ${JSON.stringify(error.response.data)}`,
                        );
                    } else {
                        console.error(`Error in getDataDayAheadEntsoe(): ${error}`);
                        this.log.warn(`Error to get market price (Entsoe) ${error}`);
                    }
                    reject(error);
                });
        });
    }

    /**
     * Handles json-object and creates states for market prices
     *
     * @param {string} country country of the market
     * @param {boolean} forecast also checks 10.15 auction for next day
     */
    async ExecuteRequestDayAhead(country, forecast) {
        let source1 = '',
            source0 = '';
        try {
            let prices0Awattar, prices1Awattar, prices0Exaa, prices1Exaa, prices1Exaa1015, prices0Entsoe, prices1Entsoe;

            const day0 = cleanDate(new Date());
            const day1 = addDays(day0, 1);
            jsonExplorer.stateSetCreate('marketprice.today.date', 'date', day0.getTime());
            jsonExplorer.stateSetCreate('marketprice.tomorrow.date', 'date', day1.getTime());
            let prices0 = [],
                prices1 = [];
            let tomorrow = false;
            if (country == 'ch') {
                try {
                    tomorrow = false;
                    prices0Entsoe = await this.getDataDayAheadEntsoe(tomorrow, country);
                    tomorrow = true;
                    prices1Entsoe = await this.getDataDayAheadEntsoe(tomorrow, country);
                } catch (error) {
                    if (
                        String(error).includes('read ECONNRESET') ||
                        String(error).includes('timeout') ||
                        String(error).includes('socket hang up')
                    ) {
                        this.log.info(`Let's wait 3 minutes and try again...`);
                        await jsonExplorer.sleep(3 * 60 * 1000);
                        this.log.info(`OK! Let's try again now!`);
                        if (tomorrow == false) {
                            prices0Entsoe = await this.getDataDayAheadEntsoe(tomorrow, country);
                            tomorrow = true;
                            prices1Entsoe = await this.getDataDayAheadEntsoe(tomorrow, country);
                        } else {
                            prices1Entsoe = await this.getDataDayAheadEntsoe(tomorrow, country);
                        }
                    } else {
                        throw error;
                    }
                }
                this.log.debug(`Today ${JSON.stringify(prices0Entsoe)}`);
                this.log.debug(`Tomorrow ${JSON.stringify(prices1Entsoe)}`);

                //Convert Etsoe-structure to Exaa-structure for today and tomorrow
                if (prices0Entsoe) {
                    this.log.debug(`prices0Entsoe: ${JSON.stringify(prices0Entsoe)}`);
                    console.log(`prices0Entsoe: ${JSON.stringify(prices0Entsoe)}`);
                    if (prices0Entsoe.TimeSeries[0] == null && prices0Entsoe.TimeSeries == null) {
                        this.log.error('No data available for today!');
                        return;
                    }

                    let point = [];
                    if (prices0Entsoe.TimeSeries[0]?.Period[0]?.Point) {
                        point = prices0Entsoe.TimeSeries[0].Period[0].Point;
                    } else if (prices0Entsoe.TimeSeries[0]?.Period?.Point) {
                        point = prices0Entsoe.TimeSeries[0].Period.Point;
                    } else if (prices0Entsoe.TimeSeries?.Period[0]?.Point) {
                        point = prices0Entsoe.TimeSeries.Period[0].Point;
                    } else if (prices0Entsoe.TimeSeries?.Period?.Point) {
                        point = prices0Entsoe.TimeSeries.Period.Point;
                    } else {
                        console.error(
                            `Received data for today did not fit to supported patterns! Received data: ${JSON.stringify(prices0Entsoe)}`,
                        );
                        throw new Error(
                            `Received data for today did not fit to supported patterns! Received data: ${JSON.stringify(prices0Entsoe)}`,
                        );
                    }

                    let length = point.length;
                    for (let i = 0; i < length; i++) {
                        let ii = String(i);
                        prices0[ii] = {};
                        let price = parseFloat(point[i].price_amount._text);
                        let sHour = pad(point[i].position._text, 2);
                        prices0[ii].Price = price;
                        prices0[ii].Product = `H${sHour}`;
                    }
                    jsonExplorer.stateSetCreate('marketprice.today.source', 'Source', 'entsoe');
                }

                if (prices1Entsoe) {
                    this.log.debug(`prices1Entsoe: ${JSON.stringify(prices1Entsoe)}`);
                    console.log(`prices1Entsoe: ${JSON.stringify(prices1Entsoe)}`);
                    if (prices1Entsoe.TimeSeries[0] == null && prices1Entsoe.TimeSeries == null) {
                        this.log.error('No data available for tomorrow!');
                        return;
                    }

                    let point = [];
                    if (prices1Entsoe.TimeSeries[0]?.Period[0]?.Point) {
                        point = prices1Entsoe.TimeSeries[0].Period[0].Point;
                    } else if (prices1Entsoe.TimeSeries[0]?.Period?.Point) {
                        point = prices1Entsoe.TimeSeries[0].Period.Point;
                    } else if (prices1Entsoe.TimeSeries?.Period[0]?.Point) {
                        point = prices1Entsoe.TimeSeries.Period[0].Point;
                    } else if (prices1Entsoe.TimeSeries?.Period?.Point) {
                        point = prices1Entsoe.TimeSeries.Period.Point;
                    } else {
                        throw new Error(
                            `Received data for tomorrow did not fit to supported patterns! Received data: ${JSON.stringify(
                                prices1Entsoe,
                            )}`,
                        );
                    }

                    let length = point.length;
                    for (let i = 0; i < length; i++) {
                        let ii = String(i);
                        prices1[ii] = {};
                        let price = parseFloat(point[i].price_amount._text);
                        let sHour = pad(point[i].position._text, 2);
                        prices1[ii].Price = price;
                        prices1[ii].Product = `H${sHour}`;
                    }
                    jsonExplorer.stateSetCreate('marketprice.tomorrow.source', 'Source', 'entsoe');
                }
            } else {
                prices0Awattar = await this.getDataDayAheadAwattar(false, country);
                if (prices0Awattar && prices0Awattar.data) {
                    this.log.debug(`Day ahead result for Awattar today is: ${JSON.stringify(prices0Awattar.data)}`);
                } else {
                    this.log.debug(`Day ahead result for Awattar today is: NO DATA`);
                }
                if (!prices0Awattar || !prices0Awattar.data || !prices0Awattar.data[0]) {
                    this.log.info(`No prices from Awattar for today, let's try Exaa`);
                    prices0Exaa = await this.getDataDayAheadExaa(false, country);
                    this.log.debug(`Day ahead result for Exaa today is: ${JSON.stringify(prices0Exaa)}`);
                    if (!prices0Exaa) {
                        this.log.warn('No market data for today');
                    }
                }
                prices1Awattar = await this.getDataDayAheadAwattar(true, country);
                if (prices1Awattar && prices1Awattar.data) {
                    this.log.debug(`Day ahead result for Awattar tomorrow is: ${JSON.stringify(prices1Awattar.data)}`);
                } else {
                    this.log.debug(`Day ahead result for Awattar tomorrow is: NO DATA`);
                }
                if (!prices1Awattar || !prices1Awattar.data || !prices1Awattar.data[0]) {
                    this.log.info(`No prices from Awattar for tomorrow, let's try Exaa`);
                    prices1Exaa = await this.getDataDayAheadExaa(true, country);
                    this.log.debug(`Day ahead result for Exaa tomorrow is: ${JSON.stringify(prices1Exaa)}`);
                    if (!prices1Exaa && forecast) {
                        this.log.info('No prices from Exaa MC, last change Exaa 10.15 auction');
                        prices1Exaa1015 = await this.getDataDayAheadExaa1015(country);
                        this.log.debug(`Day ahead result for Exaa1015 tomorrow is: ${JSON.stringify(prices1Exaa1015)}`);
                    }
                }

                //Convert Awattar-structure to Exaa-structure for today
                prices0 = [];
                if (prices0Exaa) {
                    prices0 = prices0Exaa;
                    source0 = 'exaaMC';
                    jsonExplorer.stateSetCreate('marketprice.today.source', 'Source', source0);
                } else {
                    if (prices0Awattar && prices0Awattar.data && prices0Awattar.data[0]) {
                        for (const idS in prices0Awattar.data) {
                            prices0[idS] = {};
                            prices0[idS].Price = prices0Awattar.data[idS].marketprice;
                            let start = new Date(prices0Awattar.data[idS].start_timestamp);
                            let iHour = start.getHours() + 1;
                            let sHour = pad(iHour, 2);
                            prices0[idS].Product = `H${sHour}`;
                        }
                        source0 = 'awattar';
                        jsonExplorer.stateSetCreate('marketprice.today.source', 'Source', source0);
                    }
                }

                //Convert structures to Exaa-structure for tomorrow
                prices1 = [];
                if (prices1Exaa) {
                    prices1 = prices1Exaa;
                    source1 = 'exaaMC';
                    jsonExplorer.stateSetCreate('marketprice.tomorrow.source', 'Source', source1);
                } else {
                    if (prices1Exaa1015) {
                        for (const idS in prices1Exaa1015) {
                            prices1[idS] = {};
                            prices1[idS].Price = prices1Exaa1015[idS].y;
                            let iHour = prices1Exaa1015[idS].x;
                            let sHour = pad(iHour, 2);
                            prices1[idS].Product = `H${sHour}`;
                        }
                        this.log.debug(`prices1Exaa1015 converted to: ${JSON.stringify(prices1)}`);
                        source1 = 'exaa1015';
                        jsonExplorer.stateSetCreate('marketprice.tomorrow.source', 'Source', source1);
                    } else if (prices1Awattar && prices1Awattar.data && prices1Awattar.data[0]) {
                        for (const idS in prices1Awattar.data) {
                            prices1[idS] = {};
                            prices1[idS].Price = prices1Awattar.data[idS].marketprice;
                            let start = new Date(prices1Awattar.data[idS].start_timestamp);
                            let iHour = start.getHours() + 1;
                            let sHour = pad(iHour, 2);
                            prices1[idS].Product = `H${sHour}`;
                        }
                        source1 = 'awattar';
                        jsonExplorer.stateSetCreate('marketprice.tomorrow.source', 'Source', source1);
                    }
                }
            }

            if (prices0) {
                await jsonExplorer.TraverseJson(prices0, 'marketprice.details.today', true, true);
            } else {
                await jsonExplorer.TraverseJson(null, 'marketprice.details.today', true, true);
            }
            if (prices1) {
                await jsonExplorer.TraverseJson(prices1, 'marketprice.details.tomorrow', true, true);
            } else {
                await jsonExplorer.TraverseJson(null, 'marketprice.details.tomorrow', true, true);
            }

            let jDay0 = {},
                jDay1 = {},
                jDay0BelowThreshold = {},
                jDay1BelowThreshold = {},
                jDay0AboveThreshold = {},
                jDay1AboveThreshold = {};
            let days0Above = 0,
                days0Below = 0,
                days1Above = 0,
                days1Below = 0;

            //manage today (day0)
            for (const idS in prices0) {
                if (prices0[idS].Price == undefined) {
                    this.log.error('No marketprice found in marketprice-result for today!');
                    return 'error';
                }

                let product = prices0[idS].Product;
                let marketprice = this.calcPrice(prices0[idS].Price / 10);
                this.log.debug(`Marketprice for product ${product} is ${marketprice}`);

                let sEndHour = product.substring(1, 3);
                let iEndHour = Number(sEndHour);
                let iBeginHour = iEndHour - 1;
                let sBeginHour = pad(iBeginHour, 2);

                let range = `${sBeginHour}_to_${sEndHour}`;
                jDay0[range] = marketprice;
                if (marketprice < threshold) {
                    jDay0BelowThreshold[range] = marketprice;
                    days0Below++;
                } else {
                    jDay0AboveThreshold[range] = marketprice;
                    days0Above++;
                }
            }
            this.log.debug(`Day0 looks like ${JSON.stringify(jDay0)}`);

            //manage tomorrow (day1)
            for (const idS in prices1) {
                if (prices1[idS].Price == undefined) {
                    this.log.error('No marketprice found in marketprice-result for tomorrow!');
                    return 'error';
                }

                let product = prices1[idS].Product;
                let marketprice = this.calcPrice(prices1[idS].Price / 10);
                this.log.debug(`Marketprice for product ${product} is ${marketprice}`);

                let sEndHour = product.substring(1, 3);
                let iEndHour = Number(sEndHour);
                let iBeginHour = iEndHour - 1;
                let sBeginHour = pad(iBeginHour, 2);

                let range = `${sBeginHour}_to_${sEndHour}`;
                jDay1[range] = marketprice;
                if (marketprice < threshold) {
                    jDay1BelowThreshold[range] = marketprice;
                    days1Below++;
                } else {
                    jDay1AboveThreshold[range] = marketprice;
                    days1Above++;
                }
            }
            this.log.debug(`Day1 looks like ${JSON.stringify(jDay1)}`);

            //put data into an array
            let arrBelow0 = Object.keys(jDay0BelowThreshold).map(key => [key, jDay0BelowThreshold[key]]);
            let arrBelow1 = Object.keys(jDay1BelowThreshold).map(key => [key, jDay1BelowThreshold[key]]);
            let arrAll0 = Object.keys(jDay0).map(key => [key, jDay0[key]]);
            let arrAll1 = Object.keys(jDay1).map(key => [key, jDay1[key]]);

            jDay0BelowThreshold.numberOfHours = days0Below;
            jDay0AboveThreshold.numberOfHours = days0Above;
            jDay1BelowThreshold.numberOfHours = days1Below;
            jDay1AboveThreshold.numberOfHours = days1Above;

            this.createChart(arrAll0, arrAll1, source1);

            this.log.debug(`Marketprice jDay0: ${JSON.stringify(jDay0)}`);
            this.log.debug(`Marketprice jDay0BelowThreshold: ${JSON.stringify(jDay0BelowThreshold)}`);
            this.log.debug(`Marketprice jDay0AboveThreshold: ${JSON.stringify(jDay0AboveThreshold)}`);
            this.log.debug(`Marketprice jDay1: ${JSON.stringify(jDay1)}`);
            this.log.debug(`Marketprice jDay1AboveThreshold: ${JSON.stringify(jDay1AboveThreshold)}`);
            this.log.debug(`Marketprice jDay1BelowThreshold: ${JSON.stringify(jDay1BelowThreshold)}`);

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
            let sortedHours0 = [],
                sortedHours1 = [],
                sortedHoursAll0 = [],
                sortedHoursAll1 = [];
            let sortedHours0Short = [],
                sortedHours1Short = [],
                sortedHours0ShortAll = [],
                sortedHours1ShortAll = [];
            let priceSum0 = 0,
                priceSum1 = 0;
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

            await jsonExplorer.traverseJson(sortedHours0, 'marketprice.belowThreshold.today_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHours1, 'marketprice.belowThreshold.tomorrow_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHoursAll0, 'marketprice.today_sorted', true, true);
            await jsonExplorer.traverseJson(sortedHoursAll1, 'marketprice.tomorrow_sorted', true, true);
            await jsonExplorer.stateSetCreate(
                'marketprice.belowThreshold.today_sorted.short',
                'today sorted short',
                JSON.stringify(sortedHours0Short),
            );
            await jsonExplorer.stateSetCreate(
                'marketprice.belowThreshold.tomorrow_sorted.short',
                'tomorrow sorted short',
                JSON.stringify(sortedHours1Short),
            );
            await jsonExplorer.stateSetCreate(
                'marketprice.today_sorted.short',
                'today sorted short',
                JSON.stringify(sortedHours0ShortAll),
            );
            await jsonExplorer.stateSetCreate(
                'marketprice.tomorrow_sorted.short',
                'tomorrow sorted short',
                JSON.stringify(sortedHours1ShortAll),
            );
            await jsonExplorer.stateSetCreate('marketprice.today.average', 'average', price0Avg);
            await jsonExplorer.stateSetCreate('marketprice.tomorrow.average', 'average', price1Avg);

            await jsonExplorer.checkExpire('marketprice.*');
            await jsonExplorer.deleteObjectsWithNull('marketprice.*Threshold.*');
            await jsonExplorer.deleteObjectsWithNull('marketprice.details.*');
        } catch (error) {
            let eMsg = `Error in ExecuteRequestDayAhead(): ${error}`;
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

            await jsonExplorer.traverseJson(jDay0, 'peakTime.today', true, true);
            await jsonExplorer.traverseJson(jDay1, 'peakTime.today+1', true, true);
            await jsonExplorer.traverseJson(jDay2, 'peakTime.today+2', true, true);
            await jsonExplorer.traverseJson(jDay3, 'peakTime.today+3', true, true);
            await jsonExplorer.traverseJson(jDay4, 'peakTime.today+4', true, true);
            await jsonExplorer.traverseJson(jDayAll, 'peakTime.allDays', true, true);

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
            let eMsg = `Error in ExecuteRequestPeakHours(): ${error})`;
            this.log.error(eMsg);
            console.error(eMsg);
            this.sendSentry(error);
        }
    }

    /**
     * Creates JSON-date for charts for today and tomorrow
     *
     * @param arrayToday aray with market prices for today
     * @param arrayTomorrow array with market prices for tomorrow
     * @param sourceTomorrow source to be used
     */
    async createChart(arrayToday, arrayTomorrow, sourceTomorrow) {
        let todayData = [];
        let tomorrowData = [];
        let chart = {};

        let todayMin = 1000,
            tomorrowMin = 1000;
        let todayMax = 0,
            tomorrowMax = 0;

        for (const idS in arrayToday) {
            let iHour = parseInt(arrayToday[idS][0]); //analysing "00_to_01" with parseInt ignores everything starting with "_"
            todayData[idS] = { y: arrayToday[idS][1], t: calcDate(iHour, false) };
            todayMin = Math.min(todayMin, Number(arrayToday[idS][1]));
            todayMax = Math.max(todayMax, Number(arrayToday[idS][1]));
        }
        for (const idS in arrayTomorrow) {
            let iHour = parseInt(arrayTomorrow[idS][0]); //analysing "00_to_01" with parseInt ignores everything starting with "_"
            tomorrowData[idS] = { y: arrayTomorrow[idS][1], t: calcDate(iHour, true) };
            tomorrowMin = Math.min(tomorrowMin, Number(arrayTomorrow[idS][1]));
            tomorrowMax = Math.max(tomorrowMax, Number(arrayTomorrow[idS][1]));
        }

        let allMin = Math.min(todayMin, tomorrowMin);
        let allMax = Math.max(todayMax, tomorrowMax);
        allMax = Math.ceil((allMax * 1.1) / 5) * 5;

        let todayMaxIndex = todayData.length - 1;
        let tomorrowMaxIndex = tomorrowData.length - 1;
        if (todayData[todayMaxIndex] && todayData[todayMaxIndex].y && todayData[todayMaxIndex].t) {
            todayData[todayMaxIndex + 1] = {
                y: todayData[todayMaxIndex].y,
                t: todayData[todayMaxIndex].t + 60 * 60 * 1000,
            };
        }
        if (tomorrowData[tomorrowMaxIndex] && tomorrowData[tomorrowMaxIndex].y && tomorrowData[tomorrowMaxIndex].t) {
            tomorrowData[tomorrowMaxIndex + 1] = {
                y: tomorrowData[tomorrowMaxIndex].y,
                t: tomorrowData[tomorrowMaxIndex].t + 60 * 60 * 1000,
            };
        }

        chart.graphs = [];
        chart.graphs[0] = {};
        chart.graphs[0].type = 'line';
        chart.graphs[0].color = 'gray';
        chart.graphs[0].line_steppedLine = true;
        chart.graphs[0].xAxis_timeFormats = { hour: 'HH' };
        chart.graphs[0].xAxis_time_unit = 'hour';
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
        if (sourceTomorrow == 'exaa1015') {
            chart.graphs[0].color = 'lightgray';
        }
        await jsonExplorer.stateSetCreate('marketprice.tomorrow.jsonChart', 'jsonChart', JSON.stringify(chart));
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
