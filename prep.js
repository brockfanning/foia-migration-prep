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
            console.log('The string "' + search + '" was not found in ' + inputFilePath + '.')
        }
        const replace = replacements[search]
        xml = xml.split(search).join(replace)
    }
    
    // Get the nc:OrganizationAbbreviationText element.
    const abbreviationElement = getElement('nc:OrganizationAbbreviationText', xml)
    console.log(abbreviationElement)
    const abbreviation = getValue(abbreviationElement)
    console.log(abbreviation) 

    const outputFilePath = path.join(outputFolder, file)
    //fs.writeFileSync(outputFilePath, xml)
}

// Given a huge chunk of XML, get the full XML of a single unique element.
function getElement(elementName, contents) {
    const open = '<' + elementName + '>'
    const close = '</' + elementName + '>'

    // Confirm that the element is unique.
    const parts = contents.split(open)
    if (parts.length > 2) {
      console.log('Warning - ' + elementName + ' is not a unique element!')
    }

    const inner = contents.substring(
        contents.lastIndexOf(open) + open.length,
        contents.lastIndexOf(close)
    )
    const outer = open + inner + close
    // Safety check.
    if (!contents.includes(outer)) {
        console.log('Oops.')
    }
    return outer
}

// Given the full XML of a single element, get the value of that element.
function getValue(element) {
    const inner = element.substring(
        element.indexOf('>') + 1,
        element.indexOf('</')
    )
    return inner
}
