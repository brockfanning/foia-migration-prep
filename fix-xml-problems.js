const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
if (args.length < 1) {
    console.log('Please indicate a year. Example: node prep.js 2008')
    return
}

const replacements = {
    '<foia:DocumentFiscalYear>': '<foia:DocumentFiscalYearDate>',
    '</foia:DocumentFiscalYear>': '</foia:DocumentFiscalYearDate>',
    '<foia:Exemption3StatuteSection/>': `
        <foia:Exemption3StatuteSection>
            <foia:ReliedUponStatute s:id="ES8">
                <j:StatuteDescriptionText>N/A</j:StatuteDescriptionText>
                <foia:ReliedUponStatuteInformationWithheldText>N/A</foia:ReliedUponStatuteInformationWithheldText>
                <nc:Case>
                    <nc:CaseTitleText>N/A</nc:CaseTitleText>
                </nc:Case>
            </foia:ReliedUponStatute>
            <foia:ReliedUponStatuteOrganizationAssociation>
                <foia:ComponentDataReference s:ref="ES8"/>
                <nc:OrganizationReference s:ref="ORG0"/>
                <foia:ReliedUponStatuteQuantity>0</foia:ReliedUponStatuteQuantity>
            </foia:ReliedUponStatuteOrganizationAssociation>
        </foia:Exemption3StatuteSection>
    `,
    '<foia:RequestDenialOtherReasonSection/>': `
        <foia:RequestDenialOtherReasonSection>
            <foia:ComponentOtherDenialReason s:id="CODR8">
                <foia:OtherDenialReason>
                    <foia:OtherDenialReasonDescriptionText>N/A</foia:OtherDenialReasonDescriptionText>
                    <foia:OtherDenialReasonQuantity>0</foia:OtherDenialReasonQuantity>
                </foia:OtherDenialReason>
                <foia:ComponentOtherDenialReasonQuantity>0</foia:ComponentOtherDenialReasonQuantity>
            </foia:ComponentOtherDenialReason>
            <foia:OtherDenialReasonOrganizationAssociation>
                <foia:ComponentDataReference s:ref="CODR8"/>
                <nc:OrganizationReference s:ref="ORG0"/>
            </foia:OtherDenialReasonOrganizationAssociation>
        </foia:RequestDenialOtherReasonSection>
    `,
    '<foia:ComponentAppliedExemptions s:id="ADE1"/>': '<foia:ComponentAppliedExemptions s:id="ADE1">N/A</foia:ComponentAppliedExemptions>',
    '<foia:AppealDenialOtherReasonSection/>': `
        <foia:AppealDenialOtherReasonSection>
            <foia:ComponentOtherDenialReason s:id="ADOR8">
                <foia:OtherDenialReason>
                    <foia:OtherDenialReasonDescriptionText>N/A</foia:OtherDenialReasonDescriptionText>
                    <foia:OtherDenialReasonQuantity>0</foia:OtherDenialReasonQuantity>
                </foia:OtherDenialReason>
                <foia:ComponentOtherDenialReasonQuantity>0</foia:ComponentOtherDenialReasonQuantity>
            </foia:ComponentOtherDenialReason>
            <foia:OtherDenialReasonOrganizationAssociation>
                <foia:ComponentDataReference s:ref="ADOR8"/>
                <nc:OrganizationReference s:ref="ORG0"/>
            </foia:OtherDenialReasonOrganizationAssociation>
        </foia:AppealDenialOtherReasonSection>
    `,
    '<foia:OldestPendingItems s:id="OPA10"/>': `
        <foia:OldestPendingItems s:id="OPA10">
            <foia:OldItem>
                <foia:OldItemReceiptDate>N/A</foia:OldItemReceiptDate>
                <foia:OldItemPendingDaysQuantity>0</foia:OldItemPendingDaysQuantity>
            </foia:OldItem>
        </foia:OldestPendingItems>
    `,
    '<foia:OldestPendingItems s:id="OPR10"/>': `
        <foia:OldestPendingItems s:id="OPR10">
            <foia:OldItem>
                <foia:OldItemReceiptDate>N/A</foia:OldItemReceiptDate>
                <foia:OldItemPendingDaysQuantity>0</foia:OldItemPendingDaysQuantity>
            </foia:OldItem>
        </foia:OldestPendingItems>
    `,
    '<foia:OldestPendingItems s:id="OPC10"/>': `
        <foia:OldestPendingItems s:id="OPC10">
            <foia:OldItem>
                <foia:OldItemReceiptDate>N/A</foia:OldItemReceiptDate>
                <foia:OldItemPendingDaysQuantity>0</foia:OldItemPendingDaysQuantity>
            </foia:OldItem>
        </foia:OldestPendingItems>
    `,
}

// In some cases an element has only a footnote, but needs some boilerplate.
const addIfFootnoteOnly = {
    'foia:Exemption3StatuteSection': `
        <foia:ReliedUponStatute s:id="ES8">
            <j:StatuteDescriptionText>N/A</j:StatuteDescriptionText>
            <foia:ReliedUponStatuteInformationWithheldText>N/A</foia:ReliedUponStatuteInformationWithheldText>
            <nc:Case>
                <nc:CaseTitleText>N/A</nc:CaseTitleText>
            </nc:Case>
        </foia:ReliedUponStatute>
        <foia:ReliedUponStatuteOrganizationAssociation>
            <foia:ComponentDataReference s:ref="ES8"/>
            <nc:OrganizationReference s:ref="ORG0"/>
            <foia:ReliedUponStatuteQuantity>0</foia:ReliedUponStatuteQuantity>
        </foia:ReliedUponStatuteOrganizationAssociation>

    `
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

const files = fs.readdirSync(inputFolder)
for (const file of files) {
    const inputFilePath = path.join(inputFolder, file)
    let xml = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })

    // Perform the text replacements.
    for (var search in replacements) {
        const contains = xml.includes(search)
        if (contains) {
            // Do nothing.
        }
        else {
            //logError('Replacement string "' + search + '" was not found', file)
        }
        const replace = replacements[search]
        xml = xml.split(search).join(replace)
    }

    // Look for the footnote-only sections.
    for (var element in addIfFootnoteOnly) {
        let foo = getElements(element, xml)
        if (foo) {
            console.log(foo.length)
        }
        continue
        let openingTag = '<' + element + '>'
        let closingTag = '<\/' + element + '>'
        let tagContents = openingTag + '(.*?)' + closingTag
        let tagContentsRegex = getRegex(element)
        //let tagContentsRegex = new RegExp(tagContents, 'g')
        let results = xml.match(tagContentsRegex)
        if (results) {
            results = results.filter(value => value.includes('FootnoteText'))

            //results = results.map(value => value.repace)
        }
        if (results && results.length) {
            console.log(results.length)


        }
        //results = results.map(function (val) {
        //    //return val.replace(/<\/?b>/g, '');
        //    return val
        //});
    }
    
    let agencyAbbreviation = ''
    const abbreviationReplacements = {}

    // Get the nc:OrganizationAbbreviationText element.
    const matches = getElements('nc:OrganizationAbbreviationText', xml)
    if (!matches) {
        logError('No abbreviation element', file)
    }
    else {
        for (const match of getElements('nc:OrganizationAbbreviationText', xml)) {
            const abbreviation = getValue(match)
            // Assume the agency abbreviation is the first.
            if (agencyAbbreviation === '') {
                agencyAbbreviation = abbreviation

                if (!agencyAbbreviationExists(abbreviation)) {
                    if (!agencyFixes[abbreviation]) {
                        logError('Abbreviation not found in Drupal or in fixes: "' + abbreviation + '"', file)
                    }
                    const fixedAbbrev = agencyFixes[abbreviation]
                    const fixedMatch = match.replace(abbreviation, fixedAbbrev)
                    abbreviationReplacements[match] = fixedMatch 
                    agencyAbbreviation = fixedAbbrev
                }
            }
            else {
                if (!agencyComponentAbbreviationExists(agencyAbbreviation, abbreviation)) {
                    let fixedAbbrev = ''
                    // Try fixing common problems.
                    const trimmedAbbreviation = trimAbbreviation(abbreviation)
                    if (agencyComponentAbbreviationExists(agencyAbbreviation, trimmedAbbreviation)) {
                        fixedAbbrev = trimmedAbbreviation
                    }
                    else if (!agencyComponentAbbreviationFix(agencyAbbreviation, abbreviation)) {
                        console.log([
                            '"' + getAgencyName(agencyAbbreviation) + '"',
                            '"' + abbreviation + '"',
                            '""',
                            '"' + file + '"',
                        ].join(','))
                    }
                    else {
                        fixedAbbrev = agencyComponentAbbreviationFix(agencyAbbreviation, abbreviation)
                    }
                    if (fixedAbbrev !== '') {
                        const fixedMatch = match.replace(abbreviation, fixedAbbrev)
                        abbreviationReplacements[match] = fixedMatch
                    }
                    //logError('Abbreviation not found in Drupal: "' + abbreviation + '"', file)
                }
            }
        }
    }
 
    if (Object.keys(abbreviationReplacements).length > 0) {
        //console.log(abbreviationReplacements)
    }
    //const abbreviationElement = getElement('nc:OrganizationAbbreviationText', xml)
    //console.log(abbreviationElement)
    //const abbreviation = getValue(abbreviationElement)
    //console.log(abbreviation) 

    for (var search in abbreviationReplacements) {
        //console.log(abbreviationReplacement);
        //console.log(abbreviationReplacements[abbreviationReplacement]);
        //continue;
        const contains = xml.includes(search)
        if (contains) {
            // Do nothing.
        }
        else {
            logError('Replacement string "' + search + '" was not found', file)
        }
        const replace = abbreviationReplacements[search]
        xml = xml.split(search).join(escapeXml(replace))
    }

    const outputFilePath = path.join(outputFolder, file)
    fs.writeFileSync(outputFilePath, xml)
}

function escapeXml(unsafe) {
    return unsafe.replace(/&/g, '&amp;');
}

// Given the full XML of a single element, get the value of that element.
function getValue(element) {
    return element.substring(
        element.indexOf('>') + 1,
        element.indexOf('</')
    )
}

// Given an element name, get an array of objects, each containing the full
// string of the element and its contents.
function getElements(elementName, contents) {
    return contents.match(getRegex(elementName))
}

// Get a regex to find an XML tag.
function getRegex(elementName) {
    return new RegExp('<\s*' + elementName + '[^>]*>([^<]*)<\s*/\s*' + elementName + '>', 'g')
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

// Error logging.
function logError(message, file) {
  console.log(message + ' (' + file + ')')
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

// Get a fix for an agency component abbreviation.
function agencyComponentAbbreviationFix(agencyAbbreviation, incorrectComponentAbbreviation) {
  // To make the fix mapping cleaner, assume that they will be fixed according to the
  // trimAbbreviation function. (No "&amp;" and no parentheses.)
  incorrectComponentAbbreviation = trimAbbreviation(incorrectComponentAbbreviation)
  if (!agencyComponentFixes[agencyAbbreviation]) {
    return false
  }
  if (!agencyComponentFixes[agencyAbbreviation][incorrectComponentAbbreviation]) {
    return false
  }
  const fix = agencyComponentFixes[agencyAbbreviation][incorrectComponentAbbreviation]
  // Before returning the fix, make sure it is valid.
  if (!agencyComponentAbbreviationExists(agencyAbbreviation, fix)) {
    console.log('Fixed abbreviation did not actual exist: "' + incorrectComponentAbbreviation + '"=>"' + fix + '"')
    return false
  }
  return fix
}

// Get an agency name from abbreviation.
function getAgencyName(agencyAbbreviation) {
    const matches = drupalAgencies.filter(agency => {
        return agency.field_agency_abbreviation === agencyAbbreviation
    })
    if (matches.length < 1) {
        console.log('Error, could not find agency ' + agencyAbbreviation)
    }
    return matches[0].name
}
