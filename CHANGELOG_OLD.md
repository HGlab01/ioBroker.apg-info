# Older changes
## 0.1.23 (2025-10-29)
* (HGlab01) extend to two market data providers for quarter-hourly market prices
* (HGlab01) add turn on/off quarter-hourly and hourly market prices
* (HGlab01) refactorings

## 0.1.22 (2025-10-21)
* (HGlab01) Implement retry mechanism for API calls
* (HGlab01) add turn on/off for peak hours and market prices

## 0.1.21 (2025-10-13)
* (HGlab01) Support quater-hourly tarifs
* (HGlab01) Bump iobroker-jsonexplorer to 0.2.1

## 0.1.20 (2025-10-06)
* (HGlab01) prepeare iobroker-jsonexplorer readiness for v0.2.0
* (HGlab01) Bump axios to 1.12.2

## 0.1.19 (2025-06-23)
* (HGlab01) use encrypted token in config

## 0.1.18 (2025-06-16)
* (HGlab01) Log finetuning
* (HGlab01) Bump axios to 1.10.0

## 0.1.17 (2025-06-03)
* (HGlab01) Add retry mechanism for Entsoe

## 0.1.16 (2025-05-18)
* (HGlab01) Optimize Entsoe (Swiss market) requests
* (HGlab01) Extend timeout for Api calls to 30 seconds 
* (HGlab01) Bump axios to 1.9.0

## 0.1.15 (2025-04-17)
* (HGlab01) fix 'Cannot read properties of undefined (reading 'price_amount')'

## 0.1.14 (2025-03-30)
* (HGlab01) Fix switch to summer time begin issue
* (HGlab01) Bump axios to 1.8.4
* (HGlab01) Fix warning "State attribute definition missing for 'item xx' 
* (HGlab01) Fix provider-fee% calculation if base price is negative ([#354](https://github.com/HGlab01/ioBroker.apg-info/issues/354))

## 0.1.13 (2025-03-12)
* (HGlab01) Bump axios to 1.8.3

## 0.1.12 (2025-03-06)
* (HGlab01) Fix warning definition missing for 'from_19_to_20'
* (HGlab01) Fix warning definition missing for 'item xx'
* (HGlab01) Bump axios to 1.8.1

## 0.1.11 (2024-10-20)
* (HGlab01) improve UI config (#296)

## 0.1.10 (2024-10-04)
* (HGlab01) fix issue #290
* (HGlab01) bump axios to 1.7.7

## 0.1.9 (2024-08-21)
* (HGlab01) Support eslint9

## 0.1.8 (2024-07-31)
* (HGlab01) Swiss market support; Token needed! Check readme!
* (HGlab01) Bump json-explorer to 0.1.16

## 0.1.7 (2024-05-27)
* (HGlab01) Add date to today and tomorrow to make the date of today and tomorrow clear
* (HGlab01) bump axios to 1.7.2

## 0.1.6 (2024-03-17)
* (HGlab01) fix issue in debug-mode: Cannot read properties of null (reading 'data')
* (HGlab01) bump axios to 1.6.8

## 0.1.5 (2024-01-20)
* (HGlab01) Add fee, grid costs and tax calculation

## 0.1.4 (2024-01-15)
* (HGlab01) fix 'Cannot read properties of undefined (reading 'status')'

## 0.1.3 (2023-12-26)
* (HGlab01) Fix issue 'Request failed with status code 500' (#170)

## 0.1.2 (2023-12-22)
* (HGlab01) Fix issue 'no marketprice found' when price is 0.00
* (HGlab01) Bump json-explorer to 0.1.15

## 0.1.1 (2023-12-14)
* (HGlab01) support Exxa10.15 auction as forecast

## 0.1.0 (2023-12-04)
* (HGlab01) first minor release
* (HGlab01) Node.js 18 or higher
* (HGlab01) ioBroker host (js-controller) 5.0 or higher
* (HGlab01) Bump axios to 1.6.2
* (HGlab01) use both providers (Awattar and Exaa) for market prices

## 0.0.7 (2023-10-11)
* (HGlab01) Bump json-explorer to 0.1.14
* (HGlab01) add jsonChart-json for market prices

## 0.0.6 (2023-10-04)
* (HGlab01) fix "TypeError: Cannot read properties of undefined (reading 'Warning')"

## 0.0.5 (2023-10-03)
* (HGlab01) switch data provider for prices to EXAA
* (HGlab01) support DE market prices in addiotion to AT prices

## 0.0.3 (2023-09-24)
* (HGlab01) add point in times sorted as array
* (HGlab01) add average price
* (HGlab01) fix bug IOBROKER-APG-INFO-2 notified by sentry

## 0.0.2 (2023-09-14)
* (HGlab01) add number of days below/above treshold
* (HGlab01) add states sorted by price

## 0.0.1 (2023-09-11)
* (HGlab01) first release
