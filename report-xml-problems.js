const path = require('path')
const fs = require('fs')
const parser = require('xml2json')

const niem = require('./helpers/niem')
const drupal = require('./helpers/drupal')
const years = ['2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018']

const reportsCentralized = []
const drupalsCentralized = []
const yearlyTotals = {}
const reportsCentralizedChanges = []
const reportsLastCentralized = {}

for (const year of years) {
    const files = fs.readdirSync(path.join('input', year))
    for (const file of files) {
        const inputFilePath = path.join('input', year, file)

        // Import the XML into a JSON object.
        const input = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
        const json = JSON.parse(parser.toJson(input, { reversible: true }))

        // To make the drilling-down a bit easier.
        const report = json['iepd:FoiaAnnualReport']

        // Fix the agency abbreviation.
        const agency = drupal.fixAgency(niem.getAgency(report))
        const reportComponents = niem.getAgencyComponents(report)
        const drupalComponents = drupal.getAgencyComponentsForAgency(agency)
        const reportCentralized = (reportComponents.length == 0)
        const drupalCentralized = (drupalComponents.length == 1)

        const ident = agency + ' - ' + year + ' - ' + file
        if (reportCentralized && !drupalCentralized) {
            reportsCentralized.push('Report CENTRALIZED but not in Drupal: ' + ident)
        }
        if (!reportCentralized && drupalCentralized) {
            drupalsCentralized.push('Drupal CENTRALIZED but not in Report: ' + ident)
        }

        if (!(year in yearlyTotals)) {
            yearlyTotals[year] = {}
        }
        if (!(agency in yearlyTotals[year])) {
            yearlyTotals[year][agency] = 0
        }
        yearlyTotals[year][agency] += 1

        if (agency in reportsLastCentralized) {
            const lastCentralized = reportsLastCentralized[agency]
            if (lastCentralized != reportCentralized) {
                const from = (lastCentralized ? 'centralized' : 'decentralized')
                const to = (reportCentralized ? 'centralized' : 'decentralized')
                const change = 'from ' + from + ' to ' + to
                const msg = 'In ' + year + ' ' + agency + ' changed ' + change + '.'
                reportsCentralizedChanges.push(msg)
            }
        }
        reportsLastCentralized[agency] = reportCentralized
    }
}

/*
for (const msg of drupalsCentralized) {
    console.log(msg)
}

for (const msg of reportsCentralized) {
    console.log(msg)
}
*/

/*
for (const year of Object.keys(yearlyTotals)) {
    for (const agency of Object.keys(yearlyTotals[year])) {
        const total = yearlyTotals[year][agency]
        if (total > 1) {
            console.log('In ' + year + ' there were ' + total + ' ' + agency + ' reports.')
        }
    }
}
*/

for (const msg of reportsCentralizedChanges) {
    console.log(msg)
}