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
const formattedFolder = path.join('formatted', year)
const xmlFormatterOptions = { lineSeparator: '\n' }

const files = fs.readdirSync(inputFolder)
for (const file of files) {
    const inputFilePath = path.join(inputFolder, file)
    const outputFilePath = path.join(outputFolder, file)
    const formattedFilePath = path.join(formattedFolder, file)

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
    addProcessedConsultationSection(report)
    addAppealNonExemptionDenialSection(report)
    addComplexResponseTimeIncrementsSection(report)
    addAppealResponseTimeSection(report)
    addProcessedResponseTimeSection(report)
    addInformationGrantedResponseTimeSection(report)
    addSimpleResponseTimeIncrementsSection(report)
    addExpeditedResponseTimeIncrementsSection(report)
    addPendingPerfectedRequestsSection(report)

    // Export the JSON object back into XML.
    const stringified = JSON.stringify(json)
    const xml = parser.toXml(stringified)

    // Format it nicely and write to disk.
    fs.writeFileSync(outputFilePath, '<?xml version="1.0"?>' + xml)
    fs.writeFileSync(formattedFilePath, '<?xml version="1.0"?>' + xmlFormatter(xml, xmlFormatterOptions))
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
    const sections = {
        'foia:OldestPendingAppealSection': 'OPA10',
        'foia:OldestPendingRequestSection': 'OPR10',
        'foia:OldestPendingConsultationSection': 'OPC10',
    }
    const subsection = 'foia:OldestPendingItems'
    const item = 'foia:OldItem'
    const orgAssociation = 'foia:OldestPendingItemsOrganizationAssociation'
    for (const [section, sectionId] of Object.entries(sections)) {
        if (section in report) {
            if (!(subsection in report[section])) {
                report[section][subsection] = { 's:id': sectionId }
                report[section][orgAssociation] = getOrgAssociation(sectionId)
            }
            else if (Array.isArray(report[section][subsection])) {
                continue
            }
            if (!(item in report[section][subsection])) {
                report[section][subsection][item] = [
                    {
                        'foia:OldItemReceiptDate': { '$t': 'N/A' },
                        'foia:OldItemPendingDaysQuantity': { '$t': 0 }
                    }
                ]
            }
        }
    }
}

function addExemption3StatuteSection(report) {
    const section = 'foia:Exemption3StatuteSection'
    const subsection = 'foia:ReliedUponStatute'
    const sectionId = 'ES8'
    const orgAssociation = 'foia:ReliedUponStatuteOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'j:StatuteDescriptionText': { '$t': 0 },
            'foia:ReliedUponStatuteInformationWithheldText': { '$t': 0 },
            'nc:Case': { 'nc:CaseTitleText': { '$t': 'N/A' } }
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
        report[section][orgAssociation]['foia:ReliedUponStatuteQuantity'] = { '$t': 0 }
    }
}

function addRequestDenialOtherReasonSection(report) {
    const section = 'foia:RequestDenialOtherReasonSection'
    const subsection = 'foia:ComponentOtherDenialReason'
    const sectionId = 'CODR8'
    const orgAssociation = 'foia:OtherDenialReasonOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:OtherDenialReason': {
                'foia:OtherDenialReasonDescriptionText': { '$t': 0 },
                'foia:OtherDenialReasonQuantity': { '$t': 0 }
            },
            'foia:ComponentOtherDenialReasonQuantity': { '$t': 0 }
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addComponentAppliedExemptions(report) {
    const sections = {
        'foia:AppealDispositionAppliedExemptionsSection': 'ADE1',
        'foia:RequestDispositionAppliedExemptionsSection': 'RDE1'
    }
    const subsection = 'foia:ComponentAppliedExemptions'
    const item = 'foia:AppliedExemption'
    const orgAssociation = 'foia:ComponentAppliedExemptionsOrganizationAssociation'
    for (const [section, sectionId] of Object.entries(sections)) {
        if (section in report) {
            if (!(subsection in report[section])) {
                report[section][subsection] = { 's:id': sectionId }
                report[section][orgAssociation] = getOrgAssociation(sectionId)
            }
            else if (Array.isArray(report[section][subsection])) {
                continue
            }
            if (!(item in report[section][subsection])) {
                report[section][subsection]['$t'] = 'N/A'
            }
        }
    }
}

function addAppealDenialOtherReasonSection(report) {
    const section = 'foia:AppealDenialOtherReasonSection'
    const sectionId = 'ADOR8'
    const subsection = 'foia:ComponentOtherDenialReason'
    const orgAssociation = 'foia:OtherDenialReasonOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:OtherDenialReason': {
                'foia:OtherDenialReasonDescriptionText': { '$t': 0 },
                'foia:OtherDenialReasonQuantity': { '$t': 0 }
            },
            'foia:ComponentOtherDenialReasonQuantity': { '$t': 0 }
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addProcessedConsultationSection(report) {
    const section = 'foia:ProcessedConsultationSection'
    const sectionId = 'PCN1'
    const subsection = 'foia:ProcessingStatistics'
    const orgAssociation = 'foia:ProcessingStatisticsOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:ProcessingStatisticsPendingAtStartQuantity': { '$t': 0 },
            'foia:ProcessingStatisticsReceivedQuantity': { '$t': 0 },
            'foia:ProcessingStatisticsProcessedQuantity': { '$t': 0 },
            'foia:ProcessingStatisticsPendingAtEndQuantity': { '$t': 0 },
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addAppealNonExemptionDenialSection(report) {
    const section = 'foia:AppealNonExemptionDenialSection'
    const sectionId = 'ANE1'
    const subsection = 'foia:AppealNonExemptionDenial'
    const orgAssociation = 'foia:AppealNonExemptionDenialOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = { 's:id': sectionId }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addComplexResponseTimeIncrementsSection(report) {
    const section = 'foia:ComplexResponseTimeIncrementsSection'
    const sectionId = 'CRT1'
    const subsection = 'foia:ComponentResponseTimeIncrements'
    const orgAssociation = 'foia:ResponseTimeIncrementsOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:TimeIncrement': getTimeIncrements(),
            'foia:TimeIncrementTotalQuantity': { '$t': 0 }
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addAppealResponseTimeSection(report) {
    const section = 'foia:AppealResponseTimeSection'
    const sectionId = 'ART0'
    const subsection = 'foia:ResponseTime'
    const orgAssociation = 'foia:ResponseTimeOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = getResponseTimes()
        report[section][subsection]['s:id'] = sectionId
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addProcessedResponseTimeSection(report) {
    const section = 'foia:ProcessedResponseTimeSection'
    const sectionId = 'PRT0'
    const subsection = 'foia:ProcessedResponseTime'
    const orgAssociation = 'foia:ProcessedResponseTimeOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:SimpleResponseTime': getResponseTimes(),
            'foia:ComplexResponseTime': getResponseTimes(),
            'foia:ExpeditedResponseTime': getResponseTimes(),
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addInformationGrantedResponseTimeSection(report) {
    const section = 'foia:InformationGrantedResponseTimeSection'
    const sectionId = 'IGR0'
    const subsection = 'foia:ProcessedResponseTime'
    const orgAssociation = 'foia:ProcessedResponseTimeOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:SimpleResponseTime': getResponseTimes(),
            'foia:ComplexResponseTime': getResponseTimes(),
            'foia:ExpeditedResponseTime': getResponseTimes(),
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addSimpleResponseTimeIncrementsSection(report) {
    const section = 'foia:SimpleResponseTimeIncrementsSection'
    const sectionId = 'SRT1'
    const subsection = 'foia:ComponentResponseTimeIncrements'
    const orgAssociation = 'foia:ResponseTimeIncrementsOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:TimeIncrement': getTimeIncrements(),
            'foia:TimeIncrementTotalQuantity': { '$t': 0 }
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addExpeditedResponseTimeIncrementsSection(report) {
    const section = 'foia:ExpeditedResponseTimeIncrementsSection'
    const sectionId = 'ERT1'
    const subsection = 'foia:ComponentResponseTimeIncrements'
    const orgAssociation = 'foia:ResponseTimeIncrementsOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:TimeIncrement': getTimeIncrements(),
            'foia:TimeIncrementTotalQuantity': { '$t': 0 }
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addPendingPerfectedRequestsSection(report) {
    const section = 'foia:PendingPerfectedRequestsSection'
    const sectionId = 'PPR0'
    const subsection = 'foia:PendingPerfectedRequests'
    const orgAssociation = 'foia:PendingPerfectedRequestsOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:SimplePendingRequestStatistics': getPendingRequests(),
            'foia:ComplexPendingRequestStatistics': getPendingRequests(),
            'foia:ExpeditedPendingRequestStatistics': getPendingRequests(),
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

// ****************** HELPER FUNCTIONS **************************

// Get the blank content for a time increments section.
function getTimeIncrements() {
    return [
        {
            'foia:TimeIncrementCode': { '$t': '1-20' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '21-40' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '41-60' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '61-80' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '81-100' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '101-120' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '121-140' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '141-160' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '161-180' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '181-200' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '201-300' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '301-400' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
        {
            'foia:TimeIncrementCode': { '$t': '400+' },
            'foia:TimeIncrementProcessedQuantity': { '$t': 0 }
        },
    ]
}

// Get a blank object for the response times.
function getResponseTimes() {
    return {
        'foia:ResponseTimeMedianDaysValue': { '$t': 0 },
        'foia:ResponseTimeAverageDaysValue': { '$t': 0 },
        'foia:ResponseTimeLowestDaysValue': { '$t': 0 },
        'foia:ResponseTimeHighestDaysValue': { '$t': 0 },
    }
}

// Get a blank object for organization association in the XML.
function getOrgAssociation(sectionId) {
    return {
        'foia:ComponentDataReference': { 's:ref': sectionId },
        'nc:OrganizationReference': { 's:ref': 'ORG0' }
    }
}

// Get a blank object for pending requests.
function getPendingRequests() {
    return {
        'foia:PendingRequestQuantity': { '$t': 0 },
        'foia:PendingRequestMedianDaysValue': { '$t': 0 },
        'foia:PendingRequestAverageDaysValue': { '$t': 0 },
    }
}

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
