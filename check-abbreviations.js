const path = require('path')
const fs = require('fs')
const parser = require('xml2json')
const stringify = require('csv-stringify')

const niem = require('./helpers/niem')
const drupal = require('./helpers/drupal')

const args = process.argv.slice(2)
if (args.length < 1) {
    console.log('Please indicate a year. Example: node check-agencies.js 2008')
    return
}

const year = args[0]
const files = fs.readdirSync(path.join('input', year))

const agencyRows = [
    [
        'Abbrev from XML',
        'Abbrev in Drupal',
        'Needs to be created',
        'XML file',
    ]
]
const componentRows = [
    [
        'Agency',
        'Abbrev from XML',
        'Abbrev in Drupal',
        'Needs to be created',
        'XML file',
    ]
]

for (const file of files) {
    const inputFilePath = path.join('input', year, file)

    // Import the XML into a JSON object.
    const input = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
    const json = JSON.parse(parser.toJson(input, { reversible: true }))

    // To make the drilling-down a bit easier.
    const report = json['iepd:FoiaAnnualReport']

    // Check for incorrect agency abbreviations.
    const niemAgency = niem.getAgency(report)
    let drupalAgency = null
    try {
        drupalAgency = drupal.fixAgency(niemAgency)
    }
    catch(error) {
        agencyRows.push([
            niemAgency,
            '',
            '',
            file
        ])
    }

    // Check for incorrect agency component abbreviations.
    for (const niemAgencyComponent of niem.getAgencyComponents(report)) {
        let drupalAgencyComponent = null
        try {
            drupalAgencyComponent = drupal.fixAgencyComponent(niemAgencyComponent, drupalAgency)
        }
        catch(error) {
            componentRows.push([
                drupal.getAgencyNameFromAbbreviation(drupalAgency),
                niemAgencyComponent,
                '',
                '',
                file
            ])
        }
    }
}

if (agencyRows.length > 1) {
    console.log('')
    console.log('**********************')
    console.log('** Missing agencies **')
    console.log('**********************')
    stringify(agencyRows, function(err, output) {
        console.log(output)
    })
}
if (componentRows.length > 1) {
    console.log('')
    console.log('************************')
    console.log('** Missing components **')
    console.log('************************')
    stringify(componentRows, function(err, output) {
        console.log(output)
    })
}