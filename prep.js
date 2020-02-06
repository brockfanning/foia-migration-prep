const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
if (args.length < 1) {
  console.log('Please indicate a year. Example: node prep.js 2008')
  return
}

const replacements = {
  '<foia:DocumentFiscalYear>': '<foia:DocumentFiscalYearDate>',
  '</foia:DocumentFiscalYear>': '</foia:DocumentFiscalYearDate>'
}

const drupalAgencies = JSON.parse(fs.readFileSync('drupal-agencies.json', { encoding: 'utf-8' }))
const drupalComponents = JSON.parse(fs.readFileSync('drupal-agency-components.json', { encoding: 'utf-8' }))
const agencyFixes = JSON.parse(fs.readFileSync('xml-agency-fixes.json', { encoding: 'utf-8' }))
const agencyComponentFixes = JSON.parse(fs.readFileSync('xml-agency-component-fixes.json', { encoding: 'utf-8' }))

const year = args[0]
const inputFolder = path.join('input', year)
const outputFolder = path.join('output', year)

const files = fs.readdirSync(inputFolder)
for (const file of files) {
    const inputFilePath = path.join(inputFolder, file)
    let xml = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
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

    const outputFilePath = path.join(outputFolder, file)
    //fs.writeFileSync(outputFilePath, xml)
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
