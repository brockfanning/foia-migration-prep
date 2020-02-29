const path = require('path')
const fs = require('fs')
const parser = require('xml2json')

const niem = require('./helpers/niem')
const drupal = require('./helpers/drupal')

const args = process.argv.slice(2)
if (args.length < 1) {
    console.log('Please indicate a year. Example: node calculate-end-year.js 2008')
    return
}

const year = args[0]
const files = fs.readdirSync(path.join('input', year))
for (const file of files) {
    const inputFilePath = path.join('input', year, file)
    const outputFilePath = path.join('output', year, file)
    const formattedFilePath = path.join('formatted', year, file)

    // Import the XML into a JSON object.
    const input = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
    const json = JSON.parse(parser.toJson(input, { reversible: true }))

    // To make the drilling-down a bit easier.
    const report = json['iepd:FoiaAnnualReport']

// Find the last year where an abbreviation shows up.
function findLastYear(currentYear, abbreviationToSearch, alternateAbbreviationToSearch) {
    const year = parseInt(currentYear) + 1
    const finalYear = 2018
    let lastYearFound = currentYear
    for (let i = year; i <= finalYear; i++) {
        const inputFolder = path.join('input', i.toString())
        const files = fs.readdirSync(inputFolder)
        for (const file of files) {
            let foundThisYear = false
            const inputFilePath = path.join(inputFolder, file)
            let xml = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
            const matches = getElements('nc:OrganizationAbbreviationText', xml)
            for (const match of matches) {
                const abbreviation = getValue(match)
                if (abbreviation == abbreviationToSearch) {
                    foundThisYear = true
                }
                else if (abbreviation == alternateAbbreviationToSearch) {
                    foundThisYear = true
                }
            }
            if (foundThisYear) {
                lastYearFound = i
            }
        }
    }
    let name = getAgencyComponentName(abbreviationToSearch)
    if (!name) {
        name = getAgencyComponentName(alternateAbbreviationToSearch)
    }
    console.log('"' + name + '",' + lastYearFound)
}