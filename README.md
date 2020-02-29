# FOIA annual report migration prep

This code is to prepare the XML files for past FOIA Annual Reports to be imported into Drupal.

## Check for missing agency/component abbreviations

Use the `check-abbreviations` script with a particular year, like so:

`node check-abbreviations.js 2008`

## Look for end-years for agency components

Use the `calculate-end-year` script with a particular year, like so:

`node calculate-end-year.js 2008`

## Fix the XML files

Use the `fix-reports` script with a particular year, like so:

`node fix-reports.js 2008`

The results will be updated in the `output` folder. For debugging purposes, an indented version is created in the `formatted` folder, but these files are not suitable for uploading to Drupal.
