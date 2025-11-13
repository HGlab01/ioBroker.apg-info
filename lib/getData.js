'use strict';

const { addDays, cleanDate, pad, xml2js } = require('./helpers.js');
const { apiCallWithRetry } = require('./api.js');
const cheerio = require('cheerio');

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

/**
 * Retrieves marketdata from REST-API from entsoe
 *
 * @param {any} adapter adapter instance
 * @param {boolean} tomorrow means it is the next day, false means today
 * @param {string} country country of the market
 */
async function getDataEpex(adapter, tomorrow, country) {
    country = country.toUpperCase();
    country = country == 'DE' ? 'DE-LU' : country;

    let day = cleanDate(new Date());
    if (tomorrow) {
        day = addDays(day, 1);
    }
    const dayString = `${day.getFullYear()}-${pad(day.getMonth() + 1, 2)}-${pad(day.getDate(), 2)}`;

    const baseUrl = 'https://www.epexspot.com/en/market-results';
    const params = {
        market_area: country,
        auction: 'MRC',
        delivery_date: dayString,
        modality: 'Auction',
        sub_modality: 'DayAhead',
        data_mode: 'table',
        product: '15',
    };

    return prepareEpexData(adapter, baseUrl, params);
}

async function prepareEpexData(adapter, baseUrl, params) {
    // === Disclaimer-Seite laden ===
    let header = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        'Accept-Encoding': 'identity',
        Connection: 'keep-alive',
        Referer: baseUrl,
    };

    const query = new URLSearchParams(params).toString();
    let uri = `${baseUrl}?${query}`;
    const html1 = await apiCallWithRetry(adapter, uri, 'getDataEpex', response => response?.data ?? null, 'GET', null, header);
    const $1 = cheerio.load(html1);

    const form = $1('form#data-disclaimer-acceptation-form');
    const formBuildId = form.find("input[name='form_build_id']").val();
    const formId = form.find("input[name='form_id']").val();
    const op = form.find("button[name='op']").val();
    const action = form.attr('action') || baseUrl;

    if (!formBuildId) {
        throw new Error('form_build_id nicht gefunden (Disclaimer fehlt?)');
    }

    // === POST absenden, um Zugriff zu bekommen ===
    // @ts-expect-error attributes exist
    const formData = new URLSearchParams({
        form_build_id: formBuildId,
        form_id: formId,
        op: op,
    });
    uri = baseUrl + action;
    adapter.log.debug(uri);

    header['Content-Type'] = `application/x-www-form-urlencoded`;
    await apiCallWithRetry(adapter, uri, 'getDataEpex', response => response?.data ?? null, 'POST', formData.toString(), header);
    delete header['Content-Type'];

    // === Danach die freigeschaltete Seite erneut abrufen ===
    uri = `${baseUrl}?${query}`;
    const html2 = await apiCallWithRetry(adapter, uri, 'getDataEpex', response => response?.data ?? null, 'GET', null, header);
    //const { data: html2 } = await client.get(baseUrl, { params });
    const $ = cheerio.load(html2);

    // === Datum auslesen ===
    const h2Text = $('div.table-container h2').first().text().trim();
    adapter.log.debug(`Datumstitel: ${h2Text}`);
    let deliveryDate = extractDateFromText(h2Text);
    adapter.log.debug(deliveryDate);

    // === Zeiten extrahieren ===
    const timeList = [];
    $('div.custom-tables.\\31 5min .js-table-times ul li a').each((i, el) => {
        const text = $(el).text().trim();
        const [start, end] = text.split(' - ');
        timeList.push({ index: i + 1, start, end });
    });

    adapter.log.debug(`${timeList.length} Zeitabschnitte gefunden.`);
    if (timeList.length === 0) {
        return null;
    }

    // === Werte extrahieren ===
    const headers = [];
    $('div.js-table-values table thead tr:last-child th').each((i, th) => {
        headers.push($(th).text().replace(/\s+/g, ' ').trim());
    });

    const rows = [];
    $('div.js-table-values table tbody tr.child').each((i, tr) => {
        const cells = $(tr).find('td');
        const row = { index: i + 1 };
        headers.forEach((header, j) => {
            row[header] = $(cells[j]).text().trim() || null;
        });
        rows.push(row);
    });

    // === Zeit + Werte kombinieren ===
    const combined = timeList.map((t, i) => ({
        ...t,
        ...(rows[i] || {}),
    }));

    // === Ergebnisobjekt ===
    const result = {
        meta: {
            sourceUrl: `${baseUrl}?${new URLSearchParams(params).toString()}`,
            extractedAt: new Date().toISOString(),
            deliveryDate: deliveryDate,
            entries: combined.length,
        },
        data: combined,
    };

    adapter.log.debug(`EPEX Data fetched: ${JSON.stringify(result.meta)}`);
    return result;
}

/**
 * Extracts a date from a given text in the format "24 October 2025"
 *
 * @param {any} text text containing the date
 * @returns {Date} date object or null if not found
 */
function extractDateFromText(text) {
    // Regex sucht nach Datum im Format "24 October 2025"
    const match = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);

    if (!match) {
        return new Date('1900-01-01');
    }

    const day = parseInt(match[1], 10);
    const monthName = match[2];
    const year = parseInt(match[3], 10);

    // Englische Monatsnamen -> Monatsindex (0–11)
    const months = {
        January: 0,
        February: 1,
        March: 2,
        April: 3,
        May: 4,
        June: 5,
        July: 6,
        August: 7,
        September: 8,
        October: 9,
        November: 10,
        December: 11,
    };

    const month = months[monthName];
    if (month === undefined) {
        throw new Error(`Unbekannter Monat: ${monthName}`);
    }

    return new Date(year, month, day);
}

module.exports = {
    getDataExaa1015,
    getDataExaa,
    getDataAwattar,
    getDataEntsoe,
    getDataEpex,
    getDataPeakHours,
};
