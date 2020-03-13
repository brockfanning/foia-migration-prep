const path = require('path')
const fs = require('fs')

const drupal = require('./helpers/drupal')

const agencies = [...new Set(drupal.getAgencies().map(item => item.field_agency_abbreviation))]

for (const agency of agencies) {
  const components = drupal.getAgencyComponentsForAgency(agency)
  // Is there a duplicate?
  const dupe = (new Set(components).size !== components.length)
  if (dupe) {
    console.log('There are duplicate components in ' + agency)
    console.log(components.sort())
  }
}