'use strict';

const fs = require('fs');
const getProjectType = require('./get-project-type');
const getPackageVersion = require('./get-package-version');
const getVersions = require('./get-versions');
const getProjectVersion = require('./get-project-version');
const getTagVersion = require('./get-tag-version');
const getRemoteUrl = require('./get-remote-url');
const mergePackageJson = require('merge-package.json');
const gitDiffApply = require('git-diff-apply');
const semver = require('semver');
const run = require('./run');
const utils = require('./utils');

const modulesCodemodVersion = '2.16.0-beta.1';

module.exports = function emberCliUpdate(options) {
  let from = options.from;
  let to = options.to;
  let ignoreConflicts = options.ignoreConflicts;

  let projectType;

  try {
    projectType = getProjectType('.');
  } catch (err) {
    return Promise.reject(err);
  }

  let packageVersion;

  try {
    packageVersion = getPackageVersion('.', projectType);
  } catch (err) {
    return Promise.reject(err);
  }

  let versions = getVersions(projectType);

  let startVersion = from;
  if (!startVersion) {
    try {
      startVersion = getProjectVersion(packageVersion, versions, projectType);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  let endVersion = getTagVersion(to, versions, projectType);

  let remoteUrl = getRemoteUrl(projectType);

  let startTag = `v${startVersion}`;
  let endTag = `v${endVersion}`;

  return gitDiffApply({
    remoteUrl,
    startTag,
    endTag,
    ignoreConflicts,
    ignoredFiles: ['package.json']
  }).then(results => {
    let myPackageJson = fs.readFileSync('package.json', 'utf8');
    let fromPackageJson = results.from['package.json'];
    let toPackageJson = results.to['package.json'];

    let newPackageJson = mergePackageJson(myPackageJson, fromPackageJson, toPackageJson);

    fs.writeFileSync('package.json', newPackageJson);

    run('git add package.json');

    if (ignoreConflicts) {
      let hasConflicts = run('git status --porcelain').match(/^\S{2} /m);
      if (hasConflicts) {
        return;
      }
    }

    let shouldRunModulesCodemod =
      semver.lt(startVersion, modulesCodemodVersion) &&
      semver.gte(endVersion, modulesCodemodVersion) &&
      projectType !== 'glimmer';

    if (shouldRunModulesCodemod) {
      return utils.runCodemods();
    }
  });
};
