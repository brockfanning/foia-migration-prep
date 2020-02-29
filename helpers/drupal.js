const fs = require('fs')

const DEBUG = false

const drupalAgencies = JSON.parse(fs.readFileSync('helpers/data/drupal-agencies.json', { encoding: 'utf-8' }))

// Import the components. Because these come from JSON in Drupal we have to process them
// a bit so that they match what will be in the XML.
let drupalComponentsJson = fs.readFileSync('helpers/data/drupal-agency-components.json', { encoding: 'utf-8' });
drupalComponentsJson = drupalComponentsJson.replace(/\\u0026/g, '&')
drupalComponentsJson = drupalComponentsJson.replace(/&amp;/g, '&')
drupalComponentsJson = drupalComponentsJson.replace(/&#039;/g, "'")
drupalComponentsJson = drupalComponentsJson.replace(/\\u2013/g, "–")
drupalComponentsJson = drupalComponentsJson.replace(/\\\//g, "/")
const drupalComponents = JSON.parse(drupalComponentsJson)
const agencyFixes = JSON.parse(fs.readFileSync('helpers/data/xml-agency-fixes.json', { encoding: 'utf-8' }))
const agencyComponentFixes = JSON.parse(fs.readFileSync('helpers/data/xml-agency-component-fixes.json', { encoding: 'utf-8' }))

function fixAgency(abbreviation) {
    // Do we need to fix anything?
    const trimmedAbbreviation = normalizeAbbreviation(abbreviation)
    if (agencyAbbreviationExists(trimmedAbbreviation)) {
        // There is already one in Drupal, so we are done.
        return trimmedAbbreviation
    }
    // Attempt to fix it.
    if (!(trimmedAbbreviation in agencyFixes)) {
        throw 'Agency not found: ' + trimmedAbbreviation
    }
    const fixedAbbreviation = agencyFixes[trimmedAbbreviation]
    DEBUG && console.log('AGENCY: Changed ' + abbreviation + ' to ' + fixedAbbreviation)
    return fixedAbbreviation
}

function fixAgencyComponent(abbreviation, agency) {
    // Do we need to fix anything?
    const trimmedAbbreviation = normalizeAbbreviation(abbreviation)
    if (agencyComponentAbbreviationExists(agency, trimmedAbbreviation)) {
        // There is already one in Drupal, so we are done.
        if (trimmedAbbreviation != abbreviation) {
            DEBUG && console.log('COMPONENT: Automatically changed ' + abbreviation + ' to ' + trimmedAbbreviation)
        }
        return trimmedAbbreviation
    }
    // Attempt to fix it.
    if (!(agency in agencyComponentFixes) || !(trimmedAbbreviation in agencyComponentFixes[agency])) {
        throw 'Component not found: ' + trimmedAbbreviation + ' in ' + agency
    }
    const fixedAbbreviation = agencyComponentFixes[agency][trimmedAbbreviation]
    DEBUG && console.log('COMPONENT: Pre-configured map changed ' + abbreviation + ' to ' + fixedAbbreviation)
    return fixedAbbreviation
}

function agencyAbbreviationExists(abbreviation) {
    const matches = drupalAgencies.filter(agency => {
        return agency.field_agency_abbreviation === abbreviation
    })
    return matches.length > 0
}

function agencyComponentAbbreviationExists(agencyAbbreviation, componentAbbreviation) {
    const matches = drupalComponents.filter(component => {
        return component.field_agency_comp_abbreviation === componentAbbreviation &&
               component.field_agency_abbreviation === agencyAbbreviation
    })
    return matches.length > 0
}

// Fix common problems in agency component abbreviations to match what Drupal
// will have.
function normalizeAbbreviation(abbreviation) {
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

function getAgencyComponentsForAgency(agency) {
    const matches = drupalComponents.filter(component => {
        return component.field_agency_abbreviation === agency
    })
    return matches.map(component => component.field_agency_comp_abbreviation)
}

function getAgencyNameFromAbbreviation(abbreviation) {
    const matches = drupalAgencies.filter(agency => {
        return agency.field_agency_abbreviation === abbreviation
    })
    return matches[0].name
}

module.exports = {
    fixAgency,
    fixAgencyComponent,
    getAgencyComponentsForAgency,
    getAgencyNameFromAbbreviation,
}
