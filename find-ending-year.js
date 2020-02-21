const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)
if (args.length < 1) {
    console.log('Please indicate a year. Example: node prep.js 2008')
    return
}

console.log('title,end_year')

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

const inputYear = args[0]
const inputFolder = path.join('input', inputYear)

const files = fs.readdirSync(inputFolder)
for (const file of files) {
    const inputFilePath = path.join(inputFolder, file)
    let xml = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
    
    let agencyAbbreviation = ''
    let hasAgencyComponents = false
    let abbrevToSearch = ''
    let alternateAbbrevToSearch = ''

    // Get the nc:OrganizationAbbreviationText element.
    const matches = getElements('nc:OrganizationAbbreviationText', xml)
    if (!matches) {
        logError('No abbreviation element', file)
    }
    else {
        for (const match of matches) {
            const abbreviation = getValue(match)
            // Assume the agency abbreviation is the first.
            if (agencyAbbreviation === '') {
                agencyAbbreviation = abbreviation

                if (!agencyAbbreviationExists(abbreviation)) {
                    if (!agencyFixes[abbreviation]) {
                        logError('Abbreviation not found in Drupal or in fixes: "' + abbreviation + '"', file)
                    }
                    const fixedAbbrev = agencyFixes[abbreviation]
                    agencyAbbreviation = fixedAbbrev
                }
                abbrevToSearch = agencyAbbreviation
                alternateAbbrevToSearch = abbreviation
            }
            else {
                hasAgencyComponents = true
                let componentAbbrev = abbreviation
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
                        componentAbbrev = fixedAbbrev
                    }
                }
                findLastYear(inputYear, componentAbbrev, abbreviation)
            }
        }
    }

    if (hasAgencyComponents == false) {
        findLastYear(inputYear, abbrevToSearch, alternateAbbrevToSearch)
    }
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

// Get an agency component name from abbreviation.
function getAgencyComponentName(agencyComponentAbbreviation) {
    const matches = drupalComponents.filter(agencyComponent => {
        return agencyComponent.field_agency_comp_abbreviation === agencyComponentAbbreviation
    })
    if (matches.length < 1) {
        return false
    }
    return matches[0].title
}

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