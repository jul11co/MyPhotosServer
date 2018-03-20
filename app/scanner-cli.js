#!/usr/bin/env node

var async = require('async');
var fs = require('fs');
var path = require('path');

var Scanner = require('./scanner');
var utils = require('./utils');

function printUsage() {
  console.log('Usage: myphotos-scanner [OPTIONS] <DIRECTORY>');
  console.log('');
  console.log('OPTIONS:');
  console.log('  --photo                      : scan photos (*.jpg, *.jpeg, *.png, *.gif files)');
  console.log('');
  console.log('  --photo-auto-collection      : automatically create collection (from folder name)');
  console.log('  --photo-collection-name=NAME : import to specific collection');
  console.log('');
  console.log('  --photo-min-width=NUMBER     : filter photos');
  console.log('  --photo-min-height=NUMBER    : filter photos');
  console.log('');
  console.log('  --no-thumbnails              : do not generate thumbnails');
  console.log('');
  console.log('  --recusive, -r               : scan sub-folders');
  console.log('  --relative-path              : save scan information as relative paths');
  console.log('');
  console.log('  --rescan                     : retrieve information from already scanned files');
  console.log('  --force-update               : override previous added information');
  console.log('');
  console.log('  --data-dir=DATA_DIRECTORY    : specify MyPhotosServer\'s data directory');
  console.log('  --host=HOST_URL              : specify which MyPhotosServer will connect to');
  console.log('  --threads=NUMBER             : set default number of import threads (default: number of CPU cores)');
  console.log('');
}

var argv = [];
var options = {};
for (var i = 2; i < process.argv.length; i++) {
  if (process.argv[i] == '--photo') {
    options.photo = true;
  } else if (process.argv[i] == '--errors') {
    options.ignore_errors = false;
  } else if (process.argv[i] == '--recursive' || process.argv[i] == '-r') {
    options.recursive = true;
  } else if (process.argv[i].indexOf('--') == 0) {
    var arg = process.argv[i];
    if (arg.indexOf("=") > 0) {
      var arg_kv = arg.split('=');
      arg = arg_kv[0];
      arg = arg.replace('--','');
      arg = utils.replaceAll(arg, '-', '_');
      options[arg] = arg_kv[1];
    } else {
      arg = arg.replace('--','');
      arg = utils.replaceAll(arg, '-', '_');
      options[arg] = true;
    }
  } else {
    argv.push(process.argv[i]);
  }
}

if (typeof options.ignore_errors == 'undefined') {
  options.ignore_errors = true;
}

if (options.photo_min_width) {
  options.photo_min_width = parseInt(options.photo_min_width);
} else {
  options.photo_min_width = 200;
}
if (options.photo_min_height) {
  options.photo_min_height = parseInt(options.photo_min_height);
} else {
  options.photo_min_height = 200;
}
if (options.threads) {
  options.threads = parseInt(options.threads);
} else {
  options.threads = require('os').cpus().length;
}

if (options.verbose) { console.log(options); }

if (!argv[0]) {
  printUsage();
  process.exit();
}

if (options.host) {
  var importer = require('./importer');
  console.log('MyPhotosServer host:', options.host);
  importer.setDefaultHost(options.host);
}

var INPUT_DIR = argv[0];
INPUT_DIR = path.resolve(INPUT_DIR);
console.log('Input dir: ' + INPUT_DIR);

if (options.data_dir) {
  console.log('Data dir: ' + options.data_dir);
}

var processReport = function(event, data) {
  if (options.fork && process.send) {
    process.send({
      event: event,
      data: data
    });
  }
}

var scanner = new Scanner(options);

scanner.on('started', function() {
  if (options.verbose) console.log('Scanner started');
  processReport('started');
});
scanner.on('progress', function(data) {
  // console.log('Scanner progress: ' + data.current + '/' + data.total);
  // console.log(data.file.path);
  processReport('progress', data);
});
scanner.on('imported', function(data) {
  if (options.verbose) console.log('Scanner imported: ' + data.type);
  processReport('imported', data);
});
scanner.on('stopped', function(err, data) {
  if (options.verbose) {
    console.log('Scanner stopped');
    console.log(data.dirs + ' directories, ' + data.files + ' files.');
    console.log(data.imported + ' imported.');
    if (data.errors.length) {
      console.log(data.errors + ' errors.');
      data.errors.forEach(function(error) {
        console.log(error);
      });
    } else {
      console.log('Done. No errors.');
    }
  }
  if (err) data.err = err;
  processReport('stopped', data);
  setTimeout(function() {process.exit(0);},2000);
});
scanner.scan(INPUT_DIR, options);

if (options.fork && process.on) {
  process.on('message', function(data) {
    if (data.exit) {
      scanner.stopScan();
      setTimeout(function() {process.exit(0);},2000);
    }
  });
}
