/// <reference types="cypress" />

// @ts-check
const debug = require('debug')('cypress-testrail-simple-upgraded')
const got = require('got')
const {
  hasConfig,
  getTestRailConfig,
  getAuthorization,
  getTestRunId,
} = require('../src/get-config')

async function sendTestResults(testRailInfo, runId, testResults) {
  debug(
    'sending %d test results to TestRail for run %d',
    testResults.length,
    runId,
  )
  const addResultsUrl = `${testRailInfo.host}/index.php?/api/v2/add_results_for_cases/${runId}`
  const authorization = getAuthorization(testRailInfo)

  // @ts-ignore
  const json = await got(addResultsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization,
    },
    json: {
      results: testResults,
    },
  }).json()

  debug('TestRail response: %o', json)
}

/**
 * Registers the cypress-testrail-simple-upgraded plugin.
 * @example
 *  module.exports = (on, config) => {
 *   require('cypress-testrail-simple-upgraded/src/plugin')(on)
 *  }
 * @example
 *  Skip the plugin
 *  module.exports = (on, config) => {
 *   require('cypress-testrail-simple-upgraded/src/plugin')(on, true)
 *  }
 * @param {Cypress.PluginEvents} on Event registration function from Cypress
 * @param {Boolean} skipPlugin If true, skips loading the plugin. Defaults to false
 */
function registerPlugin(on, skipPlugin = false) {
  if (skipPlugin === true) {
    debug('the user explicitly disabled the plugin')
    return
  }

  if (!hasConfig(process.env)) {
    debug('cypress-testrail-simple-upgraded env variables are not set')
    return
  }

  const testRailInfo = getTestRailConfig()
  const runId = getTestRunId()
  if (!runId) {
    throw new Error('Missing test rail run ID')
  }

  // should we ignore test results if running in the interactive mode?
  // right now these callbacks only happen in the non-interactive mode

  // https://on.cypress.io/after-spec-api
  on('after:spec', (spec, results) => {
    debug('after:spec')
    debug(spec)
    debug(results)

    // find only the tests with TestRail case id in the test name
    const testRailResults = []
    results.tests.forEach((result) => {
      const testRailCaseReg = /C(\d+)\s/
      // only look at the test name, not at the suite titles
      const testName = result.title[result.title.length - 1]
      if (testRailCaseReg.test(testName) && result.state != 'pending') {
          // TestRail status
          // Passed = 1,
          // Blocked = 2,
          // Untested = 3,
          // Retest = 4,
          // Failed = 5,
          // TODO: map all Cypress test states into TestRail status
          // https://glebbahmutov.com/blog/cypress-test-statuses/

        let testrail_status;
        
        switch (result.state) {
          case 'passed':
            testrail_status = 1;
            break;
          case 'failed':
            testrail_status = 5;
            break;
          case 'skipped':
            testrail_status = 2;
            break;
        }
        
        const testRailResult = {
          case_id: parseInt(testRailCaseReg.exec(testName)[1]),

          status_id: testrail_status,
        }
        testRailResults.push(testRailResult)
      }
    })
    if (testRailResults.length) {
      console.log('TestRail results in %s', spec.relative)
      console.table(testRailResults)
      return sendTestResults(testRailInfo, runId, testRailResults)
    }
  })
}

module.exports = registerPlugin
