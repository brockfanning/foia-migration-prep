const path = require('path')
const fs = require('fs')
const parser = require('xml2json')
const xmlFormatter = require('xml-formatter');

const DEBUG = true

const args = process.argv.slice(2)
if (args.length < 1) {
    console.log('Please indicate a year. Example: node prep.js 2008')
    return
}
const drupalAgencies = JSON.parse(fs.readFileSync('drupal-agencies.json', { encoding: 'utf-8' }))

// Import the components. Because these come from JSON in Drupal we have to process them
// a bit so that they match what will be in the XML.
let drupalComponentsJson = fs.readFileSync('drupal-agency-components.json', { encoding: 'utf-8' });
drupalComponentsJson = drupalComponentsJson.replace(/\\u0026/g, '&')
drupalComponentsJson = drupalComponentsJson.replace(/&amp;/g, '&')
drupalComponentsJson = drupalComponentsJson.replace(/&#039;/g, "'")
drupalComponentsJson = drupalComponentsJson.replace(/\\u2013/g, "–")
drupalComponentsJson = drupalComponentsJson.replace(/\\\//g, "/")
const drupalComponents = JSON.parse(drupalComponentsJson)
const agencyFixes = JSON.parse(fs.readFileSync('xml-agency-fixes.json', { encoding: 'utf-8' }))
const agencyComponentFixes = JSON.parse(fs.readFileSync('xml-agency-component-fixes.json', { encoding: 'utf-8' }))

const year = args[0]
const inputFolder = path.join('input', year)
const outputFolder = path.join('output', year)
const xmlFormatterOptions = { lineSeparator: '\n' }

const files = fs.readdirSync(inputFolder)
for (const file of files) {
    const inputFilePath = path.join(inputFolder, file)
    const outputFilePath = path.join(outputFolder, file)

    // Import the XML into a JSON object.
    const input = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
    const json = JSON.parse(parser.toJson(input, { reversible: true }))

    // Fix (and get) the agency abbreviation.
    const agencyAbbreviation = fixAgency(json)

    // Fix all the agency component abbreviations.
    fixAgencyComponents(json, agencyAbbreviation)

    // Fix the DocumentFiscalYearDate.
    fixDocumentFiscalYearDate(json)

    // Fix any elements missing content.
    addMissingContent(json)

    // Export the JSON object back into XML.
    const stringified = JSON.stringify(json)
    const xml = parser.toXml(stringified)

    // Format it nicely and write to disk.
    fs.writeFileSync(outputFilePath, '<?xml version="1.0"?>' + xmlFormatter(xml, xmlFormatterOptions))
}

function fixAgency(json) {
    const existingAbbreviation = json['iepd:FoiaAnnualReport']['nc:Organization']['nc:OrganizationAbbreviationText']['$t']
    // Do we need to fix anything?
    const trimmedAbbreviation = trimAbbreviation(existingAbbreviation)
    if (agencyAbbreviationExists(trimmedAbbreviation)) {
        // There is already one in Drupal, so we are done.
        return trimmedAbbreviation
    }
    // Attempt to fix it.
    if (!(trimmedAbbreviation in agencyFixes)) {
        throw 'Agency not found: ' + trimmedAbbreviation
    }
    const fixedAbbreviation = agencyFixes[trimmedAbbreviation]
    DEBUG && console.log('AGENCY: Changed ' + existingAbbreviation + ' to ' + fixedAbbreviation)
    json['iepd:FoiaAnnualReport']['nc:Organization']['nc:OrganizationAbbreviationText']['$t'] = fixedAbbreviation
    return fixedAbbreviation
}

function fixAgencyComponents(json, agencyAbbreviation) {
    if (!('nc:OrganizationSubUnit' in json['iepd:FoiaAnnualReport']['nc:Organization'])) {
        // This agency has no components, so we are done.
        return
    }
    // Make sure it is an array.
    if (!Array.isArray(json['iepd:FoiaAnnualReport']['nc:Organization']['nc:OrganizationSubUnit'])) {
        json['iepd:FoiaAnnualReport']['nc:Organization']['nc:OrganizationSubUnit'] = [json['iepd:FoiaAnnualReport']['nc:Organization']['nc:OrganizationSubUnit']]
    }
    for (const agencyComponent of json['iepd:FoiaAnnualReport']['nc:Organization']['nc:OrganizationSubUnit']) {
        const existingAbbreviation = agencyComponent['nc:OrganizationAbbreviationText']['$t']
        // Do we need to fix anything?
        const trimmedAbbreviation = trimAbbreviation(existingAbbreviation)
        if (agencyComponentAbbreviationExists(agencyAbbreviation, trimmedAbbreviation)) {
            // There is already one in Drupal, so we are done.
            if (trimmedAbbreviation != existingAbbreviation) {
                DEBUG && console.log('COMPONENT: Automatically changed ' + existingAbbreviation + ' to ' + trimmedAbbreviation)
            }
            continue
        }
        // Attempt to fix it.
        if (!(agencyAbbreviation in agencyComponentFixes) || !(trimmedAbbreviation in agencyComponentFixes[agencyAbbreviation])) {
            throw 'Agency not found: ' + trimmedAbbreviation
        }
        const fixedAbbreviation = agencyComponentFixes[agencyAbbreviation][trimmedAbbreviation]
        DEBUG && console.log('COMPONENT: Pre-configured map changed ' + existingAbbreviation + ' to ' + fixedAbbreviation)
        agencyComponent['nc:OrganizationAbbreviationText']['$t'] = fixedAbbreviation
    }
}

function fixDocumentFiscalYearDate(json) {
    if ('foia:DocumentFiscalYear' in json['iepd:FoiaAnnualReport']) {
        json['iepd:FoiaAnnualReport']['foia:DocumentFiscalYearDate'] = json['iepd:FoiaAnnualReport']['foia:DocumentFiscalYear']
        delete json['iepd:FoiaAnnualReport']['foia:DocumentFiscalYear']
        DEBUG && console.log('XML: changed DocumentFiscalYear to DocumentFiscalYearDate')
    }
}

function addMissingContent(json) {
    DEBUG && console.log(json)
    if ('OldestPendingAppealSection' in json['iepd:FoiaAnnualReport']) {

    }


}

// ****************** HELPER FUNCTIONS **************************

// Look up in the list of agencies whether an abbreviation is there.
function agencyAbbreviationExists(abbreviation) {
    const matches = drupalAgencies.filter(agency => {
        return agency.field_agency_abbreviation === abbreviation
    })
    return matches.length > 0
}

// Look up in the list of agency components where an abbreviation is there.
function agencyComponentAbbreviationExists(agencyAbbreviation, componentAbbreviation) {
    const matches = drupalComponents.filter(component => {
        return component.field_agency_comp_abbreviation === componentAbbreviation &&
               component.field_agency_abbreviation === agencyAbbreviation
    })
    return matches.length > 0
}

// Fix common problems in agency component abbreviations.
function trimAbbreviation(abbreviation) {
  // First trim whitespace.
  abbreviation = abbreviation.trim()
  // Next look for a second word with parentheses.
  const words = abbreviation.split(' ')
  if (words.length > 1 && words[1].startsWith('(') && words[1].endsWith(')')) {
    abbreviation = words[0]
  }
  // Unescape ampersands, since it was in XML.
  abbreviation = abbreviation.replace('&amp;', '&')

  return abbreviation
}
