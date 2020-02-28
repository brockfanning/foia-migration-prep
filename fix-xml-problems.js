const path = require('path')
const fs = require('fs')
const parser = require('xml2json')
const xmlFormatter = require('xml-formatter');

const DEBUG = false

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
    // To make the drilling-down a bit easier.
    const report = json['iepd:FoiaAnnualReport']

    // Fix (and get) the agency abbreviation.
    const agencyAbbreviation = fixAgency(report)

    // Fix all the agency component abbreviations.
    fixAgencyComponents(report, agencyAbbreviation)

    // Fix the DocumentFiscalYearDate.
    fixDocumentFiscalYearDate(report)

    // Fix any elements missing content.
    addOldItemSections(report)
    addExemption3StatuteSection(report)
    addRequestDenialOtherReasonSection(report)
    addComponentAppliedExemptions(report)
    addAppealDenialOtherReasonSection(report)

    // Export the JSON object back into XML.
    const stringified = JSON.stringify(json)
    const xml = parser.toXml(stringified)

    // Format it nicely and write to disk.
    fs.writeFileSync(outputFilePath, '<?xml version="1.0"?>' + xmlFormatter(xml, xmlFormatterOptions))
}

function fixAgency(report) {
    const existingAbbreviation = report['nc:Organization']['nc:OrganizationAbbreviationText']['$t']
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
    report['nc:Organization']['nc:OrganizationAbbreviationText']['$t'] = fixedAbbreviation
    return fixedAbbreviation
}

function fixAgencyComponents(report, agencyAbbreviation) {
    if (!('nc:OrganizationSubUnit' in report['nc:Organization'])) {
        // This agency has no components, so we are done.
        return
    }
    // Sometimes it is not an array.
    if (!Array.isArray(report['nc:Organization']['nc:OrganizationSubUnit'])) {
        fixAgencyComponent(report['nc:Organization']['nc:OrganizationSubUnit'], agencyAbbreviation)
    }
    else {
        for (const agencyComponent of report['nc:Organization']['nc:OrganizationSubUnit']) {
            fixAgencyComponent(agencyComponent, agencyAbbreviation)
        }
    }
}

function fixAgencyComponent(agencyComponent, agencyAbbreviation) {
    const existingAbbreviation = agencyComponent['nc:OrganizationAbbreviationText']['$t']
    // Do we need to fix anything?
    const trimmedAbbreviation = trimAbbreviation(existingAbbreviation)
    if (agencyComponentAbbreviationExists(agencyAbbreviation, trimmedAbbreviation)) {
        // There is already one in Drupal, so we are done.
        if (trimmedAbbreviation != existingAbbreviation) {
            DEBUG && console.log('COMPONENT: Automatically changed ' + existingAbbreviation + ' to ' + trimmedAbbreviation)
        }
        return
    }
    // Attempt to fix it.
    if (!(agencyAbbreviation in agencyComponentFixes) || !(trimmedAbbreviation in agencyComponentFixes[agencyAbbreviation])) {
        throw 'Agency not found: ' + trimmedAbbreviation + ' in ' + agencyAbbreviation
    }
    const fixedAbbreviation = agencyComponentFixes[agencyAbbreviation][trimmedAbbreviation]
    DEBUG && console.log('COMPONENT: Pre-configured map changed ' + existingAbbreviation + ' to ' + fixedAbbreviation)
    agencyComponent['nc:OrganizationAbbreviationText']['$t'] = fixedAbbreviation
}

function fixDocumentFiscalYearDate(report) {
    if ('foia:DocumentFiscalYear' in report) {
        report['foia:DocumentFiscalYearDate'] = report['foia:DocumentFiscalYear']
        delete report['foia:DocumentFiscalYear']
        DEBUG && console.log('XML: changed DocumentFiscalYear to DocumentFiscalYearDate')
    }
}

function addOldItemSections(report) {
    const sections = [
        'foia:OldestPendingAppealSection',
        'foia:OldestPendingRequestSection',
        'foia:OldestPendingConsultationSection'
    ]
    for (const section of sections) {
        if (section in report && 'foia:OldestPendingItems' in report[section]) {
            if (Array.isArray(report[section]['foia:OldestPendingItems'])) {
                continue
            }
            if (!('foia:OldItem' in report[section]['foia:OldestPendingItems'])) {
                report[section]['foia:OldestPendingItems']['foia:OldItem'] = [
                    {
                        'foia:OldItemReceiptDate': { '$t': 'N/A' },
                        'foia:OldItemPendingDaysQuantity': { '$t': '0' }
                    }
                ]
            }
        }
    }
}

function addExemption3StatuteSection(report) {
    if (!('foia:ReliedUponStatute' in report['foia:Exemption3StatuteSection'])) {
        report['foia:Exemption3StatuteSection']['foia:ReliedUponStatute'] = {
            's:id': 'ES8',
            'j:StatuteDescriptionText': { '$t': '0' },
            'foia:ReliedUponStatuteInformationWithheldText': { '$t': '0' },
            'nc:Case': { 'nc:CaseTitleText': { '$t': 'N/A' } }
        }
        report['foia:Exemption3StatuteSection']['foia:ReliedUponStatuteOrganizationAssociation'] = {
            'foia:ComponentDataReference': { 's:ref': 'ES8' },
            'nc:OrganizationReference': { 's:ref': 'ORG0' },
            'foia:ReliedUponStatuteQuantity': { '$t': '0' }
        }
    }
}

function addRequestDenialOtherReasonSection(report) {
    if (!('foia:ComponentOtherDenialReason' in report['foia:RequestDenialOtherReasonSection'])) {
        report['foia:RequestDenialOtherReasonSection']['foia:ComponentOtherDenialReason'] = {
            's:id': 'CODR8',
            'foia:OtherDenialReason': {
                'foia:OtherDenialReasonDescriptionText': { '$t': '0' },
                'foia:OtherDenialReasonQuantity': { '$t': '0' }
            },
            'foia:ComponentOtherDenialReasonQuantity': { '$t': '0' }
        }
        report['foia:RequestDenialOtherReasonSection']['foia:OtherDenialReasonOrganizationAssociation'] = {
            'foia:ComponentDataReference': { 's:ref': 'CODR8' },
            'nc:OrganizationReference': { 's:ref': 'ORG0' }
        }
    }
}

function addComponentAppliedExemptions(report) {
    const sections = [
        'foia:AppealDispositionAppliedExemptionsSection'
    ]
    for (const section of sections) {
        if (section in report && 'foia:ComponentAppliedExemptions' in report[section]) {
            if (!('foia:AppliedExemption' in report[section]['foia:ComponentAppliedExemptions'])) {
                report[section]['foia:ComponentAppliedExemptions']['$t'] = 'N/A'
            }
        }
    }
}

function addAppealDenialOtherReasonSection(report) {
    if (!('foia:ComponentOtherDenialReason' in report['foia:AppealDenialOtherReasonSection'])) {
        report['foia:AppealDenialOtherReasonSection']['foia:ComponentOtherDenialReason'] = {
            's:id': 'ADOR8',
            'foia:OtherDenialReason': {
                'foia:OtherDenialReasonDescriptionText': { '$t': '0' },
                'foia:OtherDenialReasonQuantity': { '$t': '0' }
            },
            'foia:ComponentOtherDenialReasonQuantity': { '$t': '0' }
        }
        report['foia:AppealDenialOtherReasonSection']['foia:OtherDenialReasonOrganizationAssociation'] = {
            'foia:ComponentDataReference': { 's:ref': 'ADOR8' },
            'nc:OrganizationReference': { 's:ref': 'ORG0' }
        }
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
