const path = require('path')
const fs = require('fs')
const parser = require('xml2json')
const stringify = require('csv-stringify')

const niem = require('./helpers/niem')
const drupal = require('./helpers/drupal')

const args = process.argv.slice(2)
if (args.length < 1) {
    console.log('Please indicate a year. Example: node calculate-end-years.js 2008')
    return
}

const reports = {}

// Save reports in memory for speed.
function getReport(year, file) {
    year = parseInt(year).toString()
    if (!(year in reports)) {
        reports[year] = {}
    }
    if (!(file in reports[year])) {
        const inputFilePath = path.join('input', year, file)
        const input = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
        const json = JSON.parse(parser.toJson(input, { reversible: true }))
        const report = json['iepd:FoiaAnnualReport']
        reports[year][file] = report
    }
    return reports[year][file]
}

const rows = [
    [
        'Agency from XML',
        'Agency in Drupal',
        'Component from XML',
        'Component in Drupal',
        'Last year found',
    ]
]

const year = args[0]
const files = fs.readdirSync(path.join('input', year))
for (const file of files) {
    const report = getReport(year, file)
    const niemAgency = niem.getAgency(report)
    for (const niemComponent of niem.getAgencyComponents(report)) {
        const lastYearFound = findLastYear(year, niemAgency, niemComponent)
        let drupalAgency, drupalComponent
        try {
            drupalAgency = drupal.fixAgency(niemAgency)
        }
        catch(error) {
            drupalAgency = 'unknown'
        }
        try {
            drupalComponent = drupal.fixAgencyComponent(niemComponent, drupalAgency)
        }
        catch(error) {
            drupalComponent = 'unknown'
        }
        rows.push([
            niemAgency,
            drupalAgency,
            niemComponent,
            drupalComponent,
            lastYearFound,
        ])
    }
}

stringify(rows, function(err, output) {
    console.log(output)
})

// Find the last year where an abbreviation shows up.
function findLastYear(currentYear, agency, component) {
    const year = parseInt(currentYear) + 1
    const finalYear = 2018
    let lastYearFound = currentYear
    for (let i = year; i <= finalYear; i++) {
        const inputFolder = path.join('input', i.toString())
        const files = fs.readdirSync(inputFolder)
        for (const file of files) {
            const report = getReport(i, file)
            const thisAgency = niem.getAgency(report)
            if (thisAgency != agency) {
                continue
            }
            const thisAgencyComponents = niem.getAgencyComponents(report)
            if (thisAgencyComponents.includes(component)) {
                lastYearFound = i
                break
            }
        }
    }
    return lastYearFound
}