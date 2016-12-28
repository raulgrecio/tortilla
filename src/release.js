var Fs = require('fs-extra');
var Path = require('path');
var Git = require('./git');
var Paths = require('./paths');
var Utils = require('./utils');

/*
  The 'release' module contains different utilities and methods which are responsible
  for release management. Before invoking any method, be sure to fetch **all** the step
  tags from the git-host, since most calculations are based on them.
 */

// Creates a bumped release tag of the provided type
// e.g. if the current release is @1.0.0 and we provide this function with a release type
// of 'patch', the new release would be @1.0.1
function bumpRelease(releaseType, options) {
  options = options || {};
  var currentRelease = getCurrentRelease();

  // Increase release type
  switch (releaseType) {
    case 'major':
      currentRelease.major++;
      currentRelease.minor = 0;
      currentRelease.patch = 0;
      break;
    case 'minor':
      currentRelease.minor++;
      currentRelease.patch = 0;
      break;
    case 'patch':
      currentRelease.patch++;
      break;
    default:
      throw Error('Provided release type must be one of "major", "minor" or "patch"');
  }

  // The formatted release e.g. '1.0.0'
  var formattedRelease = formatRelease(currentRelease);

  var superTags = Git(['tag', '-l', 'step*'])
    // Put tags into an array
    .split('\n')
    // If no tags found, filter the empty string
    .filter(Boolean)
    // We want to avoid release tags e.g. 'step1@@1.0.0'
    .filter(function (tagName) {
      return tagName.match(/^step\d+$/);
    });

  Git(['tag', 'root@' + formattedRelease, 'root']);

  superTags.forEach(function (superTag) {
    Git(['tag', superTag + '@' + formattedRelease, superTag]);
  });

  // Create a tag with the provided message which will reference to HEAD
  // e.g. 'release@1.0.0'
  if (options.message)
    Git.print(['tag', 'release@' + formattedRelease, 'HEAD', '-m', options.message]);
  // If no message provided, open the editor
  else
    Git.print(['tag', 'release@' + formattedRelease, 'HEAD', '-a']);

  console.log(formattedRelease);
}

// Gets the current release based on the latest release tag
// e.g. if we have the tags 'release@0.0.1', 'release@0.0.2' and 'release@0.1.0' this method
// will return { major: 0, minor: 1, patch: 0 }
function getCurrentRelease() {
  var releases = Git(['tag', '-l', 'release*'])
    // Put tags into an array
    .split('\n')
    // If no tags found, filter the empty string
    .filter(Boolean)
    // Filter all the release tags which are proceeded by their release
    .filter(function (tagName) {
      return tagName.match(/^release@/);
    })
    // Map all the release strings
    .map(function (tagName) {
      return tagName.match(/^release@(.+)$/)[1];
    })
    // Deformat all the releases into a json so it would be more comfortable to work with
    .map(function (releaseString) {
      return deformatRelease(releaseString);
    })
    // Put the latest release first
    .sort(function (a, b) {
      return (
        (b.major - a.major) ||
        (b.minor - a.minor) ||
        (b.patch - a.patch)
      );
    });

  // If release was yet to be released, assume this is a null release
  return releases[0] || {
    major: 0,
    minor: 0,
    patch: 0
  };
}

// Invokes 'git diff' with the given releases. An additional arguments vector which will
// be invoked as is may be provided
function diffRelease(sourceRelease, destinationRelease, argv) {
  argv = argv || [];

  var sourceTag = 'release@' + sourceRelease;
  var destinationTag = 'release@' + destinationRelease;

  // Get the root commit hash for each release tag
  var sourceRootHash = Git(['rev-list', '--max-parents=0', sourceTag]);
  var destinationRootHash = Git(['rev-list', '--max-parents=0', destinationTag]);

  // If they have the same root, there shouldn't be any problems with 'diff'
  if (sourceRootHash == destinationRootHash) {
    return Git.print(['diff', sourceTag, destinationTag].concat(argv));
  }

  // The 'registers' are directories which will be used for temporary FS calculations
  var register1Dir = '/tmp/tortilla_register1';
  var register2Dir = '/tmp/tortilla_register2';
  var register1Paths = Paths.resolve(register1Dir);
  var register2Paths = Paths.resolve(register2Dir);

  // Make sure they are not exist before proceeding
  Fs.removeSync(register1Dir);
  Fs.removeSync(register2Dir);
  Fs.mkdirSync(register1Dir);
  Fs.mkdirSync(register2Dir);

  // Initialize an empty git repo in register2
  Git(['init'], { cwd: register2Dir });

  // Put all source release files in register1
  Fs.copySync(Paths.git._, register1Paths.git._, {
    filter: function (filePath) {
      return filePath.split('/').indexOf('.tortilla') == -1;
    }
  });

  Git(['checkout', sourceTag], { cwd: register1Dir });
  Git(['checkout', '.'], { cwd: register1Dir });

  Fs.removeSync(register1Paths.git._);

  // Copy all files from register1 to register2 and create a new commit
  Fs.copySync(register1Dir, register2Dir);

  Git(['add', '.'], { cwd: register2Dir });
  Git(['add', '-u'], { cwd: register2Dir });
  Git(['commit', '-m', 'Release ' + sourceRelease], { cwd: register2Dir });

  // Repeat the same process but for destination release
  Fs.removeSync(register1Dir);
  Fs.mkdirSync(register1Dir);

  Fs.copySync(Paths.git._, register1Paths.git._, {
    filter: function (filePath) {
      return filePath.split('/').indexOf('.tortilla') == -1;
    }
  });

  Git(['checkout', destinationTag], { cwd: register1Dir });
  Git(['checkout', '.'], { cwd: register1Dir });

  // Copy register1 git essentials to register2
  Fs.removeSync(register1Paths.git._);
  Fs.copySync(register2Paths.git._, register1Paths.git._);

  // Add a new commit on top of the 'register1' base
  Git(['add', '.'], { cwd: register1Dir });
  Git(['add', '-u'], { cwd: register1Dir });
  Git(['commit', '-m', 'Release ' + destinationRelease], { cwd: register1Dir });

  // Run 'diff' between the newly created commits
  Git.print(['diff', 'HEAD^', 'HEAD'].concat(argv), { cwd: register1Dir });

  // Clean registers to optimize memory usage
  Fs.removeSync(register1Dir);
  Fs.removeSync(register2Dir);
}

// Takes a release json and puts it into a pretty string
// e.g. { major: 1, minor: 1, patch: 1 } -> '1.1.1'
function formatRelease(releaseJson) {
  return [
    releaseJson.major,
    releaseJson.minor,
    releaseJson.patch
  ].join('.');
}

// Takes a release string and puts it into a pretty json object
// e.g. '1.1.1' -> { major: 1, minor: 1, patch: 1 }
function deformatRelease(releaseString) {
  var releaseSlices = releaseString.split('.').map(Number);

  return {
    major: releaseSlices[0],
    minor: releaseSlices[1],
    patch: releaseSlices[2]
  };
}


module.exports = {
  bump: bumpRelease,
  current: getCurrentRelease,
  diff: diffRelease,
  format: formatRelease,
  deformat: deformatRelease
};