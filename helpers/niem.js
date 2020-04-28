const DEBUG = false

function getAgency(report) {
    return report['nc:Organization']['nc:OrganizationAbbreviationText']['$t']
}

function setAgency(report, abbreviation) {
    return report['nc:Organization']['nc:OrganizationAbbreviationText']['$t'] = abbreviation
}

function getUnusedComponents(report, remove=false) {

    if (!('nc:OrganizationSubUnit' in report['nc:Organization'])) {
        // This agency has no components, so we are done.
        return []
    }

    let elements = report['nc:Organization']['nc:OrganizationSubUnit']

    // Make sure it is an array.
    if (!Array.isArray(elements)) {
        elements = [elements]
    }

    // Quick and dirty way to determine usage of component orgs.
    const orgs = elements.map(el => el['s:id'])
    const json = JSON.stringify(report)
    const unusedOrgs = orgs.filter(org => {
        const pattern = '"s:ref":"' + org + '"'
        return (json.match(new RegExp(pattern, "g")) || []).length < 1
    })

    const usedElements = elements.filter(el => !unusedOrgs.includes(el['s:id']))
    const unusedElements = elements.filter(el => unusedOrgs.includes(el['s:id']))

    if (remove) {
        report['nc:Organization']['nc:OrganizationSubUnit'] = usedElements
    }

    return unusedElements.map(el => el['nc:OrganizationAbbreviationText']['$t'])
}

function removeUnusedComponents(report) {
    getUnusedComponents(report, true)
}

function isAgencyCentralized(report) {
    if (!('nc:OrganizationSubUnit' in report['nc:Organization'])) {
        // This agency has no components, so we are done.
        return true
    }

    let agencyComponentElements = report['nc:Organization']['nc:OrganizationSubUnit']

    // Sometimes it is not an array, just a single object.
    if (!Array.isArray(agencyComponentElements)) {
        agencyComponentElements = [agencyComponentElements['nc:OrganizationAbbreviationText']['$t']]
    }

    const agencyComponentAbbreviations = agencyComponentElements.map(el => {
        return el['nc:OrganizationAbbreviationText']['$t']
    })

    // We need to remove the agency itself from the subunits, if it is there.
    const agency = getAgency(report);
    const agencyComponentAbbreviationsWithoutAgency = agencyComponentAbbreviations.filter(abbrev => abbrev !== agency)

    if (agencyComponentAbbreviationsWithoutAgency.length === 0) {
        return true;
    }

    // If still here, there are multiple orgs, so this is probably not
    // centralized. But first check for unused components. If all the
    // components are unused, then this actually can be considered to be
    // centralized.
    const unused = getUnusedComponents(report)
    if (agencyComponentAbbreviationsWithoutAgency.every(abbrev => unused.includes(abbrev))) {
        return true;
    }

    // Finally if still here, this is decentralized for sure.
    return false;
}

function getAgencyComponents(report) {

    if (!('nc:OrganizationSubUnit' in report['nc:Organization'])) {
        // This agency has no components, so we are done.
        return []
    }

    let agencyComponentElements = report['nc:Organization']['nc:OrganizationSubUnit']

    // Sometimes it is not an array, just a single object.
    if (!Array.isArray(agencyComponentElements)) {
        return [agencyComponentElements['nc:OrganizationAbbreviationText']['$t']]
    }

    // Otherwise assume it is an array of objects.
    return agencyComponentElements.map(element => element['nc:OrganizationAbbreviationText']['$t'])
}

function replaceAgencyComponent(report, search, replace) {

    const agencyComponentElements = report['nc:Organization']['nc:OrganizationSubUnit']
    let success = false

    // Sometimes it is not an array, just a single object.
    if (!Array.isArray(agencyComponentElements)) {
        if (agencyComponentElements['nc:OrganizationAbbreviationText']['$t'] == search) {
            agencyComponentElements['nc:OrganizationAbbreviationText']['$t'] = replace
            success = true
        }
    }
    // Otherwise assume it is an array of objects.
    else {
        for (const agencyComponentElement of agencyComponentElements) {
            if (agencyComponentElement['nc:OrganizationAbbreviationText']['$t'] == search) {
                agencyComponentElement['nc:OrganizationAbbreviationText']['$t'] = replace
                success = true
                break
            }
        }
    }

    if (!success) {
        throw 'Unable to find ' + search + ' when trying to replace it with ' + replace
    }
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

function addExpeditedProcessingSection(report) {
    const section = 'foia:ExpeditedProcessingSection'
    const sectionId = 'EP0'
    const subsection = 'foia:ExpeditedProcessing'
    const orgAssociation = 'foia:ExpeditedProcessingOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = getProcessedRequests()
        report[section][subsection]['s:id'] = sectionId
        report[section][subsection]['foia:AdjudicationWithinTenDaysQuantity'] = { '$t': 0 }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addFeeWaiverSection(report) {
    const section = 'foia:FeeWaiverSection'
    const sectionId = 'FW0'
    const subsection = 'foia:FeeWaiver'
    const orgAssociation = 'foia:FeeWaiverOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = getProcessedRequests()
        report[section][subsection]['s:id'] = sectionId
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addPersonnelAndCostSection(report) {
    const section = 'foia:PersonnelAndCostSection'
    const sectionId = 'PC1'
    const subsection = 'foia:PersonnelAndCost'
    const orgAssociation = 'foia:PersonnelAndCostOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:FullTimeEmployeeQuantity': { '$t': 0 },
            'foia:EquivalentFullTimeEmployeeQuantity': { '$t': 0 },
            'foia:TotalFullTimeStaffQuantity': { '$t': 0 },
            'foia:ProcessingCostAmount': { '$t': 0 },
            'foia:LitigationCostAmount': { '$t': 0 },
            'foia:TotalCostAmount': { '$t': 0 },
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addFeesCollectedSection(report) {
    const section = 'foia:FeesCollectedSection'
    const sectionId = 'FC1'
    const subsection = 'foia:FeesCollected'
    const orgAssociation = 'foia:FeesCollectedOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:FeesCollectedAmount': { '$t': 0 },
            'foia:FeesCollectedCostPercent': { '$t': 0 },
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addBacklogSection(report) {
    const section = 'foia:BacklogSection'
    const sectionId = 'BK1'
    const subsection = 'foia:Backlog'
    const orgAssociation = 'foia:BacklogOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = {
            's:id': sectionId,
            'foia:BackloggedRequestQuantity': { '$t': 0 },
            'foia:BackloggedAppealQuantity': { '$t': 0 },
        }
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addProcessedRequestComparisonSection(report) {
    const section = 'foia:ProcessedRequestComparisonSection'
    const sectionId = 'RPC1'
    const subsection = 'foia:ProcessingComparison'
    const orgAssociation = 'foia:ProcessingComparisonOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = getProcessedComparisons()
        report[section][subsection]['s:id'] = sectionId
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addBackloggedRequestComparisonSection(report) {
    const section = 'foia:BackloggedRequestComparisonSection'
    const sectionId = 'RBC1'
    const subsection = 'foia:BacklogComparison'
    const orgAssociation = 'foia:BacklogComparisonOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = getBacklogComparisons()
        report[section][subsection]['s:id'] = sectionId
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addProcessedAppealComparisonSection(report) {
    const section = 'foia:ProcessedAppealComparisonSection'
    const sectionId = 'APC1'
    const subsection = 'foia:ProcessingComparison'
    const orgAssociation = 'foia:PendingPerfectedRequestsOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = getProcessedComparisons()
        report[section][subsection]['s:id'] = sectionId
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function addBackloggedAppealComparisonSection(report) {
    const section = 'foia:BackloggedAppealComparisonSection'
    const sectionId = 'ABC1'
    const subsection = 'foia:BacklogComparison'
    const orgAssociation = 'foia:BacklogComparisonOrganizationAssociation'
    if (!(subsection in report[section])) {
        report[section][subsection] = getBacklogComparisons()
        report[section][subsection]['s:id'] = sectionId
        report[section][orgAssociation] = getOrgAssociation(sectionId)
    }
}

function truncateOtherDenialReasonDescriptionText(report) {
    const sections = [
        'foia:RequestDenialOtherReasonSection',
        'foia:AppealDenialOtherReasonSection',
    ]
    const subsection = 'foia:ComponentOtherDenialReason'
    const textFieldContainer = 'foia:OtherDenialReason'
    const textField = 'foia:OtherDenialReasonDescriptionText'
    for (const section of sections) {
        if (!(subsection in report[section])) {
            continue
        }
        if (Array.isArray(report[section][subsection])) {
            for (const item of report[section][subsection]) {
                truncateField(item, textFieldContainer, textField)
            }
        }
        else {
            truncateField(report[section][subsection], textFieldContainer, textField)
        }
    }
}

// ****************** HELPER FUNCTIONS **************************

// Truncate a field.
function truncateField(item, container, field) {
    if (!(container in item)) {
        return
    }
    if (!(field in item[container])) {
        return
    }
    const descriptionText = item[container][field]['$t']
    if (String(descriptionText).length > 255) {
        console.log('WARNING: the following text was removed from the XML and will need to be added later!')
        console.log(descriptionText)
        item[container][field]['$t'] = 'this-value-was-removed'
    }
}

// Get a blank object for processed comparisons.
function getProcessedComparisons() {
    return {
        'foia:ReceivedLastYearQuantity': { '$t': 0 },
        'foia:ReceivedCurrentYearQuantity': { '$t': 0 },
        'foia:ProcessedLastYearQuantity': { '$t': 0 },
        'foia:ProcessedCurrentYearQuantity': { '$t': 0 },
    }
}

// Get a blank object for backlog comparisons.
function getBacklogComparisons() {
    return {
        'foia:BacklogLastYearQuantity': { '$t': 0 },
        'foia:BacklogCurrentYearQuantity': { '$t': 0 },
    }
}

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

// Get a blank object for processed requests.
function getProcessedRequests() {
    return{
        'foia:RequestGrantedQuantity': { '$t': 0 },
        'foia:RequestDeniedQuantity': { '$t': 0 },
        'foia:AdjudicationMedianDaysValue': { '$t': 0 },
        'foia:AdjudicationAverageDaysValue': { '$t': 0 },
    }
}

module.exports = {
  getAgency,
  setAgency,
  isAgencyCentralized,
  getUnusedComponents,
  removeUnusedComponents,
  getAgencyComponents,
  replaceAgencyComponent,
  fixDocumentFiscalYearDate,
  addOldItemSections,
  addExemption3StatuteSection,
  addRequestDenialOtherReasonSection,
  addComponentAppliedExemptions,
  addAppealDenialOtherReasonSection,
  addProcessedConsultationSection,
  addAppealNonExemptionDenialSection,
  addComplexResponseTimeIncrementsSection,
  addAppealResponseTimeSection,
  addProcessedResponseTimeSection,
  addInformationGrantedResponseTimeSection,
  addSimpleResponseTimeIncrementsSection,
  addExpeditedResponseTimeIncrementsSection,
  addPendingPerfectedRequestsSection,
  addExpeditedProcessingSection,
  addFeeWaiverSection,
  addPersonnelAndCostSection,
  addFeesCollectedSection,
  addBacklogSection,
  addProcessedRequestComparisonSection,
  addBackloggedRequestComparisonSection,
  addProcessedAppealComparisonSection,
  addBackloggedAppealComparisonSection,
  truncateOtherDenialReasonDescriptionText,
}
