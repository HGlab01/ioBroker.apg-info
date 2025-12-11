'use strict';

const { addDays, cleanDate, pad, xml2js } = require('./helpers.js');
const { apiCallWithRetry } = require('./api.js');

/**
 * Retrieves marketdata from REST-API from Exaa
 *
 * @param {any} adapter adapter instance
 * @param {string} country country of the market
 */
async function getDataExaa1015(adapter, country) {
    country = country.toUpperCase();
    const day = addDays(cleanDate(new Date()), 1);

    const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const uri = `https://www.exaa.at/data/market-results?delivery_day=${dateStringToday}&market=${country}&auction=1015`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);

    return apiCallWithRetry(adapter, uri, 'getDataExaa1015', response => {
        if (country === 'AT') {
            return response?.data?.AT?.price ?? null;
        }
        return response?.data?.DE?.price ?? null;
    });
}

/**
 * Retrieves marketdata from REST-API from Exaa
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow true means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataExaa(adapter, tomorrow, country) {
    let day = cleanDate(new Date());
    if (tomorrow) {
        day = addDays(day, 1);
    }
    const whichDay = tomorrow == true ? 'tomorrow' : 'today';

    const dateStringToday = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
    const uri = `https://www.exaa.at/data/trading-results?delivery_day=${dateStringToday}&market=${country}&auction=market_coupling`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);

    return apiCallWithRetry(adapter, uri, `getDataExaa_${whichDay}`, response => response?.data?.data ?? null);
}

/**
 * Retrieves marketdata from REST-API from EnergyCharts
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow true means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataEnergyCharts(adapter, tomorrow, country) {
    let date = cleanDate(new Date());
    date = tomorrow ? addDays(date, 1) : date;
    const whichDay = tomorrow == true ? 'tomorrow' : 'today';
    const dateString = `${date.getFullYear()}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
    country = country == 'DE' ? 'DE-LU' : country.toUpperCase();

    const uri = `https://api.energy-charts.info/price?bzn=${country}&start=${dateString}`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);

    return apiCallWithRetry(adapter, uri, `getDataEnergyCharts_${whichDay}`, response => response?.data ?? null);
}

/**
 * Retrieves marketdata from REST-API from Awattar
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow true means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataAwattar(adapter, tomorrow, country) {
    const day0 = cleanDate(new Date());
    let start = 0;
    let end = 0;
    if (tomorrow) {
        const day1 = addDays(day0, 1);
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
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);
    return apiCallWithRetry(adapter, uri, 'getDataAwattar', response => response.data);
}

/**
 * Retrieves peak hours from REST-API
 *
 * @param {any} adapter adapter instance
 */
async function getDataPeakHours(adapter) {
    const uri = `https://awareness.cloud.apg.at/api/v1/PeakHourStatus`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);
    return apiCallWithRetry(adapter, uri, 'getDataPeakHours', response => response?.data ?? null);
}

/**
 * Retrieves marketdata from REST-API from entsoe
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataEntsoe(adapter, tomorrow, country) {
    const url = 'https://web-api.tp.entsoe.eu/api?documentType=A44';
    const securityToken = adapter.token;
    const whichDay = tomorrow == true ? 'tomorrow' : 'today';

    let dayBeginn = cleanDate(new Date());
    if (tomorrow) {
        dayBeginn = addDays(dayBeginn, 1);
    }
    let dayEnd = new Date(dayBeginn);
    dayEnd.setHours(23, 59, 59);

    const datebegin =
        dayBeginn.getUTCFullYear() +
        pad(dayBeginn.getUTCMonth() + 1, 2) +
        pad(dayBeginn.getUTCDate(), 2) +
        pad(dayBeginn.getUTCHours(), 2) +
        pad(dayBeginn.getUTCMinutes(), 2);
    const dateend =
        dayEnd.getUTCFullYear() +
        pad(dayEnd.getUTCMonth() + 1, 2) +
        pad(dayEnd.getUTCDate(), 2) +
        pad(dayEnd.getUTCHours(), 2) +
        pad(dayEnd.getUTCMinutes(), 2);

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
            adapter.log.error('Country not found in definitions');
    }

    const uri = `${url}&securityToken=${securityToken}&periodStart=${datebegin}&periodEnd=${dateend}&in_Domain=${domain}&Out_Domain=${domain}`;
    adapter.log.debug(`API-Call ${uri}`);
    console.log(`API-Call ${uri}`);

    return apiCallWithRetry(
        adapter,
        uri,
        `getDataEntsoe_${whichDay}`,
        response => {
            const result = response?.data == null ? null : xml2js(response.data);
            return result?.Publication_MarketDocument ?? null;
        },
        'GET',
        null,
        null,
        35000,
    );
}

module.exports = {
    getDataExaa1015,
    getDataExaa,
    getDataAwattar,
    getDataEntsoe,
    getDataPeakHours,
    getDataEnergyCharts,
};
