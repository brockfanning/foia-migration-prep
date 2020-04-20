const path = require('path')
const fs = require('fs')
const parser = require('xml2json')
const xmlFormatter = require('xml-formatter')

const niem = require('./helpers/niem')
const drupal = require('./helpers/drupal')

const args = process.argv.slice(2)
if (args.length < 1) {
    console.log('Please indicate a year. Example: node fix-reports.js 2008')
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

    // Fix the agency abbreviation.
    const agency = drupal.fixAgency(niem.getAgency(report))
    niem.setAgency(report, agency)

    // Remove components with no data.
    niem.removeUnusedComponents(report)

    // Fix all the agency components.
    const niemAgencyComponents = niem.getAgencyComponents(report)
    for (const niemAgencyComponent of niemAgencyComponents) {
        const drupalAgencyComponent = drupal.fixAgencyComponent(niemAgencyComponent, agency)
        niem.replaceAgencyComponent(report, niemAgencyComponent, drupalAgencyComponent)
    }
    const fixedAgencyComponents = niem.getAgencyComponents(report)

    // If we had no components, that means the agency is the component. So we
    // double-check that the agency's abbreviation is also an agency component
    // abbreviation, and if not print a warning.
    if (niemAgencyComponents.length == 0) {
        const drupalAgencyComponents = drupal.getAgencyComponentsForAgency(agency)
        if (!drupalAgencyComponents.includes(agency)) {
            console.log('WARNING: Agency ' + agency + ' appears to be centralized but there is not a matching component in Drupal.')
        }
    }
    // Similarly, if there are any components with an identical abbreviation to
    // the agency, print an alert. This can cause problems.
    else {
        if (fixedAgencyComponents.includes(agency)) {
            console.log('WARNING: Agency ' + agency + ' appears to be decentralized but there is a component with an identical abbreviation.')
        }
    }

    // Fix the DocumentFiscalYearDate.
    niem.fixDocumentFiscalYearDate(report)

    // Fix any elements missing content.
    niem.addOldItemSections(report)
    niem.addExemption3StatuteSection(report)
    niem.addRequestDenialOtherReasonSection(report)
    niem.addComponentAppliedExemptions(report)
    niem.addAppealDenialOtherReasonSection(report)
    niem.addProcessedConsultationSection(report)
    niem.addAppealNonExemptionDenialSection(report)
    niem.addComplexResponseTimeIncrementsSection(report)
    niem.addAppealResponseTimeSection(report)
    niem.addProcessedResponseTimeSection(report)
    niem.addInformationGrantedResponseTimeSection(report)
    niem.addSimpleResponseTimeIncrementsSection(report)
    niem.addExpeditedResponseTimeIncrementsSection(report)
    niem.addPendingPerfectedRequestsSection(report)
    niem.addExpeditedProcessingSection(report)
    niem.addFeeWaiverSection(report)
    niem.addPersonnelAndCostSection(report)
    niem.addFeesCollectedSection(report)
    niem.addBacklogSection(report)
    niem.addProcessedRequestComparisonSection(report)
    niem.addBackloggedRequestComparisonSection(report)
    niem.addProcessedAppealComparisonSection(report)
    niem.addBackloggedAppealComparisonSection(report)

    // Truncate any too-long fields.
    niem.truncateOtherDenialReasonDescriptionText(report)

    // Export the JSON object back into XML.
    const stringified = JSON.stringify(json)
    const xmlPrefix = '<?xml version="1.0"?>'
    const xml = parser.toXml(stringified, { sanitize: true }).replace(/\r?\n|\r/g, ' ')
    const xmlFormatted = xmlFormatter(xml, { lineSeparator: '\n' })

    // Write both versions to disk.
    fs.writeFileSync(outputFilePath, xmlPrefix + xml)
    fs.writeFileSync(formattedFilePath, xmlPrefix + xmlFormatted)
}
