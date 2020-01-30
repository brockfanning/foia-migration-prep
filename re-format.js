const path = require('path')
const fs = require('fs')
const xmlFormatter = require('xml-formatter');
const years = ['2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018']

for (const year of years) {

    const inputFolder = path.join('input', year)
    const outputFolder = path.join('output', year)
    const files = fs.readdirSync(inputFolder)
    const options = { lineSeparator: '\n' }
    for (const file of files) {
        const inputFilePath = path.join(inputFolder, file)
        let xml = fs.readFileSync(inputFilePath, { encoding: 'utf-8' })
        xml = xmlFormatter(xml, options)
        const outputFilePath = path.join(outputFolder, file)
        fs.writeFileSync(outputFilePath, xml)
    }
}

